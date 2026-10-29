import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { addManualSession, append, deleteSession, editSession, pruneJoggers, rebuildFromLog, restoreSession } from '@/db/repo';
import { commitCsvImport, exportJSON, importJSON, planCsvImport } from '@/db/backup';
import { addMonths, MINUTE } from '@/engine/time';
import { retime, type PendingEvent } from '@/engine/timer';
import type { Session } from '@/engine/types';

const T0 = Date.UTC(2026, 9, 21, 13, 0);
const e = (type: string, ts: number, data: unknown = {}, timerId = 't1') => ({ type, ts, timerId, data, tz: 0 }) as PendingEvent;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('event store', () => {
  it('projects a finished timer into a session atomically and drops the live timer', async () => {
    await append([e('timer.start', T0, { mode: 'countdown', overtime: true, phase: 'focus', plannedMs: 25 * MINUTE })]);
    expect(await db.timers.count()).toBe(1);
    const res = await append([e('timer.done', T0 + 30 * MINUTE, { reason: 'complete' })]);
    expect(res.finished).toHaveLength(1);
    expect(await db.timers.count()).toBe(0);
    const s = await db.sessions.get('t1');
    expect(s?.overtimeMs).toBe(5 * MINUTE);
    const day = await db.daily.get('2026-10-21');
    expect(day?.focusMs).toBe(30 * MINUTE);
    expect(day?.overtimeMs).toBe(5 * MINUTE);
  });

  it('leaves a linked task open when the focus session ends (checking off is explicit)', async () => {
    await db.tasks.put({ id: 'task1', title: 'Read ch 3', done: false, createdAt: T0 });
    await append([e('timer.start', T0, { mode: 'countdown', overtime: false, phase: 'focus', plannedMs: 25 * MINUTE, taskId: 'task1' })]);
    await append([e('timer.done', T0 + 10 * MINUTE, { reason: 'early' })]);
    expect((await db.tasks.get('task1'))?.done).toBe(false);
  });

  it('soft-deletes and restores sessions; daily totals follow', async () => {
    const id = await addManualSession({ start: T0, end: T0 + 20 * MINUTE, durationMs: 20 * MINUTE, phase: 'focus', kind: 'claim' });
    expect((await db.sessions.get(id))?.source).toBe('manual');
    await deleteSession(id);
    expect(await db.daily.get('2026-10-21')).toBeUndefined();
    await restoreSession(id);
    expect((await db.daily.get('2026-10-21'))?.bySource.manual).toBe(20 * MINUTE);
  });

  it('rebuilds sessions from the append-only log', async () => {
    await append([e('timer.start', T0, { mode: 'countdown', overtime: false, phase: 'focus', plannedMs: 25 * MINUTE })]);
    await append([e('timer.done', T0 + 25 * MINUTE, { reason: 'complete' })]);
    await addManualSession({ start: T0 + HOUR(), end: T0 + HOUR() + 15 * MINUTE, durationMs: 15 * MINUTE, phase: 'focus', kind: 'entry' });
    await db.sessions.clear();
    const r = await rebuildFromLog();
    expect(r.sessions).toBe(2);
    expect(await db.sessions.count()).toBe(2);
  });
});

function HOUR() {
  return 60 * MINUTE;
}

