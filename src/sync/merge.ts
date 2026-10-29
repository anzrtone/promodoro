/**
 * The merge at the heart of device sync.
 *
 * Every synced row carries `updatedAt` (stamped by the database hooks) and every delete leaves
 * a tombstone, so merging two devices is a pure, repeatable function of their data:
 *   - a row only on one side is added (unless the other side deleted it after its last edit)
 *   - a row on both sides keeps the newer edit (ties keep what's here)
 *   - a delete wins over an older copy, and loses to a newer edit
 *   - the event log is the union of both logs (minus past days' memory-jogger marks, which are pruned)
 *   - synced preferences follow whichever device changed them last
 * Merging the same data twice changes nothing, so a retried or doubled sync is harmless.
 */
import type { AnyEvent } from '@/engine/types';
import type { Backup } from '@/db/backup';
import { db, flushTombstones, skipSyncStamping, type SyncRowTable, type Tombstone } from '@/db/schema';
import { SYNCED_PREFS, type AppSettings } from '@/db/settings';
import { isStaleJogger, recomputeAllDays } from '@/db/repo';
import { DAY, dayStart, today } from '@/engine/time';

export interface MergeStats {
  /** Sessions that were new to this device. */
  sessions: number;
  events: number;
  /** Non-session rows added or updated (subjects, notes, tasks, presets…). */
  rows: number;
  /** Rows removed because another device deleted them. */
  deleted: number;
  prefs: boolean;
}

export const TOMBSTONE_KEEP_MS = 180 * DAY;

type Row = { id: string; updatedAt?: number };

export async function mergeBackup(b: Backup, opts: { honorDeletes: boolean }): Promise<MergeStats> {
  await flushTombstones();
  const stats: MergeStats = { sessions: 0, events: 0, rows: 0, deleted: 0, prefs: false };
  const honor = opts.honorDeletes;
  const tables = [db.events, db.sessions, db.presets, db.boards, db.folders, db.tasks, db.notes, db.stickers, db.settings, db.tombstones];

  await db.transaction('rw', tables, async () => {
    skipSyncStamping();

    // Event log: union by (ts, type, timer).
    const seen = new Set<string>();
    await db.events.each((e) => void seen.add(`${e.ts}|${e.type}|${e.timerId ?? ''}`));
    const joggersBefore = dayStart(today());
    const newEvents = b.events.filter((e) => !isStaleJogger(e, joggersBefore) && !seen.has(`${e.ts}|${e.type}|${e.timerId ?? ''}`)).map(({ id: _id, ...e }) => e as AnyEvent);
    if (newEvents.length) await db.events.bulkAdd(newEvents);
    stats.events = newEvents.length;

    // Graves: ours and theirs, newest wins per row.
    const tombs = new Map<string, Tombstone>();
    for (const t of await db.tombstones.toArray()) tombs.set(t.id, t);
    const pruneBefore = Date.now() - TOMBSTONE_KEEP_MS;
    const incoming: Tombstone[] = honor ? b.tombstones.filter((t) => t && typeof t.id === 'string' && Number.isFinite(t.at)) : [];
    const written: Tombstone[] = [];
    for (const t of incoming) {
      const have = tombs.get(t.id);
      if (!have || have.at < t.at) {
        tombs.set(t.id, t);
        written.push(t);
      }
    }

    const mergeTable = async (name: SyncRowTable, remote: Row[]) => {
      const table = db.table<Row, string>(name);
      const local = new Map((await table.toArray()).map((r) => [r.id, r]));
      const put: Row[] = [];
      const del: string[] = [];
      const hasGraves = honor && name !== 'sessions';
      const graveAt = (id: string) => (hasGraves ? tombs.get(`${name}:${id}`)?.at : undefined);

      // A grave newer than the local copy's last edit takes the local copy with it.
      if (hasGraves) {
        for (const t of tombs.values()) {
          if (t.table !== name) continue;
          const l = local.get(t.rid);
          if (l && (l.updatedAt ?? 0) <= t.at) {
            del.push(t.rid);
            local.delete(t.rid);
          }
        }
      }
      for (const r of remote) {
        if (!r || typeof r.id !== 'string') continue;
        const ru = r.updatedAt ?? 0;
        const l = local.get(r.id);
        if (!l) {
          const g = graveAt(r.id);
          if (g !== undefined && g >= ru) continue;
          put.push(r);
          if (name === 'sessions') stats.sessions++;
        } else if (ru > (l.updatedAt ?? 0)) put.push(r);
      }
      if (del.length) await table.bulkDelete(del);
      if (put.length) await table.bulkPut(put);
      if (name !== 'sessions') {
        stats.deleted += del.length;
        stats.rows += put.length;
      }
    };

    await mergeTable('sessions', b.sessions);
    await mergeTable('presets', b.presets);
    await mergeTable('boards', b.boards);
    await mergeTable('folders', b.folders);
    await mergeTable('tasks', b.tasks);
    await mergeTable('notes', b.notes);
    await mergeTable('stickers', b.stickers);

    if (written.length) await db.tombstones.bulkPut(written);
    const stale = [...tombs.values()].filter((t) => t.at < pruneBefore).map((t) => t.id);
    if (stale.length) await db.tombstones.bulkDelete(stale);

    // Preferences: the whole synced group moves with whichever device edited it last.
    const remoteApp = b.settings.find((kv) => kv.key === 'app')?.value as Partial<AppSettings> | undefined;
    if (remoteApp && honor) {
      const row = await db.settings.get('app');
      const mine = (row?.value ?? {}) as Partial<AppSettings>;
      if ((remoteApp.prefsUpdatedAt ?? 0) > (mine.prefsUpdatedAt ?? 0)) {
        const next: Record<string, unknown> = { ...mine, prefsUpdatedAt: remoteApp.prefsUpdatedAt };
        for (const k of SYNCED_PREFS) if (remoteApp[k] !== undefined) next[k] = remoteApp[k];
        await db.settings.put({ key: 'app', value: next });
        stats.prefs = true;
      }
    }
  });

  if (stats.sessions || stats.deleted || stats.rows) await recomputeAllDays();
  return stats;
}

export const mergedAnything = (s: MergeStats) => s.sessions + s.events + s.rows + s.deleted > 0 || s.prefs;
