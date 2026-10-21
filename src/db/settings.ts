import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_BREAK_POLICY, DEFAULT_PRESETS, type BreakPolicy } from '@/engine/cycle';
import type { ModeChoice, TimeSource } from '@/engine/types';
import type { AmbientId } from '@/audio/synth';
import { db } from './schema';

export type { AmbientId };

export type ThemeId = 'classic' | 'midnight' | 'graph' | 'sakura' | 'kraft';
export type AccessoryId = 'none' | 'beret' | 'headphones' | 'scarf' | 'party' | 'flower';

export interface AutoBackupSettings {
  enabled: boolean;
  /** Desktop only: absolute folder path chosen by the user. Android uses a fixed public folder. */
  dir: string | null;
  intervalHours: number;
  /** How many dated backup files to keep in the folder. */
  keep: number;
  lastAt: number | null;
  lastPath: string | null;
  lastError: string | null;
}

export interface AppSettings {
  presetId: string;
  /** Gentle Flow (overtime) by default: the timer never interrupts your flow. */
  defaultMode: ModeChoice;
  breakMode: 'countdown' | 'overtime';
  autoAdvance: boolean;
  breakPolicy: BreakPolicy;
  soundId: string;
  breakSoundId: string;
  volume: number;
  vibrate: boolean;
  /** Silent + vibrate: no alarm audio at all. */
  silent: boolean;
  ambient: AmbientId | null;
  ambientVolume: number;
  ambientAutoplay: boolean;
  theme: ThemeId;
  accessory: AccessoryId;
  closeToTray: boolean;
  pomoTalks: boolean;
  boardId: string | null;
  /** Current position in the preset cycle (1-based focus round). */
  round: number;
  chartSources: TimeSource[];
  lastBackupAt: number | null;
  backupReminderDays: number;
  backupSnoozedUntil: number;
  /** Automatic backups to a folder the user owns (desktop: any folder; Android: Documents/Promodoro). */
  autoBackup: AutoBackupSettings;
  license: string | null;
  installedAt: number;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  presetId: DEFAULT_PRESETS[0].id,
  defaultMode: 'overtime',
  breakMode: 'countdown',
  autoAdvance: false,
  breakPolicy: DEFAULT_BREAK_POLICY,
  soundId: 'kitchen',
  breakSoundId: 'chime',
  volume: 0.7,
  vibrate: true,
  silent: false,
  ambient: null,
  ambientVolume: 0.35,
  ambientAutoplay: false,
  theme: 'classic',
  accessory: 'none',
  closeToTray: true,
  pomoTalks: true,
  boardId: null,
  round: 1,
  chartSources: ['timed', 'adjusted', 'manual', 'imported'],
  lastBackupAt: null,
  backupReminderDays: 14,
  backupSnoozedUntil: 0,
  autoBackup: { enabled: false, dir: null, intervalHours: 24, keep: 14, lastAt: null, lastPath: null, lastError: null },
  license: null,
  installedAt: 0,
  onboarded: false,
};

const KEY = 'app';

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(KEY);
  const v = (row?.value as Partial<AppSettings>) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    breakPolicy: { ...DEFAULT_SETTINGS.breakPolicy, ...(v.breakPolicy ?? {}) },
    autoBackup: { ...DEFAULT_SETTINGS.autoBackup, ...(v.autoBackup ?? {}) },
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const next = { ...(await getSettings()), ...patch };
    await db.settings.put({ key: KEY, value: next });
    return next;
  });
}

/** Seed first-run data (presets, a few notebook subjects, install time). Idempotent. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.presets, db.boards, db.settings, async () => {
    if ((await db.presets.count()) === 0) await db.presets.bulkPut(DEFAULT_PRESETS);
    if ((await db.boards.count()) === 0)
      await db.boards.bulkPut([
        { id: 'b-study', name: 'Study', color: '#EE6B6E', order: 0 },
        { id: 'b-code', name: 'Coding', color: '#52B788', order: 1 },
        { id: 'b-write', name: 'Writing', color: '#E9B949', order: 2 },
      ]);
    const s = await getSettings();
    if (!s.installedAt) await db.settings.put({ key: KEY, value: { ...s, installedAt: Date.now() } });
  });
}

export function useSettings(): AppSettings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}
