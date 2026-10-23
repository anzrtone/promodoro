import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_BREAK_POLICY, DEFAULT_PRESETS, type BreakPolicy } from '@/engine/cycle';
import type { ModeChoice, TimeSource } from '@/engine/types';
import type { AmbientId } from '@/audio/synth';
import { db } from './schema';

export type { AmbientId };

export type ShareWidgetId = 'totals' | 'bars' | 'periods' | 'subjects' | 'goal' | 'rhythm' | 'shape' | 'stickers';

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

/** What the welcome survey asks. Ids are stable: they're what the survey endpoint stores. */
export type UseId = 'study' | 'code' | 'write' | 'work' | 'create' | 'bodydouble' | 'admin' | 'other';
export type HeardId = 'friend' | 'social' | 'reddit' | 'youtube' | 'search' | 'store' | 'shared-page' | 'other';

export interface SurveyAnswers {
  uses: UseId[];
  usesOther: string;
  heardFrom: HeardId | null;
  heardOther: string;
  answeredAt: number;
}

export type SyncMethod = 'off' | 'relay' | 'folder' | 'file';

/** Device sync. Device-specific: never exported in backups or carried between devices. */
export interface SyncSettings {
  method: SyncMethod;
  /** Pairing code for the encrypted relay (also the encryption key; keep it private). */
  code: string | null;
  /** Names this device's file in a shared sync folder. */
  deviceId: string | null;
  /** Desktop: the folder shared between devices. Android uses Documents/Promodoro. */
  dir: string | null;
  /** Sync in the background on launch, every so often, and when the app is put away. */
  auto: boolean;
  lastAt: number | null;
  lastError: string | null;
  lastSummary: string | null;
  /** Fingerprints that let a sync skip re-uploading data nobody has changed. */
  lastPushHash: string | null;
  lastBlobHash: string | null;
}

export const DEFAULT_SYNC: SyncSettings = {
  method: 'off',
  code: null,
  deviceId: null,
  dir: null,
  auto: true,
  lastAt: null,
  lastError: null,
  lastSummary: null,
  lastPushHash: null,
  lastBlobHash: null,
};

/** Preferences that follow you between synced devices (volume, alarms, folders and keys stay per device). */
export const SYNCED_PREFS = [
  'theme',
  'accessory',
  'defaultMode',
  'breakMode',
  'autoAdvance',
  'focusModeAuto',
  'breakPolicy',
  'soundId',
  'breakSoundId',
  'alarmRepeat',
  'dailyGoalMs',
  'shareWidgets',
  'chartSources',
  'presetId',
  'pomoTalks',
  'profile',
  'backupReminderDays',
  'use24h',
  'showTasks',
] as const satisfies ReadonlyArray<keyof AppSettings>;

/** Ring the alarm, just buzz, or stay out of the way entirely. */
export type OvertimeAlert = 'sound' | 'vibrate' | 'none';

export interface AppSettings {
  presetId: string;
  /** Gentle Flow (overtime) by default: the timer never interrupts your flow. */
  defaultMode: ModeChoice;
  breakMode: 'countdown' | 'overtime';
  autoAdvance: boolean;
  /** Open focus mode (the full-screen timer) whenever a focus session starts. */
  focusModeAuto: boolean;
  breakPolicy: BreakPolicy;
  soundId: string;
  breakSoundId: string;
  volume: number;
  vibrate: boolean;
  /** Silent + vibrate: no alarm audio at all. */
  silent: boolean;
  /** Repeat the alarm several times until dismissed. Off = play once (default). */
  alarmRepeat: boolean;
  /** What happens when a timer that keeps counting (Gentle Flow, overtime goal) reaches its goal. */
  overtimeAlert: OvertimeAlert;
  /** Android: a ticking notification with pause / resume / stop buttons while a timer runs. */
  liveTimerNotification: boolean;
  /** Android: a notification each evening with the day's focus. Skipped on days with no focus. */
  dailyReport: boolean;
  /** When the daily report arrives, as minutes after local midnight (22:00 by default). */
  dailyReportMinutes: number;
  ambient: AmbientId | null;
  ambientVolume: number;
  ambientAutoplay: boolean;
  theme: ThemeId;
  accessory: AccessoryId;
  closeToTray: boolean;
  pomoTalks: boolean;
  /** Show the task lists (focus note, focus mode, wrap-up). Off hides tasks everywhere on the timer screens. */
  showTasks: boolean;
  boardId: string | null;
  /** Current position in the preset cycle (1-based focus round). */
  round: number;
  chartSources: TimeSource[];
  /** Daily focus goal for the goal rings on Stats. Rings only fill up; nothing is "missed". */
  dailyGoalMs: number;
  /** Which widgets go on the shareable stats card. */
  shareWidgets: ShareWidgetId[];
  lastBackupAt: number | null;
  backupReminderDays: number;
  backupSnoozedUntil: number;
  /** Automatic backups to a folder the user owns (desktop: any folder; Android: Documents/Promodoro). */
  autoBackup: AutoBackupSettings;
  license: string | null;
  installedAt: number;
  onboarded: boolean;
  /** Bumped when the welcome notebook gains pages worth showing again. */
  onboardingVersion: number;
  /** Show times in 24-hour format (e.g. 14:30) instead of 12-hour AM/PM. */
  use24h: boolean;
  /** Stays on this device. Only Pomo uses it. */
  profile: { name: string };
  survey: SurveyAnswers | null;
  /** Opt-in: send the survey answers (never the name) to the survey endpoint, anonymously. */
  shareSurvey: boolean;
  /** Random id created on opting in, so a retake replaces and a withdrawal deletes the same row. */
  installId: string | null;
  /** When the current answers reached the endpoint. Null means there's something to send (or withdraw). */
  surveySentAt: number | null;
  /** Anonymous daily "count" ping (random id + platform + version). On by default, with an off switch in Settings; see features/ping.ts. */
  pingEnabled: boolean;
  pingId: string | null;
  pingSentOn: string | null;
  /** When any synced preference last changed here; the newer side wins on sync. */
  prefsUpdatedAt: number;
  sync: SyncSettings;
  /** The Sync tab's guided tour has been shown on this device (it replays from the Re-tour button). */
  syncTourSeen: boolean;
  /** Look for a newer GitHub release once a day (see features/updates.ts). On by default, with an off switch in About. */
  updateCheck: boolean;
  updateCheckedAt: number;
  /** The newest published release the last check found (it may be the one already installed). */
  latestRelease: ReleaseInfo | null;
  /** The release version whose pill the user dismissed. */
  dismissedUpdate: string | null;
  /** The release version we already popped a toast for. */
  notifiedUpdate: string | null;
  /** The app version whose dev log page the user has been shown. */
  lastSeenVersion: string | null;
}

