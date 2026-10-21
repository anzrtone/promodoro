/**
 * Automatic backups to a folder the user owns.
 *
 * Desktop: any folder the user picks (point it at a Dropbox / OneDrive / Google Drive
 * folder and their own cloud keeps an off-device copy, at zero cost to anyone).
 * Android: the public Documents/Promodoro folder, which survives uninstalling the app.
 *
 * One file per day (`promodoro-backup-YYYY-MM-DD.json`, rewritten if run twice that
 * day); only the newest `keep` files are retained. Each file is a full JSON backup that
 * Settings → Data → Restore can read on any device.
 */
import { exportJSON } from '@/db/backup';
import { getSettings, updateSettings, type AutoBackupSettings } from '@/db/settings';
import { HOUR, MINUTE, localDay } from '@/engine/time';
import { platform } from '@/platform';

export const backupFileName = (now = Date.now()) => `promodoro-backup-${localDay(now)}.json`;

export type BackupOutcome =
  | { status: 'written'; path: string; pruned: number }
  | { status: 'skipped'; reason: 'disabled' | 'not-due' | 'no-folder' | 'busy' }
  | { status: 'failed'; error: string };

let running = false;

export function isDue(ab: AutoBackupSettings, now = Date.now()): boolean {
  if (!ab.enabled) return false;
  if (!ab.lastAt) return true;
  return now - ab.lastAt >= Math.max(1, ab.intervalHours) * HOUR - 5 * MINUTE;
}

export async function runAutoBackup(opts: { force?: boolean } = {}): Promise<BackupOutcome> {
  if (running) return { status: 'skipped', reason: 'busy' };
  const s = await getSettings();
  const ab = s.autoBackup;
  if (!opts.force && !ab.enabled) return { status: 'skipped', reason: 'disabled' };
  if (!opts.force && !isDue(ab)) return { status: 'skipped', reason: 'not-due' };
  const p = platform();
  if (p.backupFolderPickable && !ab.dir) return { status: 'skipped', reason: 'no-folder' };

  running = true;
  const now = Date.now();
  try {
    const json = await exportJSON();
    const res = await p.writeBackup(ab.dir, backupFileName(now), json, Math.max(1, ab.keep));
    const fresh = await getSettings();
    await updateSettings({
      lastBackupAt: now,
      autoBackup: { ...fresh.autoBackup, lastAt: now, lastPath: res.path, lastError: null },
    });
    return { status: 'written', path: res.path, pruned: res.pruned };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const fresh = await getSettings();
    await updateSettings({ autoBackup: { ...fresh.autoBackup, lastError: error } });
    return { status: 'failed', error };
  } finally {
    running = false;
  }
}

/**
 * Check on launch (after a short settle delay), every 30 minutes while open, and when
 * the app goes to the background — a natural "end of a work stretch" moment.
 */
export function startAutoBackupLoop(): { stop(): void; nudge(): void } {
  const tick = () => void runAutoBackup().catch(() => undefined);
  const first = setTimeout(tick, 15_000);
  const every = setInterval(tick, 30 * MINUTE);
  return {
    stop() {
      clearTimeout(first);
      clearInterval(every);
    },
    nudge: tick,
  };
}
