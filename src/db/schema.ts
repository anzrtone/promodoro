/**
 * Local-first storage: IndexedDB via Dexie, inside the Tauri / Capacitor WebView.
 * No servers, no accounts. The user owns every byte (see backup.ts for export/import).
 *
 * Tables
 *  events   append-only log of every action (never updated, never deleted)
 *  timers   live projection of timers that haven't ended yet (rebuildable from events)
 *  sessions finished sessions (timer projections + manual + imported)
 *  daily    pre-computed per-day summaries so month/year views stay fast
 *  presets / boards (subjects) / folders / tasks / notes / stickers / settings
 */
import Dexie, { type Table } from 'dexie';
import type { AnyEvent, Board, DailySummary, Folder, Note, Preset, Session, Sticker, Task, TimerState } from '@/engine/types';

export interface KV<T = unknown> {
  key: string;
  value: T;
}

/** A deleted row's grave marker, so a delete travels to other devices instead of the row coming back. */
export interface Tombstone {
  /** `${table}:${rid}` */
  id: string;
  table: TombstoneTable;
  rid: string;
  at: number;
}

/** Tables whose rows sync by id with last-write-wins. Sessions soft-delete, so they need no tombstones. */
export const SYNC_ROW_TABLES = ['sessions', 'presets', 'boards', 'folders', 'tasks', 'notes', 'stickers'] as const;
export type SyncRowTable = (typeof SYNC_ROW_TABLES)[number];
export type TombstoneTable = Exclude<SyncRowTable, 'sessions'>;

/** Set on a transaction to make hooks leave timestamps and tombstones alone (sync applying remote rows). */
export function skipSyncStamping(): void {
  const tx = Dexie.currentTransaction as unknown as { __noStamp?: boolean } | null;
  if (tx) tx.__noStamp = true;
}
const noStamp = (tx: unknown) => (tx as { __noStamp?: boolean } | null)?.__noStamp === true;

const pendingTombstones = new Set<Promise<unknown>>();
/** Wait for in-flight tombstone writes (they land just after the delete commits). */
export async function flushTombstones(): Promise<void> {
  while (pendingTombstones.size) await Promise.allSettled([...pendingTombstones]);
}

export class PromodoroDB extends Dexie {
  events!: Table<AnyEvent, number>;
  timers!: Table<TimerState, string>;
  sessions!: Table<Session, string>;
  daily!: Table<DailySummary, string>;
  presets!: Table<Preset, string>;
  boards!: Table<Board, string>;
  tasks!: Table<Task, string>;
  folders!: Table<Folder, string>;
  notes!: Table<Note, string>;
  stickers!: Table<Sticker, string>;
  settings!: Table<KV, string>;
  tombstones!: Table<Tombstone, string>;

  constructor(name = 'promodoro') {
    super(name);
    this.version(1).stores({
      events: '++id, ts, type, timerId',
      timers: 'id, status',
      sessions: 'id, start, end, day, phase, source, boardId, importKey, timerId',
      daily: 'day',
      presets: 'id, order',
      boards: 'id, order',
      tasks: 'id, createdAt, boardId',
      stickers: 'id, earnedAt',
      settings: 'key',
    });
    // v2: folders for subjects; tasks and notes can live in a subject or folder.
    // Existing subjects have no folderId, so they simply show up as loose.
    this.version(2).stores({
      boards: 'id, order, folderId',
      tasks: 'id, createdAt, boardId, folderId',
      folders: 'id, order, parentId',
      notes: 'id, updatedAt, boardId, folderId',
    });
    // v3: cross-device sync. Rows carry `updatedAt` (stamped by the hooks below) and deletes leave tombstones.
    this.version(3).stores({
      tombstones: 'id, at',
    });
    this.installSyncHooks();
  }

  private installSyncHooks(): void {
    const self = this;
    const stamped: Array<[SyncRowTable, Table<{ updatedAt?: number }, string>]> = [
      ['sessions', this.sessions],
      ['presets', this.presets],
      ['boards', this.boards],
      ['folders', this.folders],
      ['tasks', this.tasks],
      ['notes', this.notes],
      ['stickers', this.stickers],
    ];
    for (const [name, table] of stamped) {
      // Seed rows pass updatedAt: 0 explicitly so they always lose to a real edit.
      table.hook('creating', (_pk, obj, tx) => {
        if (!noStamp(tx) && obj.updatedAt === undefined) obj.updatedAt = Date.now();
      });
      table.hook('updating', (_mods, _pk, obj, tx) => {
        if (noStamp(tx)) return;
        return { updatedAt: Math.max(Date.now(), (obj.updatedAt ?? 0) + 1) };
      });
      if (name === 'sessions') continue;
      table.hook('deleting', function (pk, _obj, tx) {
        if (noStamp(tx)) return;
        const rid = String(pk);
        this.onsuccess = () => {
          const w = Dexie.ignoreTransaction(() => self.tombstones.put({ id: `${name}:${rid}`, table: name as TombstoneTable, rid, at: Date.now() }));
          pendingTombstones.add(w);
          void w.catch(() => undefined).finally(() => pendingTombstones.delete(w));
        };
      });
    }
  }
}

export const db = new PromodoroDB();

/** Ask the WebView not to evict our IndexedDB under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported in this WebView */
  }
  return false;
}
