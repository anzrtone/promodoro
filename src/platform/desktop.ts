/**
 * Desktop shell (Tauri 2, Windows .exe / macOS / Linux).
 *
 * Alarms are scheduled in Rust (src-tauri/src/alarms.rs), not in JS, so they fire on
 * time even when the window is hidden in the tray and the WebView is throttled. Rust
 * shows the OS notification and emits `alarm-fired`; the UI then plays the sound.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import type { AlarmSpec, BackupWriteResult, NativeAction, Platform, PlatformHandlers, StatusSpec } from './types';

let lastStatus = '';
let hiddenAt = 0;

export const desktop: Platform = {
  kind: 'desktop',
  backupFolderPickable: true,
  nativeAlarmSound: () => false,

  async init(h: PlatformHandlers) {
    await listen<string>('alarm-fired', (e) => h.onAlarm(e.payload));
    await listen<NativeAction>('native-action', (e) => h.onAction(e.payload));
    const win = getCurrentWindow();
    await win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        h.onResume(hiddenAt ? Date.now() - hiddenAt : 0);
        hiddenAt = 0;
      } else {
        hiddenAt = Date.now();
        h.onBackground();
      }
    });
  },

  async syncAlarms(alarms: AlarmSpec[]) {
    await invoke('schedule_alarms', {
      alarms: alarms.map((a) => ({ id: a.id, atMs: a.at, title: a.title, body: a.body })),
    });
  },

  async setStatus(status: StatusSpec | null) {
    const text = status ? status.text : '';
    if (text === lastStatus) return;
    lastStatus = text;
    await invoke('set_status', { text: status ? text : null });
  },

  async requestNotificationPermission() {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === 'granted';
  },

  async saveExport(fileName, _mime, contents) {
    const ext = fileName.split('.').pop() ?? 'txt';
    const path = await save({ defaultPath: fileName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    await invoke('write_text_file', { path, contents });
    return path;
  },

  async saveBinary(fileName, _mime, base64) {
    const ext = fileName.split('.').pop() ?? 'png';
    const path = await save({ defaultPath: fileName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    await invoke('write_base64_file', { path, base64 });
    return path;
  },

  vibrate() {
    /* no haptics on desktop */
  },

  async pickBackupFolder() {
    const dir = await open({ directory: true, multiple: false, title: 'Choose a folder for Promodoro backups' });
    return typeof dir === 'string' ? dir : null;
  },

  async defaultBackupFolder() {
    return invoke<string>('default_backup_dir');
  },

  async writeBackup(dir, fileName, contents, keep) {
    const target = dir ?? (await invoke<string>('default_backup_dir'));
    return invoke<BackupWriteResult>('backup_write', { dir: target, fileName, contents, keep });
  },

  async revealFolder(dir) {
    await invoke('reveal_folder', { dir });
  },

  async setMiniMode(on) {
    await invoke('set_mini_mode', { on });
  },

  async setCloseToTray(on) {
    await invoke('set_close_to_tray', { on });
  },

  async quit() {
    await invoke('quit_app');
  },

  async minimize() {
    await getCurrentWindow().minimize();
  },
};
