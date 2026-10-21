/**
 * Event store + projections. Every write goes through `append()`, which runs in one
 * IndexedDB transaction: the event is logged, the timer projection is folded, and a
 * finished timer becomes a Session — all-or-nothing, so a crash mid-write can't leave
 * half a session behind.
 */
import { applyEvent, foldTimers, toSession, type PendingEvent } from '@/engine/timer';
import { summarizeDay } from '@/engine/stats';
import { localDay, tzNow, uid } from '@/engine/time';
import type { AnyEvent, ManualSessionPayload, Session, TimerState } from '@/engine/types';
import { db } from './schema';

// Serialise writers so two quick taps can't interleave folds.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export interface AppendResult {
  events: AnyEvent[];
  timers: TimerState[];
  finished: Session[];
}

/** Append events (stamped with tz) and update projections atomically. */
export function append(pending: PendingEvent[]): Promise<AppendResult> {
  return serial(() =>
    db.transaction('rw', [db.events, db.timers, db.sessions, db.daily, db.tasks], async () => {
      const events: AnyEvent[] = [];
      const touched = new Map<string, TimerState>();
      const finished: Session[] = [];
      const days = new Set<string>();

      for (const p of pending) {
        const e = { ...p, tz: p.tz ?? tzNow(p.ts) } as AnyEvent;
        e.id = await db.events.add(e);
        events.push(e);

        if (e.type === 'session.manual') {
          const s = manualToSession(e.data, e.tz);
          await db.sessions.put(s);
          days.add(s.day);
          continue;
        }
        if (e.type === 'session.edit' || e.type === 'session.delete' || e.type === 'session.restore') {
          const s = await db.sessions.get(e.data.sessionId);
          if (!s) continue;
          const next: Session =
            e.type === 'session.edit' ? { ...s, ...e.data.patch } : { ...s, deleted: e.type === 'session.delete' };
          await db.sessions.put(next);
          days.add(s.day);
          continue;
        }
        if (e.type === 'task.done') {
          await db.tasks.update(e.data.taskId, { done: e.data.done, doneAt: e.data.done ? e.ts : undefined });
          continue;
        }
        if (!e.timerId) continue;

        const prev = touched.get(e.timerId) ?? (await db.timers.get(e.timerId)) ?? null;
        // A note on an already-finished session updates the session record directly.
        if (!prev && e.type === 'timer.note') {
          const s = await db.sessions.get(e.timerId);
          if (s) {
            await db.sessions.put({ ...s, ...(e.data.note !== undefined ? { note: e.data.note } : {}), ...(e.data.mood ? { mood: e.data.mood } : {}) });
            days.add(s.day);
          }
          continue;
        }
        const next = applyEvent(prev, e);
        if (!next) continue;
        touched.set(e.timerId, next);

        if (next.status === 'done' && prev?.status !== 'done') {
          const session = toSession(next);
          if (session) {
            await db.sessions.put(session);
            finished.push(session);
            days.add(session.day);
            if (next.taskId && next.phase === 'focus' && (next.endReason === 'complete' || next.endReason === 'early'))
              await db.tasks.update(next.taskId, { done: true, doneAt: e.ts });
          }
        }
      }

      for (const t of touched.values()) {
        if (t.status === 'done') await db.timers.delete(t.id);
        else await db.timers.put(t);
      }
      for (const day of days) await recomputeDay(day);
      return { events, timers: [...touched.values()], finished };
    }),
  );
}

export function manualToSession(p: ManualSessionPayload, tz: number): Session {
  return {
    id: p.sessionId,
    start: p.start,
    end: p.end,
    tz,
    day: localDay(p.start, tz),
    phase: p.phase,
    label: p.label,
    boardId: p.boardId,
    note: p.note,
    plannedMs: 0,
    actualMs: p.durationMs,
    timedMs: 0,
    recoveredMs: p.durationMs,
    pausedMs: 0,
    overtimeMs: 0,
    source: 'manual',
    bulk: p.kind === 'bulk' || undefined,
    createdAt: Date.now(),
  };
}

export async function recomputeDay(day: string): Promise<void> {
  const sessions = await db.sessions.where('day').equals(day).toArray();
  const sum = summarizeDay(day, sessions);
  if (sum.sessions === 0 && sum.breakMs === 0) await db.daily.delete(day);
  else await db.daily.put(sum);
}

export async function recomputeAllDays(): Promise<void> {
  const days = new Set<string>();
  await db.sessions.each((s) => void days.add(s.day));
  await db.daily.clear();
  for (const d of days) await recomputeDay(d);
}

export const getActiveTimers = () => db.timers.toArray();

/** Add a session by hand: a past entry, a bulk lump, or a claimed timeline gap. */
export async function addManualSession(p: Omit<ManualSessionPayload, 'sessionId'>): Promise<string> {
  const sessionId = uid('man');
  await append([{ type: 'session.manual', ts: Date.now(), data: { ...p, sessionId } } as PendingEvent]);
  return sessionId;
}

export const editSession = (sessionId: string, patch: Partial<Pick<Session, 'label' | 'boardId' | 'note' | 'mood'>>) =>
  append([{ type: 'session.edit', ts: Date.now(), data: { sessionId, patch } } as PendingEvent]);

/** Soft delete: the log keeps everything; "Undo" restores it. */
export const deleteSession = (sessionId: string) => append([{ type: 'session.delete', ts: Date.now(), data: { sessionId } } as PendingEvent]);
export const restoreSession = (sessionId: string) => append([{ type: 'session.restore', ts: Date.now(), data: { sessionId } } as PendingEvent]);

export const logAppEvent = (type: 'app.open' | 'app.resume' | 'app.background', data: Record<string, unknown> = {}) =>
  append([{ type, ts: Date.now(), data } as PendingEvent]);

/**
 * Disaster recovery: rebuild every timer-derived and manual session plus active timers
 * from the append-only log. Imported sessions (stored directly) are left untouched.
 */
export async function rebuildFromLog(): Promise<{ sessions: number; active: number }> {
  return serial(() =>
    db.transaction('rw', [db.events, db.timers, db.sessions, db.daily], async () => {
      const events = await db.events.orderBy('ts').toArray();
      const timers = foldTimers(events);
      const sessions: Session[] = [];
      for (const t of timers.values()) {
        const s = toSession(t);
        if (s) sessions.push(s);
      }
      const manual = new Map<string, Session>();
      for (const e of events) {
        if (e.type === 'session.manual') manual.set(e.data.sessionId, manualToSession(e.data, e.tz));
      }
      const all = [...sessions, ...manual.values()];
      const byId = new Map(all.map((s) => [s.id, s]));
      for (const e of events) {
        if (e.type !== 'session.edit' && e.type !== 'session.delete' && e.type !== 'session.restore') continue;
        const s = byId.get(e.data.sessionId);
        if (!s) continue;
        if (e.type === 'session.edit') Object.assign(s, e.data.patch);
        else s.deleted = e.type === 'session.delete';
      }
      await db.sessions.where('source').anyOf('timed', 'adjusted', 'manual').delete();
      await db.sessions.bulkPut(all);
      await db.timers.clear();
      const active = [...timers.values()].filter((t) => t.status !== 'done');
      await db.timers.bulkPut(active);
      await recomputeAllDays();
      return { sessions: all.length, active: active.length };
    }),
  );
}
