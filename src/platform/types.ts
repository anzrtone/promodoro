/**
 * Native bridge contract. The engine, database and UI are shared; each shell
 * (Tauri desktop, Capacitor Android) implements this interface for the things a
 * WebView can't do reliably on its own: background alarms, files, tray/notifications.
 */

export interface AlarmSpec {
  /** Timer id. */
  id: string;
  /** Wall-clock epoch ms when it should ring. */
  at: number;
  title: string;
  body: string;
  soundId: string;
  /** No alarm sound. */
  silent: boolean;
  vibrate: boolean;
  /** No sound, no buzz, no pop-up: the goal is only noted quietly (overtime set to "Nothing"). */
  quiet: boolean;
}

export interface StatusSpec {
  /** e.g. "Focus · 12:04 left" — shown in the tray tooltip / ongoing notification. */
  text: string;
  /** Short title for the persistent notification, e.g. "Focusing on Math". */
  title: string;
  /** Static detail (end time) so we don't spam notification updates every second. */
  detail: string;
  running: boolean;
  /** Changes only when the static parts change; used to throttle native updates. */
  key: string;
}

export type NativeAction = 'toggle' | 'done' | 'show' | 'mini' | 'start-focus' | 'start-break';

export interface PlatformHandlers {
  /** A native alarm fired (desktop scheduler / notification tap). */
  onAlarm(timerId: string): void;
  /** Tray menu, global shortcut, or notification action. */
  onAction(action: NativeAction): void;
  /** App returned to foreground: re-settle timers from timestamps. */
  onResume(awayMs: number): void;
  onBackground(): void;
  /** Android hardware back. Return true if handled. */
  onBack?(): boolean;
}

export interface BackupWriteResult {
  path: string;
  pruned: number;
}

export interface Platform {
  kind: 'desktop' | 'android' | 'dev';
  /**
   * True when the OS plays the alarm sound itself (Android notification channels).
   * The in-app queue then stays quiet for on-time alarms to avoid ringing twice.
   */
  nativeAlarmSound(): boolean;
  init(h: PlatformHandlers): Promise<void>;
  /** Replace the full set of scheduled native alarms. */
  syncAlarms(alarms: AlarmSpec[]): Promise<void>;
  setStatus(status: StatusSpec | null): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;
  /** Let the user save an export somewhere (Save dialog on desktop, share sheet on Android). */
  saveExport(fileName: string, mime: string, contents: string): Promise<string | null>;
  /** Same as saveExport for binary data (e.g. the shareable PNG page), base64-encoded. */
  saveBinary(fileName: string, mime: string, base64: string): Promise<string | null>;
  vibrate(kind: 'tap' | 'alarm' | 'success'): void;

  /* ---- auto backup ---- */
  /** Whether the user must choose a folder (desktop) or it's fixed (Android). */
  backupFolderPickable: boolean;
  /** Ask the user for a folder. Returns null when cancelled. */
  pickBackupFolder(title?: string): Promise<string | null>;
  /** Dropbox / OneDrive / Google Drive / iCloud folders found on this computer, each with the "Promodoro Sync" folder inside it to use. */
  cloudFolders?(): Promise<Array<{ label: string; path: string }>>;
  /** Human-readable default/fixed location, if any. */
  defaultBackupFolder(): Promise<string | null>;
  /** Write one dated backup file atomically and keep only the newest `keep`. */
  writeBackup(dir: string | null, fileName: string, contents: string, keep: number): Promise<BackupWriteResult>;
  /* ---- folder sync ---- */
  /** Every `promodoro-sync-*.json` snapshot in the folder (this device's own file included). */
  readSyncFiles(dir: string | null): Promise<Array<{ name: string; text: string }>>;
  /** Write this device's snapshot file atomically. Returns where it landed. */
  writeSyncFile(dir: string | null, fileName: string, contents: string): Promise<string>;
  /** Open the folder in the OS file browser (desktop only). */
  revealFolder?(dir: string): Promise<void>;

  /* ---- desktop extras ---- */
  setMiniMode?(on: boolean): Promise<void>;
  setCloseToTray?(on: boolean): Promise<void>;
  quit?(): Promise<void>;
  minimize?(): Promise<void>;
  /** Open a link in the system browser / mail app. Without it the shared code falls back to window.open. */
  openExternal?(url: string): Promise<void>;
}
