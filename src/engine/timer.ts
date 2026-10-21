/**
 * Gentle Flow timer engine: pure functions, no I/O, no clocks.
 *
 * Time is never "ticked". A timer is a list of run segments [start, end] measured in
 * wall-clock timestamps, plus explicitly-labelled recovered time. The remaining time at
 * any instant is computed from those numbers, so a sleeping tab, a dozing phone or a
 * minimised window can never lose or drift a single second.
 */
import { localDay } from './time';
import type {
  AnyEvent,
  EventMap,
  LogEvent,
  Session,
  TimerSnapshot,
  TimerState,
} from './types';

/** An alarm firing more than this long after its due time is "late" (you were away). */
export const LATE_ALARM_MS = 60_000;

export function startTimer(e: LogEvent<'timer.start'>): TimerState {
  const d = e.data;
  return {
    id: e.timerId!,
    mode: d.mode,
    overtime: d.overtime,
    phase: d.phase,
    plannedMs: Math.max(0, d.plannedMs),
    nudgedMs: 0,
    backfillMs: 0,
    backdatedMs: Math.max(0, d.backdateMs ?? 0),
    createdAt: e.ts,
    createdTz: e.tz,
    runs: [[e.ts, null]],
    status: 'running',
    alarmAt: null,
    alarmLate: false,
    endedAt: null,
    endReason: null,
    label: d.label,
    boardId: d.boardId,
    taskId: d.taskId,
    soundId: d.soundId,
    presetId: d.presetId,
    round: d.round,
    auto: d.auto,
    updatedAt: e.ts,
  };
}

/** Measured (timer-verified) time up to instant `t`. */
export function timedAt(s: TimerState, t: number): number {
  let sum = 0;
  for (const [a, b] of s.runs) {
    const end = Math.min(b ?? t, t);
    if (end > a) sum += end - a;
  }
  return sum;
}

export const recovered = (s: TimerState) => s.backdatedMs + s.backfillMs;
export const targetOf = (s: TimerState) => (s.plannedMs > 0 ? s.plannedMs + s.nudgedMs : 0);
export const totalAt = (s: TimerState, t: number) => timedAt(s, t) + recovered(s);

function openRun(s: TimerState): [number, number | null] | undefined {
  const last = s.runs[s.runs.length - 1];
  return last && last[1] === null ? last : undefined;
}

function closeRun(s: TimerState, ts: number): TimerState['runs'] {
  return s.runs.map((r) => (r[1] === null ? [r[0], Math.max(r[0], ts)] : r));
}

/**
 * Fold one event into a timer. Returns the same object when the event does not apply
 * (wrong state, already finished): folding is total and never throws, so a corrupted
 * or duplicated log entry can't wedge the app.
 */
export function applyEvent(s: TimerState | null, e: AnyEvent): TimerState | null {
  if (e.type === 'timer.start') return s ?? startTimer(e);
  if (!s || s.status === 'done') {
    // Notes/moods may still be attached after a timer has ended.
    if (s && e.type === 'timer.note') return { ...s, ...pickNote(e.data) };
    return s;
  }
  const ts = e.ts;
  const base = { ...s, updatedAt: Math.max(s.updatedAt, ts) };

  switch (e.type) {
    case 'timer.pause':
      if (s.status !== 'running') return s;
      return { ...base, status: 'paused', runs: closeRun(s, ts) };

    case 'timer.resume':
      if (s.status !== 'paused') return s;
      return { ...base, status: 'running', runs: [...s.runs, [ts, null]] };

    case 'timer.nudge': {
      const next = { ...base, nudgedMs: Math.max(-s.plannedMs, s.nudgedMs + e.data.ms) };
      // Extending past the current total re-arms the alarm (e.g. +5 while in overtime).
      if (next.alarmAt !== null && targetOf(next) > totalAt(next, ts)) {
        next.alarmAt = null;
        next.alarmLate = false;
      }
      return next;
    }

    case 'timer.backfill': {
      const next = { ...base, backfillMs: Math.max(0, s.backfillMs + e.data.ms) };
      if (next.alarmAt !== null && targetOf(next) > totalAt(next, ts)) next.alarmAt = null;
      return next;
    }

    case 'timer.overtime': {
      if (s.mode === 'countdown') return { ...base, overtime: e.data.on };
      // Count-up: Overtime sets a soft goal; time beyond it is highlighted overtime.
      if (!e.data.on) return { ...base, overtime: false, plannedMs: 0, nudgedMs: 0, alarmAt: null };
      const soft = Math.max(0, e.data.softTargetMs ?? totalAt(s, ts));
      const next: TimerState = { ...base, overtime: true, plannedMs: soft, nudgedMs: 0, alarmAt: null };
      // "Flag from now": goal already reached, so no alarm should ring.
      if (soft <= totalAt(s, ts)) next.alarmAt = ts;
      return next;
    }

    case 'timer.alarm':
      if (s.alarmAt !== null) return s;
      return { ...base, alarmAt: ts, alarmLate: !!e.data.late };

    case 'timer.done':
    case 'timer.discard':
      return {
        ...base,
        status: 'done',
        runs: closeRun(s, ts),
        endedAt: ts,
        endReason: e.type === 'timer.discard' ? 'discarded' : e.data.reason,
      };

    case 'clock.jump': {
      // Wall clock was set backwards/forwards while this timer ran: shift the open
      // segment by the same amount so measured time is preserved.
      const run = openRun(s);
      if (!run) return s;
      return { ...base, runs: s.runs.map((r) => (r === run ? [r[0] + e.data.deltaMs, null] : r)) };
    }

    case 'timer.note':
      return { ...base, ...pickNote(e.data) };

    default:
      return s;
  }
}

