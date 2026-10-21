/**
 * Portability: JSON (full fidelity) and CSV (sessions) export/import.
 * Imports are validated first and written in a single transaction, so a malformed
 * file or an interrupted write never leaves the database half-imported.
 */
import { importKey, isLikelyDuplicate, rowToSession, sessionsToCSV, type ImportRow } from '@/engine/csv';
import type { AnyEvent, Board, Folder, Note, Preset, Session, Sticker, Task } from '@/engine/types';
import { db, flushTombstones, skipSyncStamping, type KV, type Tombstone } from './schema';
import { append, recomputeAllDays } from './repo';
import type { PendingEvent } from '@/engine/timer';
import { mergeBackup } from '@/sync/merge';
import { ensureSeeded, updateSettings, type AppSettings } from './settings';

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
  /** Added later; older backups simply don't have them. */
  folders: Folder[];
  notes: Note[];
  stickers: Sticker[];
  settings: KV[];
  /** Grave markers for deleted subjects, notes, tasks…, so deletes survive a device sync. */
  tombstones: Tombstone[];
}

/** Device-specific settings that never leave this device in a backup or sync. */
function stripDeviceSettings(kv: KV): KV {
  if (kv.key !== 'app') return kv;
  return { ...kv, value: { ...(kv.value as object), license: null, installId: null, surveySentAt: null, pingId: null, pingSentOn: null, sync: null, autoBackup: null } };
}

export async function buildBackup(): Promise<Backup> {
  await flushTombstones();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    events: await db.events.toArray(),
    sessions: await db.sessions.toArray(),
    presets: await db.presets.toArray(),
    boards: await db.boards.toArray(),
    tasks: await db.tasks.toArray(),
    folders: await db.folders.toArray(),
    notes: await db.notes.toArray(),
    stickers: await db.stickers.toArray(),
    // Never export the supporter key, install ids, sync code or folders: backups get shared around.
    settings: (await db.settings.toArray()).map(stripDeviceSettings),
    tombstones: await db.tombstones.toArray(),
  };
}

export async function exportJSON(): Promise<string> {
  return JSON.stringify(await buildBackup(), null, 1);
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
    folders: arr(b.folders),
    notes: arr(b.notes),
    stickers: arr(b.stickers),
    settings: arr(b.settings),
    tombstones: arr(b.tombstones),
  };
}

/**
 * Restore a backup.
 *  merge:   keep everything you have, add what's missing (by id; log events by ts+type+timer).
 *  replace: wipe this device's data and load the backup exactly.
 */
export async function importJSON(text: string, mode: 'merge' | 'replace'): Promise<{ sessions: number; events: number }> {
  const b = parseBackup(text);
  // Merging a backup file keeps everything here and adds what's missing (deleted things included, so a
  // restore can bring them back). Device sync uses the stricter delete-aware merge in sync/merge.ts.
  if (mode === 'merge') {
    const r = await mergeBackup(b, { honorDeletes: false });
    return { sessions: r.sessions, events: r.events };
  }
  const tables = [db.events, db.timers, db.sessions, db.daily, db.presets, db.boards, db.tasks, db.folders, db.notes, db.stickers, db.settings, db.tombstones];
  await db.transaction('rw', tables, async () => {
    skipSyncStamping();
    const hereRow = await db.settings.get('app');
    for (const t of tables) await t.clear();
    await db.events.bulkAdd(b.events.map(({ id: _id, ...e }) => e as AnyEvent));
    await db.sessions.bulkPut(b.sessions);
    await db.presets.bulkPut(b.presets);
    await db.boards.bulkPut(b.boards);
    await db.tasks.bulkPut(b.tasks);
    await db.folders.bulkPut(b.folders);
    await db.notes.bulkPut(b.notes);
    await db.stickers.bulkPut(b.stickers);
    await db.tombstones.bulkPut(b.tombstones);
    // Device-specific settings (supporter key, folders, sync pairing, survey and user-count state) stay with this device.
    const here = hereRow?.value as Partial<AppSettings> | undefined;
    await db.settings.bulkPut(
      b.settings.map((kv) =>
        kv.key === 'app'
          ? {
              ...kv,
              value: {
                ...(kv.value as object),
                license: here?.license ?? null,
                autoBackup: here?.autoBackup,
                shareSurvey: here?.shareSurvey ?? false,
                installId: here?.installId ?? null,
                surveySentAt: here?.surveySentAt ?? null,
                pingEnabled: here?.pingEnabled ?? true,
                pingId: here?.pingId ?? null,
                pingSentOn: here?.pingSentOn ?? null,
                sync: here?.sync,
              },
            }
          : kv,
      ),
    );
  });
  await recomputeAllDays();
  return { sessions: b.sessions.length, events: b.events.length };
}

/**
 * Danger zone: erase everything on this device and start fresh. Kept on purpose: the supporter key (it
 * was paid for) and the anonymous user-count ids (so a fresh start isn't counted as a new user).
 * Sync is switched off, since a still-paired device would otherwise hand the data straight back.
 */
export async function wipeEverything(): Promise<void> {
  const tables = [db.events, db.timers, db.sessions, db.daily, db.presets, db.boards, db.tasks, db.folders, db.notes, db.stickers, db.settings, db.tombstones];
  await db.transaction('rw', tables, async () => {
    skipSyncStamping();
    const here = (await db.settings.get('app'))?.value as Partial<AppSettings> | undefined;
    for (const t of tables) await t.clear();
    if (here) {
      await db.settings.put({
        key: 'app',
        value: { license: here.license ?? null, installId: here.installId ?? null, surveySentAt: here.surveySentAt ?? null, pingEnabled: here.pingEnabled ?? true, pingId: here.pingId ?? null, pingSentOn: here.pingSentOn ?? null },
      });
    }
  });
  await ensureSeeded();
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
