/**
 * Device sync, three ways to carry the same data (all of them end in mergeBackup):
 *
 *  relay   A pairing code. Each sync pulls the other devices' encrypted snapshot from the tiny relay
 *          server, merges it, and pushes the merged result back. The server only ever holds ciphertext.
 *  folder  Every device writes `promodoro-sync-<device>.json` into a folder that Dropbox / Drive / iCloud /
 *          Syncthing already keeps in sync, and merges the other devices' files. No server at all.
 *  file    Save a sync file on one device, merge it on the other. Fully manual.
 *
 * Syncing is safe to repeat and to run from several devices at once: each device always keeps its own
 * data and merges everything it sees, so the devices converge.
 */
import { buildBackup, BackupError, parseBackup } from '@/db/backup';
import { getSettings, updateSettings, type SyncSettings } from '@/db/settings';
import { formatAgo, MINUTE, uid } from '@/engine/time';
import { platform } from '@/platform';
import { decryptSnapshot, deriveKeys, encryptSnapshot, sha256Hex, WrongCodeError } from './crypto';
import { mergeBackup, mergedAnything, type MergeStats } from './merge';
import { RelayError, relayGet, relayPut } from './relay';

export { newSyncCode, normalizeSyncCode, formatSyncCode } from './crypto';

export type SyncResult =
  | { status: 'ok'; summary: string; pushed: boolean; stats: MergeStats }
  | { status: 'skipped'; reason: 'off' | 'busy' | 'no-folder' | 'no-code' }
  | { status: 'failed'; error: string };

const EMPTY: MergeStats = { sessions: 0, events: 0, rows: 0, deleted: 0, prefs: false };
const add = (a: MergeStats, b: MergeStats): MergeStats => ({
  sessions: a.sessions + b.sessions,
  events: a.events + b.events,
  rows: a.rows + b.rows,
  deleted: a.deleted + b.deleted,
  prefs: a.prefs || b.prefs,
});

export function summarize(s: MergeStats, pushed: boolean): string {
  const bits: string[] = [];
  if (s.sessions) bits.push(`${s.sessions} new session${s.sessions === 1 ? '' : 's'}`);
  if (s.rows) bits.push(`${s.rows} change${s.rows === 1 ? '' : 's'} to subjects, notes or tasks`);
  if (s.deleted) bits.push(`${s.deleted} removed`);
  if (s.prefs) bits.push('your settings');
  if (bits.length) return `Brought in ${bits.join(', ')}.`;
  return pushed ? 'Up to date. Sent your latest.' : 'Everything is already up to date.';
}

export const syncFileName = (deviceId: string) => `promodoro-sync-${deviceId}.json`;

async function ensureDeviceId(): Promise<string> {
  const s = await getSettings();
  if (s.sync.deviceId) return s.sync.deviceId;
  const deviceId = uid('d').replace(/[^\w-]/g, '').slice(0, 24);
  await updateSettings({ sync: { ...s.sync, deviceId } });
  return deviceId;
}

async function saveSync(patch: Partial<SyncSettings>): Promise<void> {
  const s = await getSettings();
  await updateSettings({ sync: { ...s.sync, ...patch } });
}

/** Fingerprint of the data itself (not when it was exported), so unchanged data is never re-sent. */
async function fingerprint(b: Awaited<ReturnType<typeof buildBackup>>): Promise<string> {
  return sha256Hex(JSON.stringify({ ...b, exportedAt: '' }));
}

let running = false;

export async function syncNow(): Promise<SyncResult> {
  if (running) return { status: 'skipped', reason: 'busy' };
  const s0 = await getSettings();
  const method = s0.sync.method;
  if (method !== 'relay' && method !== 'folder') return { status: 'skipped', reason: 'off' };
  running = true;
  try {
    const res = method === 'relay' ? await syncRelay() : await syncFolder();
    if (res.status === 'ok') await saveSync({ lastAt: Date.now(), lastError: null, lastSummary: res.summary });
    return res;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await saveSync({ lastError: error });
    return { status: 'failed', error };
  } finally {
    running = false;
  }
}