function pickNote(d: EventMap['timer.note']): Partial<TimerState> {
  const out: Partial<TimerState> = {};
  if (d.note !== undefined) out.note = d.note;
  if (d.mood !== undefined) out.mood = d.mood;
  return out;
}

/** Fold a full event list (any order) into timers keyed by id. */
export function foldTimers(events: AnyEvent[]): Map<string, TimerState> {
  const sorted = [...events].sort((a, b) => a.ts - b.ts || (a.id ?? 0) - (b.id ?? 0));
  const map = new Map<string, TimerState>();
  for (const e of sorted) {
    if (!e.timerId) continue;
    const next = applyEvent(map.get(e.timerId) ?? null, e);
    if (next) map.set(e.timerId, next);
  }
  return map;
}

export function snapshot(s: TimerState, now: number): TimerSnapshot {
  const at = s.status === 'done' && s.endedAt !== null ? s.endedAt : now;
  const timedMs = timedAt(s, at);
  const recoveredMs = recovered(s);
  const totalMs = timedMs + recoveredMs;
  const targetMs = targetOf(s);
  const remainingMs = targetMs > 0 ? targetMs - totalMs : 0;
  const inOvertime = targetMs > 0 && s.overtime && totalMs > targetMs;
  const overtimeMs = inOvertime ? totalMs - targetMs : 0;
  const pausedMs = Math.max(0, at - s.createdAt - timedMs);
  const progress = targetMs > 0 ? Math.min(1, totalMs / targetMs) : 1;
  return { timedMs, recoveredMs, totalMs, targetMs, remainingMs, overtimeMs, inOvertime, pausedMs, progress };
}

/**
 * Wall-clock instant at which the running timer reaches its target, or null if it has
 * no target / isn't running. Deterministic: depends only on state, never on "now".
 * This is what native alarm schedulers are given.
 */
export function crossingAt(s: TimerState): number | null {
  const target = targetOf(s);
  if (target <= 0 || s.status !== 'running') return null;
  const run = openRun(s);
  if (!run) return null;
  const closed = timedAt(s, run[0]) + recovered(s);
  return Math.max(run[0] + (target - closed), s.updatedAt);
}

/** When this timer's alarm should ring next (null if already rung / not applicable). */
export function nextAlarmAt(s: TimerState): number | null {
  if (s.alarmAt !== null) return null;
  return crossingAt(s);
}

export type PendingEvent = Omit<AnyEvent, 'tz' | 'id'> & { tz?: number };

/**
 * Events the engine owes the log at instant `now`: an alarm that came due and, for a
 * strict countdown, its completion. Timestamps are back-dated to the exact crossing
 * moment, so a timer that finished while the phone slept is recorded truthfully.
 */
export function dueEvents(s: TimerState, now: number): PendingEvent[] {
  if (s.status !== 'running') return [];
  const target = targetOf(s);
  if (target <= 0) return [];
  const out: PendingEvent[] = [];
  if (s.alarmAt === null) {
    const at = crossingAt(s);
    if (at === null || at > now) return [];
    const late = now - at > LATE_ALARM_MS;
    out.push({ type: 'timer.alarm', ts: at, timerId: s.id, data: { late } } as PendingEvent);
    if (!s.overtime) out.push({ type: 'timer.done', ts: at, timerId: s.id, data: { reason: 'complete' } } as PendingEvent);
  } else if (!s.overtime && totalAt(s, now) >= target) {
    // Overtime switched off after the alarm: close it out now.
    out.push({ type: 'timer.done', ts: Math.max(s.updatedAt, now), timerId: s.id, data: { reason: 'complete' } } as PendingEvent);
  }
  return out;
}

/** Project a finished timer into a Session record. */
export function toSession(s: TimerState): Session | null {
  if (s.status !== 'done' || s.endedAt === null || s.endReason === 'discarded') return null;
  const snap = snapshot(s, s.endedAt);
  const start = s.createdAt - snap.recoveredMs;
  return {
    id: s.id,
    timerId: s.id,
    start,
    end: s.endedAt,
    tz: s.createdTz,
    day: localDay(start, s.createdTz),
    phase: s.phase,
    mode: s.mode,
    label: s.label,
    boardId: s.boardId,
    taskId: s.taskId,
    presetId: s.presetId,
    plannedMs: snap.targetMs,
    actualMs: snap.totalMs,
    timedMs: snap.timedMs,
    recoveredMs: snap.recoveredMs,
    pausedMs: snap.pausedMs,
    overtimeMs: s.overtime ? Math.max(0, snap.totalMs - snap.targetMs) * (snap.targetMs > 0 ? 1 : 0) : 0,
    source: snap.recoveredMs > 0 ? 'adjusted' : 'timed',
    endReason: s.endReason ?? undefined,
    note: s.note,
    mood: s.mood,
    createdAt: s.createdAt,
  };
}
