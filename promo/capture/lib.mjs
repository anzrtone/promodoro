/**
 * Shared capture helpers: a Playwright page in filming mode (?promo=1), a CDP screencast recorder
 * that keeps each frame's timestamp, and gentle phone-style input (taps, eased scrolls, typing).
 *
 * Every shot writes promo/footage/<shot>.mp4 (constant 60 fps) and promo/footage/<shot>.json with
 * the clip's markers and taps in seconds from the clip's first frame, for Remotion to line up.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from './pw.cjs';

const { chromium } = pw;
const HERE = dirname(fileURLToPath(import.meta.url));
export const FOOTAGE = join(HERE, '..', 'footage');
export const APP = process.env.APP_URL ?? 'http://localhost:1420/?promo=1';

/** Wednesday 28 Oct 2026, 10:24 local: a weekday morning. */
export const DAY0 = new Date(2026, 9, 28, 10, 24, 0, 0).getTime();

// The scale is forced on the browser itself: with only the emulated deviceScaleFactor, the CDP
// screencast hands back CSS-pixel frames (412 wide), too soft for a 1080-wide trailer.
export const PHONE = { width: 412, height: 915, scale: 3, isMobile: true, hasTouch: true };
export const DESKTOP = { width: 1280, height: 800, scale: 2, isMobile: false, hasTouch: false };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Slow motion. At 3× the screencast only keeps up ~20 fps, so every take is filmed at RATE speed
 * (CSS animations through the CDP animation rate, JS time by stepping the Playwright clock) and
 * the encoder plays it back at real speed. Script timings use wait(), which is in app time.
 */
export const RATE = Number(process.env.RATE ?? 1 / 3);
export const wait = (ms) => sleep(ms / RATE);

export async function slowmo(page, rate = RATE) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  const STEP = 16;
  let on = true;
  const loop = (async () => {
    let last = Date.now();
    while (on) {
      await sleep(STEP);
      const now = Date.now();
      await page.clock.runFor(Math.max(1, Math.round((now - last) * rate))).catch(() => (on = false));
      last = now;
    }
  })();
  page.slowmo = { rate, stop: async () => ((on = false), await loop) };
}

export async function openApp({ device = PHONE, time = DAY0, setup } = {}) {
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${device.scale}`] });
  const { width, height, scale, ...rest } = device;
  const context = await browser.newContext({ viewport: { width, height }, ...rest, reducedMotion: 'no-preference' });
  context.scale = scale;
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.clock.install({ time });
  await page.goto(APP);
  await page.waitForSelector('nav button[data-tour=focus] >> visible=true', { timeout: 30000 });
  if (setup) await settings(page, setup);
  await sleep(1200);
  await slowmo(page);
  return { browser, context, page, close: async () => (await page.slowmo.stop(), await browser.close()) };
}

/** Change real app settings for a take (for example the theme), through the app's own module. */
export async function settings(page, patch) {
  await page.evaluate(async (p) => {
    const m = await import('/src/db/settings.ts');
    await m.updateSettings(p);
  }, patch);
  await sleep(300);
}

/** Records the page with Page.startScreencast; frames are written as they arrive. */
export class Recorder {
  constructor(page, shot) {
    this.page = page;
    this.shot = shot;
    this.dir = join(FOOTAGE, 'frames', shot);
    this.frames = [];
    this.marks = {};
    this.taps = [];
  }

  async start() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    const vp = this.page.viewportSize();
    const dpr = this.page.context().scale;
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      const i = this.frames.length;
      const file = `f${String(i).padStart(6, '0')}.jpg`;
      this.frames.push({ file, t: metadata.timestamp });
      writeFileSync(join(this.dir, file), Buffer.from(data, 'base64'));
      try {
        await this.cdp.send('Page.screencastFrameAck', { sessionId });
      } catch {
        /* recorder stopped */
      }
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 100, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
    // Nudge one repaint so the clip has a first frame straight away.
    await this.page.evaluate(() => document.body.style.setProperty('--rec', String(Math.random())));
    while (!this.frames.length) await sleep(10);
    this.t0 = this.frames[0].t;
  }

  /** Seconds of app time since the first frame. */
  now() {
    return (Date.now() / 1000 - this.t0) * RATE;
  }

  mark(name, at = this.now()) {
    this.marks[name] = +at.toFixed(4);
  }

  async stop(tail = 0.4) {
    await wait(tail * 1000);
    const end = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
    await sleep(150);
    return this.encode(end);
  }

  /** Concat the frames with their real durations, then resample to a constant 60 fps. */
  encode(end) {
    const lines = ['ffconcat version 1.0'];
    this.frames.forEach((f, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : end;
      lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, (next - f.t) * RATE).toFixed(6)}`);
    });
    lines.push(`file '${this.frames.at(-1).file}'`);
    const list = join(this.dir, 'list.ffconcat');
    writeFileSync(list, lines.join('\n'));
    const out = join(FOOTAGE, `${this.shot}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=60,crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-movflags', '+faststart', out]);
    const duration = (end - this.t0) * RATE;
    const gaps = this.frames.slice(1).map((f, i) => (f.t - this.frames[i].t) * RATE);
    const meta = { shot: this.shot, duration: +duration.toFixed(4), frames: this.frames.length, avgFps: +(this.frames.length / duration).toFixed(1), maxGap: +Math.max(0, ...gaps).toFixed(3), viewport: this.page.viewportSize(), marks: this.marks, taps: this.taps };
    writeFileSync(join(FOOTAGE, `${this.shot}.json`), JSON.stringify(meta, null, 2));
    console.log(`${this.shot}: ${meta.duration}s, ${meta.frames} frames (~${meta.avgFps} fps, max gap ${meta.maxGap}s) -> ${out}`);
    return meta;
  }
}

/** A phone tap with a short hold, logged for the ripple overlay. */
export async function tap(page, rec, selector, { hold = 110, before = 250, after = 350, offset } = {}) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const x = box.x + (offset?.x ?? box.width / 2);
  const y = box.y + (offset?.y ?? box.height / 2);
  await wait(before);
  rec?.taps.push({ t: +rec.now().toFixed(4), x: +x.toFixed(1), y: +y.toFixed(1) });
  // touchscreen.tap() has no hold, so press and release by hand.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(hold);
  await page.mouse.up();
  await wait(after);
  return { x, y };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Smoothly scroll an element (or the main scroller) by dy/dx pixels over `ms`. */
export async function smoothScroll(page, { selector = 'main', dy = 0, dx = 0, ms = 1200 } = {}) {
  await page.evaluate(
    async ({ selector, dy, dx, ms }) => {
      const el = document.querySelector(selector);
      const y0 = el.scrollTop;
      const x0 = el.scrollLeft;
      const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
      const t0 = performance.now();
      await new Promise((done) => {
        const step = () => {
          const t = Math.min(1, (performance.now() - t0) / ms);
          el.scrollTop = y0 + dy * e(t);
          el.scrollLeft = x0 + dx * e(t);
          if (t < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    },
    { selector, dy, dx, ms },
  );
}

/** A finger drag from a to b over `ms`, with eased steps. */
export async function drag(page, rec, a, b, ms = 900) {
  rec?.taps.push({ t: +rec.now().toFixed(4), x: a.x, y: a.y, drag: true });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await wait(120);
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
    await wait(16);
  }
  await wait(120);
  await page.mouse.up();
}

export async function type(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await wait(60 + Math.random() * 30);
  }
}

/** Tab-bar button at phone width (the desktop sidebar has the same data-tour). */
export const tabSel = (id) => `nav button[data-tour=${id}] >> visible=true`;
