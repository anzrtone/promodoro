/**
 * Development fallback used only by `npm run dev` in a desktop browser while iterating
 * on UI. Not a shipped target: alarms ring from the in-page engine, exports download.
 */
import { setShade } from '@/dev/shade';
import type { Platform } from './types';

export const dev: Platform = {
  kind: 'dev',
  backupFolderPickable: false,
  nativeAlarmSound: () => false,
  async init(h) {
    setShade({ handlers: h });
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        h.onBackground();
      } else {
        h.onResume(hiddenAt ? Date.now() - hiddenAt : 0);
        hiddenAt = 0;
      }
    });
  },
  async syncAlarms() {},
  async setStatus(s) {
    document.title = s ? `${s.text} · Promodoro` : 'Promodoro';
    setShade({ status: s, statusAt: Date.now() });
  },
  async scheduleReport(r) {
    setShade({ report: r });
  },
  async requestNotificationPermission() {
    return true;
  },
  async saveExport(fileName, mime, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  },
  async saveBinary(fileName, mime, base64) {
    const a = Object.assign(document.createElement('a'), { href: `data:${mime};base64,${base64}`, download: fileName });
    a.click();
    return fileName;
  },
  vibrate() {},
  async pickBackupFolder() {
    return null;
  },
  async defaultBackupFolder() {
    return '(browser downloads — dev only)';
  },
  async readSyncFiles() {
    return [];
  },
  // The browser can't write into a folder, and these run on a timer (auto-sync, auto-backup): a Save dialog
  // popping up every few hours is worse than nothing. Use the Export buttons to test downloads here.
  async writeSyncFile(_dir, fileName) {
    return fileName;
  },
  async writeBackup(_dir, fileName) {
    return { path: fileName, pruned: 0 };
  },
};