export interface ReleaseInfo {
  version: string;
  name: string;
  url: string;
  body: string;
  publishedAt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  presetId: DEFAULT_PRESETS[0].id,
  defaultMode: 'overtime',
  breakMode: 'countdown',
  autoAdvance: false,
  focusModeAuto: true,
  breakPolicy: DEFAULT_BREAK_POLICY,
  soundId: 'kitchen',
  breakSoundId: 'chime',
  volume: 0.7,
  vibrate: true,
  silent: false,
  alarmRepeat: false,
  overtimeAlert: 'vibrate',
  liveTimerNotification: true,
  dailyReport: true,
  dailyReportMinutes: 22 * 60,
  ambient: null,
  ambientVolume: 0.35,
  ambientAutoplay: false,
  theme: 'classic',
  accessory: 'none',
  closeToTray: true,
  pomoTalks: true,
  showTasks: true,
  boardId: null,
  round: 1,
  chartSources: ['timed', 'adjusted', 'manual', 'imported'],
  dailyGoalMs: 2 * 60 * 60 * 1000,
  shareWidgets: ['totals', 'bars', 'periods', 'subjects', 'goal', 'stickers'],
  lastBackupAt: null,
  backupReminderDays: 14,
  backupSnoozedUntil: 0,
  autoBackup: { enabled: false, dir: null, intervalHours: 24, keep: 14, lastAt: null, lastPath: null, lastError: null },
  license: null,
  installedAt: 0,
  onboarded: false,
  onboardingVersion: 0,
  use24h: false,
  profile: { name: '' },
  survey: null,
  shareSurvey: false,
  installId: null,
  surveySentAt: null,
  pingEnabled: true,
  pingId: null,
  pingSentOn: null,
  prefsUpdatedAt: 0,
  sync: DEFAULT_SYNC,
  syncTourSeen: false,
  updateCheck: true,
  updateCheckedAt: 0,
  latestRelease: null,
  dismissedUpdate: null,
  notifiedUpdate: null,
  lastSeenVersion: null,
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
    profile: { ...DEFAULT_SETTINGS.profile, ...(v.profile ?? {}) },
    sync: { ...DEFAULT_SYNC, ...(v.sync ?? {}) },
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    const next = { ...cur, ...patch };
    if (patch.prefsUpdatedAt === undefined && SYNCED_PREFS.some((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(cur[k]))) next.prefsUpdatedAt = Date.now();
    await db.settings.put({ key: KEY, value: next });
    return next;
  });
}

/** Seed first-run data (presets, a few notebook subjects, install time). Idempotent. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.presets, db.boards, db.settings, async () => {
    if ((await db.presets.count()) === 0) await db.presets.bulkPut(DEFAULT_PRESETS.map((p) => ({ ...p, updatedAt: 0 })));
    if ((await db.boards.count()) === 0)
      await db.boards.bulkPut([
        { id: 'b-study', name: 'Study', color: '#EE6B6E', order: 0, updatedAt: 0 },
        { id: 'b-code', name: 'Coding', color: '#52B788', order: 1, updatedAt: 0 },
        { id: 'b-write', name: 'Writing', color: '#E9B949', order: 2, updatedAt: 0 },
      ]);
    const s = await getSettings();
    if (!s.installedAt) await db.settings.put({ key: KEY, value: { ...s, installedAt: Date.now() } });
  });
}

export function useSettings(): AppSettings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Undefined until the stored settings have loaded (so first-run screens don't flash for returning users). */
export function useStoredSettings(): AppSettings | undefined {
  return useLiveQuery(getSettings, []);
}
