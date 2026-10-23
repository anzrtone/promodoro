/**
 * B-roll mode: `npm run dev`, then open `http://localhost:1420/?broll=<clip>` (add `&pace=1.2` to slow
 * every beat down). The app boots into its own throwaway copy of the preview notebook, re-seeded on every
 * load, with the DEV pill never mounted, then a script plays the clip on the real UI. A 414×736 (9:16) browser
 * window (or `npm run broll:record`) turns it into a phone screen recording.
 *
 * `window.__broll` reports progress: { clip, state: 'loading' | 'playing' | 'done' | 'error', error? }.
 */
import { db } from '@/db/schema';
import { updateSettings } from '@/db/settings';
import { buildBackup } from '@/db/backup';
import { DAY, HOUR, MINUTE, dayStart, localDay, today, tzNow } from '@/engine/time';
import type { Session } from '@/engine/types';
import { navigate } from '@/features/nav';
import { platform } from '@/platform';
import { brollClip } from '@/dev/flag';
import { ensurePreviewSeeded } from '@/dev/preview';
import { CLIPS } from './clips';
import { installStage, setPace } from './director';

type Status = { clip: string; state: 'loading' | 'playing' | 'done' | 'error'; error?: string };
const report = (s: Status) => {
  (window as unknown as { __broll: Status }).__broll = s;
  window.dispatchEvent(new CustomEvent('broll:state', { detail: s }));
};

/** Before the app renders: fresh notebook, clip settings, and stand-ins for the native bits a clip touches. */
export async function prepareBroll(): Promise<void> {
  const clip = brollClip()!;
  report({ clip, state: 'loading' });
  await db.delete();
  await db.open();
  await ensurePreviewSeeded();
  await updateSettings({
    // Big full-screen focus mode is the intro's money shot; Gentle Flow needs the card's overtime readout.
    focusModeAuto: clip === 'intro',
    ambientAutoplay: false,
    // Recorded silently: the voice-over carries the audio.
    silent: true,
  });
  stubPlatform();
  stubFilePicker();
}

/** After the first render: run the clip. */
export async function runBroll(): Promise<void> {
  const clip = brollClip()!;
  const play = CLIPS[clip];
  const params = new URLSearchParams(location.search);
  setPace(Number(params.get('pace') ?? 1));
  installStage();
  if (!play) {
    report({ clip, state: 'error', error: `Unknown clip "${clip}". Try: ${Object.keys(CLIPS).join(', ')}` });
    console.error(`b-roll: unknown clip "${clip}"`);
    return;
  }
  navigate('focus');
  // Let fonts, Pomo and the first live queries settle so frame one is already a finished screen.
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 900));
  report({ clip, state: 'playing' });
  try {
    await play();
    report({ clip, state: 'done' });
  } catch (err) {
    console.error(err);
    report({ clip, state: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

/* ---------- stand-ins ---------- */

function stubPlatform() {
  const p = platform();
  Object.assign(p, {
    // No real download dialog mid-take; the app still shows its "Exported ✓" toast.
    saveExport: async (fileName: string) => fileName,
    // The sync clip picks Google Drive, and "the other device" (a phone) has a few sessions to bring in.
    cloudFolders: async () => [
      { label: 'Google Drive', path: 'G:\\My Drive\\Promodoro Sync' },
      { label: 'Dropbox', path: 'C:\\Users\\Anzar\\Dropbox\\Promodoro Sync' },
    ],
    readSyncFiles: async () => {
      await new Promise((r) => setTimeout(r, 1100)); // long enough to see the spinner
      return [{ name: 'promodoro-sync-pixel-8.json', text: JSON.stringify(await phoneBackup()) }];
    },
    writeSyncFile: async (_dir: string | null, fileName: string) => fileName,
  });
}

/** The "phone" copy: everything this device has, plus last night's sessions that only the phone saw. */
async function phoneBackup() {
  const b = await buildBackup();
  const y = dayStart(today()) - DAY;
  const extra: Session[] = [
    [19 * HOUR + 5 * MINUTE, 30, 'pv-b-anat'],
    [19 * HOUR + 45 * MINUTE, 25, 'pv-b-anat'],
    [20 * HOUR + 20 * MINUTE, 45, 'pv-b-read'],
    [21 * HOUR + 15 * MINUTE, 25, 'pv-b-calc'],
    [21 * HOUR + 50 * MINUTE, 30, 'pv-b-gen'],
  ].map(([at, min, boardId], i) => {
    const start = y + (at as number);
    const ms = (min as number) * MINUTE;
    return { id: `pv-phone-${i}`, start, end: start + ms, tz: tzNow(start), day: localDay(start), phase: 'focus', mode: 'countdown', boardId: boardId as string, plannedMs: ms, actualMs: ms, timedMs: ms, recoveredMs: 0, pausedMs: 0, overtimeMs: 0, source: 'timed', endReason: 'complete', createdAt: start } satisfies Session;
  });
  return { ...b, sessions: [...b.sessions, ...extra] };
}

/** The import clip "picks" a Forest export: the app's own hidden <input type=file> receives it. */
function stubFilePicker() {
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    if (this.type !== 'file') return click.call(this);
    const file = new File([forestCsv()], 'forest-sessions.csv', { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(file);
    this.files = dt.files;
    setTimeout(() => this.dispatchEvent(new Event('change')), 650 * Number(new URLSearchParams(location.search).get('pace') ?? 1));
  };
}

/** Roughly four months of Forest history, ending before the preview notebook's own sessions begin. */
function forestCsv(): string {
  let rnd = 11;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const tags = ['Study', 'Study', 'Work', 'Reading', 'Coding', 'Study', 'Work'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };
  const lines = ['Start Time,End Time,Tag,Note,Tree Type,Is Success'];
  for (let d = 150; d >= 35; d--) {
    if (r() < 0.3) continue;
    let t = dayStart(today()) - d * DAY + (8 + Math.floor(r() * 4)) * HOUR;
    const n = 1 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const min = [25, 25, 30, 45, 60][Math.floor(r() * 5)];
      const end = t + min * MINUTE;
      lines.push(`${fmt(t)},${fmt(end)},${tags[Math.floor(r() * tags.length)]},,Cedar,True`);
      t = end + (10 + Math.floor(r() * 60)) * MINUTE;
    }
  }
  return lines.join('\n');
}
