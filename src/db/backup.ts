/**
 * Portability: JSON (full fidelity) and CSV (sessions) export/import.
 * Imports are validated first and written in a single transaction, so a malformed
 * file or an interrupted write never leaves the database half-imported.
 */
import { importKey, isLikelyDuplicate, rowToSession, sessionsToCSV, type ImportRow } from '@/engine/csv';
import type { AnyEvent, Board, Preset, Session, Sticker, Task } from '@/engine/types';
import { db, type KV } from './schema';
import { append, recomputeAllDays } from './repo';
import type { PendingEvent } from '@/engine/timer';
import { updateSettings } from './settings';

export const BACKUP_FORMAT = 'promodoro-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  events: AnyEvent[];
  sessions: Session[];
  presets: Preset[];
  boards: Board[];
  tasks: Task[];
  stickers: Sticker[];
  settings: KV[];
}

export async function exportJSON(): Promise<string> {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    events: await db.events.toArray(),
    sessions: await db.sessions.toArray(),
    presets: await db.presets.toArray(),
    boards: await db.boards.toArray(),
    tasks: await db.tasks.toArray(),
    stickers: await db.stickers.toArray(),
    // Never export the supporter key: backups get shared around.
    settings: (await db.settings.toArray()).map((kv) =>
      kv.key === 'app' ? { ...kv, value: { ...(kv.value as object), license: null } } : kv,
    ),
  };
  return JSON.stringify(backup, null, 1);
}

export async function exportCSV(): Promise<string> {
  const boards = new Map((await db.boards.toArray()).map((b) => [b.id, b.name]));
  return sessionsToCSV(await db.sessions.toArray(), (id) => (id ? boards.get(id) ?? '' : ''));
}

export async function markBackedUp(): Promise<void> {
  await updateSettings({ lastBackupAt: Date.now() });
}

export class BackupError extends Error {}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't valid JSON.");
  }
  const b = data as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT) throw new BackupError("This doesn't look like a Promodoro backup.");
  if ((b.version ?? 0) > BACKUP_VERSION) throw new BackupError('This backup is from a newer Promodoro. Please update the app first.');
  const arr = <T,>(x: T[] | undefined) => (Array.isArray(x) ? x : []);
  const sessions = arr(b.sessions).filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.start) && Number.isFinite(s.end));
  const events = arr(b.events).filter((e) => e && typeof e.type === 'string' && Number.isFinite(e.ts));
  return {
    format: BACKUP_FORMAT,
    version: b.version ?? 1,
    exportedAt: b.exportedAt ?? '',
    events,
    sessions,
    presets: arr(b.presets),
    boards: arr(b.boards),
    tasks: arr(b.tasks),
    stickers: arr(b.stickers),
    settings: arr(b.settings),
  };
}

/**
 * Restore a backup.
 *  merge:   keep everything you have, add what's missing (by id; log events by ts+type+timer).
 *  replace: wipe this device's data and load the backup exactly.
 */
export async function importJSON(text: string, mode: 'merge' | 'replace'): Promise<{ sessions: number; events: number }> {
  const b = parseBackup(text);
  const tables = [db.events, db.timers, db.sessions, db.daily, db.presets, db.boards, db.tasks, db.stickers, db.settings];
  const result = await db.transaction('rw', tables, async () => {
    let addedSessions = 0;
    let addedEvents = 0;
    if (mode === 'replace') {
      for (const t of tables) await t.clear();
      await db.events.bulkAdd(b.events.map(({ id: _id, ...e }) => e as AnyEvent));
      await db.sessions.bulkPut(b.sessions);
      await db.presets.bulkPut(b.presets);
      await db.boards.bulkPut(b.boards);
      await db.tasks.bulkPut(b.tasks);
      await db.stickers.bulkPut(b.stickers);
      const license = (await db.settings.get('app'))?.value as { license?: string } | undefined;
      await db.settings.bulkPut(b.settings.map((kv) => (kv.key === 'app' ? { ...kv, value: { ...(kv.value as object), license: license?.license ?? null } } : kv)));
      return { sessions: b.sessions.length, events: b.events.length };
    }
    const seen = new Set<string>();
    await db.events.each((e) => void seen.add(`${e.ts}|${e.type}|${e.timerId ?? ''}`));
    const newEvents = b.events.filter((e) => !seen.has(`${e.ts}|${e.type}|${e.timerId ?? ''}`)).map(({ id: _id, ...e }) => e as AnyEvent);
    await db.events.bulkAdd(newEvents);
    addedEvents = newEvents.length;
    const haveIds = new Set(await db.sessions.toCollection().primaryKeys());
    const newSessions = b.sessions.filter((s) => !haveIds.has(s.id));
    await db.sessions.bulkPut(newSessions);
    addedSessions = newSessions.length;
    const addMissing = async <T extends { id: string }>(table: typeof db.presets | typeof db.boards | typeof db.tasks | typeof db.stickers, rows: T[]) => {
      const have = new Set(await table.toCollection().primaryKeys());
      await (table as unknown as { bulkPut(r: T[]): Promise<unknown> }).bulkPut(rows.filter((r) => !have.has(r.id)));
    };
    await addMissing(db.presets, b.presets);
    await addMissing(db.boards, b.boards);
    await addMissing(db.tasks, b.tasks);
    await addMissing(db.stickers, b.stickers);
    return { sessions: addedSessions, events: addedEvents };
  });
  await recomputeAllDays();
  return result;
}

export interface CsvPlan {
  fresh: Session[];
  duplicates: Session[];
}

/** Work out which rows are new and which look like sessions you already have. */
export async function planCsvImport(rows: ImportRow[], from: string, phase: Session['phase'] = 'focus'): Promise<CsvPlan> {
  const candidates = rows.map((r) => rowToSession(r, from, phase));
  const keys = new Set<string>();
  await db.sessions.each((s) => {
    if (!s.deleted) keys.add(s.importKey ?? importKey(s.start, s.actualMs));
  });
  const nearby = await db.sessions.toArray();
  const fresh: Session[] = [];
  const duplicates: Session[] = [];
  const inFile = new Set<string>();
  for (const c of candidates) {
    const k = c.importKey!;
    if (keys.has(k) || inFile.has(k) || isLikelyDuplicate(c, nearby)) duplicates.push(c);
    else fresh.push(c);
    inFile.add(k);
  }
  return { fresh, duplicates };
}

export async function commitCsvImport(sessions: Session[], file?: string): Promise<number> {
  if (!sessions.length) return 0;
  await db.transaction('rw', db.sessions, async () => {
    await db.sessions.bulkPut(sessions);
  });
  await append([{ type: 'import.batch', ts: Date.now(), data: { count: sessions.length, format: 'csv', file } } as PendingEvent]);
  await recomputeAllDays();
  return sessions.length;
}