describe('backup & import', () => {
  it('JSON export → replace import restores everything', async () => {
    await addManualSession({ start: T0, end: T0 + 20 * MINUTE, durationMs: 20 * MINUTE, phase: 'focus', kind: 'entry' });
    const json = await exportJSON();
    await Promise.all(db.tables.map((t) => t.clear()));
    await importJSON(json, 'replace');
    expect(await db.sessions.count()).toBe(1);
    expect(await db.events.count()).toBe(1);
  });

  it('merge import does not duplicate', async () => {
    await addManualSession({ start: T0, end: T0 + 20 * MINUTE, durationMs: 20 * MINUTE, phase: 'focus', kind: 'entry' });
    const json = await exportJSON();
    const r = await importJSON(json, 'merge');
    expect(r.sessions).toBe(0);
    expect(await db.sessions.count()).toBe(1);
  });

  it('rejects files that are not backups', async () => {
    await expect(importJSON('{"hello":1}', 'merge')).rejects.toThrow(/Promodoro backup/);
    await expect(importJSON('not json', 'merge')).rejects.toThrow(/valid JSON/);
  });

  it('CSV import twice does not double count', async () => {
    const rows = [{ start: T0, end: T0 + 25 * MINUTE, durationMs: 25 * MINUTE, label: 'Study' }];
    const first = await planCsvImport(rows, 'forest.csv');
    await commitCsvImport(first.fresh);
    const second = await planCsvImport(rows, 'forest.csv');
    expect(second.fresh).toHaveLength(0);
    expect(second.duplicates).toHaveLength(1);
  });
});

describe('changing a session\'s times', () => {
  it('retimes a timed session, moves it across days, and both days follow', async () => {
    await append([e('timer.start', T0, { mode: 'countdown', overtime: false, phase: 'focus', plannedMs: 25 * MINUTE })]);
    await append([e('timer.done', T0 + 25 * MINUTE, { reason: 'complete' })]);
    const s = (await db.sessions.get('t1'))!;
    const start = T0 - 24 * HOUR();
    await editSession('t1', { label: 'Essay', ...retime(s, start, start + 40 * MINUTE) });
    const moved = (await db.sessions.get('t1'))!;
    expect(moved).toMatchObject({ label: 'Essay', day: '2026-10-20', actualMs: 40 * MINUTE, timedMs: 25 * MINUTE, recoveredMs: 15 * MINUTE, source: 'adjusted' });
    expect(await db.daily.get('2026-10-21')).toBeUndefined();
    expect((await db.daily.get('2026-10-20'))?.focusMs).toBe(40 * MINUTE);
    // The edit lives in the log, so a rebuild lands in the same place.
    await db.sessions.clear();
    await rebuildFromLog();
    expect((await db.sessions.get('t1'))?.start).toBe(start);
  });

  it('keeps pauses and shrinks the clock-measured part when a session is shortened', () => {
    const s = { start: T0, end: T0 + HOUR(), tz: 0, pausedMs: 10 * MINUTE, timedMs: 50 * MINUTE, plannedMs: 25 * MINUTE, overtimeMs: 25 * MINUTE, source: 'timed' } as Session;
    expect(retime(s, T0, T0 + 30 * MINUTE)).toMatchObject({ actualMs: 20 * MINUTE, timedMs: 20 * MINUTE, recoveredMs: 0, pausedMs: 10 * MINUTE, overtimeMs: 0 });
    expect(retime({ ...s, source: 'manual' }, T0, T0 + 5 * MINUTE)).toMatchObject({ actualMs: 0, pausedMs: 5 * MINUTE, source: 'manual' });
  });
});

describe('memory joggers', () => {
  it('prunes open / resume / leave marks from before the cutoff and keeps everything else', async () => {
    const cut = T0 + HOUR();
    await append([
      { type: 'app.open', ts: T0, data: {} } as PendingEvent,
      { type: 'app.background', ts: T0 + MINUTE, data: {} } as PendingEvent,
      { type: 'app.resume', ts: cut + MINUTE, data: {} } as PendingEvent,
      e('timer.alarm', T0, {}),
    ]);
    expect(await pruneJoggers(cut)).toBe(2);
    expect((await db.events.toArray()).map((x) => x.type).sort()).toEqual(['app.resume', 'timer.alarm']);
  });
});

describe('addMonths', () => {
  it('clamps to the target month', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-29', 3)).toBe('2027-01-29');
    expect(addMonths('2026-01-15', -12)).toBe('2025-01-15');
  });
});
