#!/usr/bin/env node
/**
 * Records the scripted B-roll clips (src/dev/broll) as phone screen recordings.
 *
 *   npm run dev                       # in one terminal
 *   npm run broll:record              # all clips → broll/out/<clip>.mp4
 *   npm run broll:record -- stats flow --pace 1.15 --size 2160x3840
 *
 * Frames come straight from Chromium's compositor (CDP screencast, JPEG q95) and are encoded with
 * their real timestamps, so a clip plays back at exactly the speed it ran. Needs Playwright
 * (`npm i -D playwright`, or a global install) and ffmpeg on PATH.
 *
 * Options:
 *   --url <base>      dev server (default http://localhost:1420)
 *   --out <dir>       output folder (default broll/out)
 *   --viewport WxH    CSS viewport of the phone (default 414x736, 9:16)
 *   --size WxH        output video size (default 1080x1920, 9:16). If its shape differs from the
 *                     viewport's, the viewport height is adjusted to match, so nothing is letterboxed.
 *   --pace <n>        stretch every beat (1.2 = 20 % slower)
 *   --fps <n>         output frame rate (default 60)
 *   --tz <IANA zone>  phone's timezone. Default: a zone where it's early afternoon right now, because the demo
 *                     notebook places today's sessions a few hours before "now" (at 2 AM, today would be empty).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Install it with `npm i -D playwright` (or globally) and try again.');
  process.exit(1);
}

const ALL = ['intro', 'stats', 'export', 'import', 'sync', 'timeline', 'flow', 'subjects', 'outro'];
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const base = opt('url', 'http://localhost:1420');
const out = resolve(opt('out', 'broll/out'));
const pace = Number(opt('pace', '1'));
const fps = Number(opt('fps', '60'));
const wxh = (s) => s.split('x').map(Number);
// Default: a 9:16 phone (414×736 CSS px) rendered at 1080×1920, so clips drop into a vertical edit with no bars.
let [vw, vh] = wxh(opt('viewport', '414x736'));
const sizeArg = opt('size', null);
let [ow, oh] = (sizeArg ? wxh(sizeArg) : [1080, 1920]).map((n) => n - (n % 2)); // x264 needs even sides
if (Math.abs(ow / oh - vw / vh) > 0.01) {
  // Keep the phone's width and give it the output's shape, so nothing is stretched or letterboxed.
  vh = Math.round((vw * oh) / ow);
}
const scale = ow / vw;
const tz = opt('tz', null) ?? afternoonZone();
const clips = args.length ? args : ALL;

/** A timezone whose local time is closest to 2 PM, so every take shows a lived-in day. */
function afternoonZone() {
  const zones = ['Pacific/Honolulu', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Berlin', 'Europe/Athens', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
  const hour = (z) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    return Number(p.find((x) => x.type === 'hour').value) + Number(p.find((x) => x.type === 'minute').value) / 60;
  };
  return zones.reduce((best, z) => (Math.abs(hour(z) - 14) < Math.abs(hour(best) - 14) ? z : best));
}

if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg is needed to encode the clips. Install it and try again.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

console.log(`Phone: ${vw}×${vh} → ${ow}×${oh}, timezone ${tz}`);
const browser = await chromium.launch();
for (const clip of clips) {
  process.stdout.write(`● ${clip} … `);
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, colorScheme: 'light', reducedMotion: 'no-preference', timezoneId: tz });
  const page = await ctx.newPage();
  // Belt and braces: the DEV pill is never mounted in b-roll mode, and it's hidden here too.
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'body > div:not(#root) > div[style*="position: fixed"][style*="z-index: 9999"] { display: none !important; }';
      document.head.appendChild(s);
    });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  let recording = false;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    if (recording) frames.push({ data, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });

  await page.goto(`${base}/?broll=${encodeURIComponent(clip)}&pace=${pace}`);
  await page.waitForFunction(() => ['playing', 'error'].includes(window.__broll?.state), null, { timeout: 30_000 });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: ow, maxHeight: oh, everyNthFrame: 1 });
  recording = true;
  await page.waitForFunction(() => ['done', 'error'].includes(window.__broll?.state), null, { timeout: 180_000 });
  await page.waitForTimeout(400);
  const end = Date.now() / 1000;
  recording = false;
  await cdp.send('Page.stopScreencast');
  const status = await page.evaluate(() => window.__broll);
  await ctx.close();

  if (status.state === 'error' || !frames.length) {
    console.log(`failed: ${status.error ?? 'no frames'}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
    continue;
  }

  // Each frame lasts until the next one arrived (the screencast only sends frames when pixels change).
  const dir = mkdtempSync(join(tmpdir(), `broll-${clip}-`));
  const list = [];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1]?.t ?? end;
    list.push(`file '${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(join(dir, 'list.txt'), list.join('\n'));
  const file = join(out, `${clip}.mp4`);
  const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', `scale=${ow}:${oh}:flags=lanczos,fps=${fps},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', file], { cwd: dir, stdio: 'inherit' });
  rmSync(dir, { recursive: true, force: true });
  console.log(enc.status === 0 ? `${file} (${(end - frames[0].t).toFixed(1)} s, ${ow}×${oh})` : 'ffmpeg failed');
}
await browser.close();
