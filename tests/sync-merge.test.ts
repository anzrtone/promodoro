import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup } from '@/db/backup';
import { db, flushTombstones } from '@/db/schema';
import { getSettings, updateSettings } from '@/db/settings';
import { addManualSession, deleteSession } from '@/db/repo';
import { mergeBackup } from '@/sync/merge';
import { MINUTE } from '@/engine/time';

const T0 = Date.UTC(2026, 9, 21, 13, 0);
/** Clearing a synced table fires the delete hooks, so clear tombstones last. */
async function wipe() {
  await Promise.all(db.tables.filter((t) => t.name !== 'tombstones').map((t) => t.clear()));
  await flushTombstones();
  await db.tombstones.clear();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(wipe);

/** Run `fn` as "device B" with a clean database, then restore this device's data. */
async function asOtherDevice<T>(fn: () => Promise<T>): Promise<T> {
  const mine = await buildBackup();
  await wipe();
  try {
    return await fn();
  } finally {
    await wipe();
    await mergeBackup(mine, { honorDeletes: true });
  }
}

describe('database hooks', () => {
  it('stamps updatedAt on create and bumps it on update', async () => {
    await db.boards.put({ id: 'b1', name: 'Math', color: '#fff', order: 0 });
    const first = (await db.boards.get('b1'))!.updatedAt!;
    expect(first).toBeGreaterThan(0);
    await sleep(3);
    await db.boards.update('b1', { name: 'Maths' });
    expect((await db.boards.get('b1'))!.updatedAt!).toBeGreaterThan(first);
  });

  it('keeps an explicit updatedAt of 0 (seed rows lose to real edits)', async () => {
    await db.boards.put({ id: 'seed', name: 'Study', color: '#fff', order: 0, updatedAt: 0 });
    expect((await db.boards.get('seed'))!.updatedAt).toBe(0);
  });

  it('leaves a tombstone when a subject is deleted', async () => {
    await db.boards.put({ id: 'b1', name: 'Math', color: '#fff', order: 0 });
    await db.boards.delete('b1');
    await flushTombstones();
    expect(await db.tombstones.get('boards:b1')).toMatchObject({ table: 'boards', rid: 'b1' });
  });

  it('stamps sessions when they are edited through the event store', async () => {
    const id = await addManualSession({ start: T0, end: T0 + 20 * MINUTE, durationMs: 20 * MINUTE, phase: 'focus', kind: 'entry' });
    const before = (await db.sessions.get(id))!.updatedAt!;
    await sleep(3);
    await deleteSession(id);
    expect((await db.sessions.get(id))!.updatedAt!).toBeGreaterThan(before);
  });
});

describe('mergeBackup', () => {
  it('adds what the other device has and is idempotent', async () => {
    await db.boards.put({ id: 'b-a', name: 'From A', color: '#111', order: 0 });
    await addManualSession({ start: T0, end: T0 + 30 * MINUTE, durationMs: 30 * MINUTE, phase: 'focus', kind: 'entry' });
    const a = await buildBackup();
    await wipe();
    await db.boards.put({ id: 'b-b', name: 'From B', color: '#222', order: 1 });

    const first = await mergeBackup(a, { honorDeletes: true });
    expect(first.sessions).toBe(1);
    expect((await db.boards.toArray()).map((b) => b.id).sort()).toEqual(['b-a', 'b-b']);
    expect((await db.daily.toArray())[0].focusMs).toBe(30 * MINUTE);

    const again = await mergeBackup(a, { honorDeletes: true });
    expect(again).toMatchObject({ sessions: 0, events: 0, rows: 0, deleted: 0 });
    expect(await db.sessions.count()).toBe(1);
  });

  it('keeps the newer edit of a row both devices have', async () => {
    await db.boards.put({ id: 'b1', name: 'Old name', color: '#111', order: 0, updatedAt: 1000 });
    const older = await buildBackup();
    await db.boards.update('b1', { name: 'New name' });
    await mergeBackup(older, { honorDeletes: true });
    expect((await db.boards.get('b1'))!.name).toBe('New name');

    const newer = await asOtherDevice(async () => {
      await db.boards.put({ id: 'b1', name: 'Newest', color: '#111', order: 0, updatedAt: Date.now() + 10_000 });
      return buildBackup();
    });
    await mergeBackup(newer, { honorDeletes: true });
    expect((await db.boards.get('b1'))!.name).toBe('Newest');
    expect((await db.boards.get('b1'))!.updatedAt).toBeGreaterThan(Date.now());
  });

  it('carries a delete to the other device instead of resurrecting the row', async () => {
    await db.boards.put({ id: 'b1', name: 'Doomed', color: '#111', order: 0, updatedAt: 1000 });
    await db.notes.put({ id: 'n1', title: 'Gone', body: '', createdAt: 1, updatedAt: 1000, order: 0 });
    const beforeDelete = await buildBackup();

    await db.boards.delete('b1');
    await db.notes.delete('n1');
    const afterDelete = await buildBackup();
    expect(afterDelete.tombstones.map((t) => t.id).sort()).toEqual(['boards:b1', 'notes:n1']);

    // The other device still has them: merging the delete removes them there.
    await wipe();
    await mergeBackup(beforeDelete, { honorDeletes: true });
    expect(await db.boards.count()).toBe(1);
    const stats = await mergeBackup(afterDelete, { honorDeletes: true });
    expect(stats.deleted).toBe(2);
    expect(await db.boards.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);

    // And the stale copy can't bring them back afterwards.
    await mergeBackup(beforeDelete, { honorDeletes: true });
    expect(await db.boards.count()).toBe(0);
  });

  it('lets a newer edit beat an older delete', async () => {
    await db.boards.put({ id: 'b1', name: 'Revived', color: '#111', order: 0 });
    const withEdit = await buildBackup();
    const other = await asOtherDevice(async () => {
      await db.tombstones.put({ id: 'boards:b1', table: 'boards', rid: 'b1', at: withEdit.boards[0].updatedAt! - 5 });
      return buildBackup();
    });
    await mergeBackup(other, { honorDeletes: true });
    expect(await db.boards.get('b1')).toBeTruthy();
  });

  it('a plain restore (honorDeletes: false) brings deleted things back', async () => {
    await db.boards.put({ id: 'b1', name: 'Oops', color: '#111', order: 0 });
    const backup = await buildBackup();
    await db.boards.delete('b1');
    await flushTombstones();
    await mergeBackup(backup, { honorDeletes: false });
    expect(await db.boards.get('b1')).toBeTruthy();
  });

  it('merges synced preferences by whichever side changed them last', async () => {
    await updateSettings({ theme: 'midnight' });
    const mine = await getSettings();
    expect(mine.prefsUpdatedAt).toBeGreaterThan(0);
    const other = await asOtherDevice(async () => {
      await updateSettings({ theme: 'sakura', volume: 0.1, dailyGoalMs: 3 * 60 * MINUTE, prefsUpdatedAt: mine.prefsUpdatedAt + 5000 });
      return buildBackup();
    });
    const stats = await mergeBackup(other, { honorDeletes: true });
    expect(stats.prefs).toBe(true);
    const merged = await getSettings();
    expect(merged.theme).toBe('sakura');
    expect(merged.dailyGoalMs).toBe(3 * 60 * MINUTE);
    expect(merged.volume).not.toBe(0.1); // volume stays per device
  });

  it('never exports pairing codes, ids or keys', async () => {
    await updateSettings({ license: 'KEY', installId: 'abc', sync: { ...(await getSettings()).sync, code: 'SECRET', method: 'relay' } });
    const app = (await buildBackup()).settings.find((k) => k.key === 'app')!.value as Record<string, unknown>;
    expect(app).toMatchObject({ license: null, installId: null, sync: null });
    expect(JSON.stringify(app)).not.toContain('SECRET');
  });
});

describe('wipeEverything (danger zone)', () => {
  it('erases all data without leaving tombstones, keeps the license, turns sync off, and re-seeds', async () => {
    const { wipeEverything } = await import('@/db/backup');
    await db.boards.put({ id: 'b1', name: 'Math', color: '#fff', order: 0 });
    await addManualSession({ start: T0, end: T0 + 25 * MINUTE, durationMs: 25 * MINUTE, phase: 'focus', kind: 'entry' });
    await updateSettings({ license: 'KEY-1', sync: { ...(await getSettings()).sync, method: 'relay', code: 'ABC' } });
    await wipeEverything();
    await flushTombstones();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.boards.get('b1')).toBeUndefined();
    expect(await db.tombstones.count()).toBe(0);
    const s = await getSettings();
    expect(s.license).toBe('KEY-1');
    expect(s.sync.method).toBe('off');
    expect(s.sync.code).toBeFalsy();
    expect(await db.presets.count()).toBeGreaterThan(0);
  });
});

describe('memory joggers in sync', () => {
  it("does not bring back another device's past-day joggers", async () => {
    const backup = await asOtherDevice(async () => {
      await db.events.bulkAdd([
        { type: 'app.open', ts: Date.now() - 3 * 24 * 60 * MINUTE, tz: 0, data: {} },
        { type: 'app.open', ts: Date.now(), tz: 0, data: {} },
      ] as never);
      return buildBackup();
    });
    await mergeBackup(backup, { honorDeletes: true });
    expect((await db.events.toArray()).filter((x) => x.type === 'app.open')).toHaveLength(1);
  });
});