async function syncRelay(): Promise<SyncResult> {
  const s = await getSettings();
  if (!s.sync.code) return { status: 'skipped', reason: 'no-code' };
  const keys = await deriveKeys(s.sync.code);

  const blob = await relayGet(keys.id);
  let stats = EMPTY;
  const blobHash = blob ? await sha256Hex(blob) : null;
  if (blob) stats = await mergeBackup(parseBackup(await decryptSnapshot(blob, keys.key)), { honorDeletes: true });

  const backup = await buildBackup();
  const hash = await fingerprint(backup);
  const upToDate = blob !== null && s.sync.lastPushHash === hash && s.sync.lastBlobHash === blobHash;
  let pushed = false;
  if (!upToDate) {
    const out = await encryptSnapshot(JSON.stringify(backup), keys.key);
    await relayPut(keys.id, keys.token, out);
    await saveSync({ lastPushHash: hash, lastBlobHash: await sha256Hex(out) });
    pushed = true;
  }
  return { status: 'ok', summary: summarize(stats, pushed), pushed, stats };
}

async function syncFolder(): Promise<SyncResult> {
  const s = await getSettings();
  const p = platform();
  const dir = s.sync.dir;
  if (p.backupFolderPickable && !dir) return { status: 'skipped', reason: 'no-folder' };
  const deviceId = await ensureDeviceId();
  const own = syncFileName(deviceId);

  const files = await p.readSyncFiles(dir);
  let stats = EMPTY;
  let unreadable = 0;
  for (const f of files) {
    if (f.name === own) continue;
    try {
      stats = add(stats, await mergeBackup(parseBackup(f.text), { honorDeletes: true }));
    } catch {
      unreadable++; // half-synced or from a newer version: try again next time
    }
  }

  const backup = await buildBackup();
  const hash = await fingerprint(backup);
  const upToDate = s.sync.lastPushHash === hash && files.some((f) => f.name === own);
  let pushed = false;
  if (!upToDate) {
    await p.writeSyncFile(dir, own, JSON.stringify(backup));
    await saveSync({ lastPushHash: hash });
    pushed = true;
  }
  let summary = summarize(stats, pushed);
  if (!files.some((f) => f.name !== own)) summary = 'Saved this device’s data to the folder. Sync the other device to bring it together.';
  else if (unreadable && !mergedAnything(stats)) summary = `${summary} (${unreadable} file${unreadable === 1 ? ' is' : 's are'} still arriving.)`;
  return { status: 'ok', summary, pushed, stats };
}

/** Manual "file" method: a snapshot to carry to the other device by hand. */
export async function buildSyncFile(): Promise<{ name: string; text: string }> {
  const deviceId = await ensureDeviceId();
  return { name: syncFileName(deviceId), text: JSON.stringify(await buildBackup()) };
}

/** Manual "file" method: merge a snapshot from the other device, honoring its deletes. */
export async function mergeSyncFile(text: string): Promise<{ stats: MergeStats; summary: string }> {
  const stats = await mergeBackup(parseBackup(text), { honorDeletes: true });
  await saveSync({ lastAt: Date.now(), lastError: null, lastSummary: summarize(stats, false) });
  return { stats, summary: summarize(stats, false) };
}

export const describeSyncError = (err: unknown): string =>
  err instanceof RelayError || err instanceof WrongCodeError || err instanceof BackupError ? err.message : err instanceof Error ? err.message : String(err);

/** When did this device last sync, in words. */
export const lastSyncedLabel = (sync: SyncSettings, now = Date.now()) => (sync.lastAt ? `Last synced ${formatAgo(now - sync.lastAt)}` : 'Not synced yet');

/**
 * Background syncing for the relay and folder methods: shortly after launch, every 20 minutes, when the
 * app is put away (so the other device sees the latest) and when it comes back to the front.
 */
export function startAutoSyncLoop(): { stop(): void; nudge(): void } {
  let last = 0;
  const tick = async (minGapMs: number) => {
    if (Date.now() - last < minGapMs) return;
    const s = await getSettings();
    if (!s.sync.auto || (s.sync.method !== 'relay' && s.sync.method !== 'folder')) return;
    last = Date.now();
    await syncNow().catch(() => undefined);
  };
  const first = setTimeout(() => void tick(0), 20_000);
  const every = setInterval(() => void tick(10 * MINUTE), 20 * MINUTE);
  const onVisibility = () => void tick(document.hidden ? 2 * MINUTE : 10 * MINUTE);
  document.addEventListener('visibilitychange', onVisibility);
  return {
    stop() {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onVisibility);
    },
    nudge: () => void tick(2 * MINUTE),
  };
}
