/**
 * Development fallback used only by `npm run dev` in a desktop browser while iterating
 * on UI. Not a shipped target: alarms ring from the in-page engine, exports download.
 */
import type { Platform } from './types';

export const dev: Platform = {
  kind: 'dev',
  backupFolderPickable: false,
  nativeAlarmSound: () => false,
  async init(h) {
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
  async writeBackup(_dir, fileName, contents) {
    await dev.saveExport(fileName, 'application/json', contents);
    return { path: fileName, pruned: 0 };
  },
};
