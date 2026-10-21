/**
 * Local-first storage: IndexedDB via Dexie, inside the Tauri / Capacitor WebView.
 * No servers, no accounts. The user owns every byte (see backup.ts for export/import).
 *
 * Tables
 *  events   append-only log of every action (never updated, never deleted)
 *  timers   live projection of timers that haven't ended yet (rebuildable from events)
 *  sessions finished sessions (timer projections + manual + imported)
 *  daily    pre-computed per-day summaries so month/year views stay fast
 *  presets / boards / tasks / stickers / settings
 */
import Dexie, { type Table } from 'dexie';
import type { AnyEvent, Board, DailySummary, Preset, Session, Sticker, Task, TimerState } from '@/engine/types';

export interface KV<T = unknown> {
  key: string;
  value: T;
}

export class PromodoroDB extends Dexie {
  events!: Table<AnyEvent, number>;
  timers!: Table<TimerState, string>;
  sessions!: Table<Session, string>;
  daily!: Table<DailySummary, string>;
  presets!: Table<Preset, string>;
  boards!: Table<Board, string>;
  tasks!: Table<Task, string>;
  stickers!: Table<Sticker, string>;
  settings!: Table<KV, string>;

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
