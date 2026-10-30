/**
 * Bundle once, then render what's asked:
 *   node remotion/render.mjs stills 0 1 2      → out/frames/f<N>.png
 *   node remotion/render.mjs video             → out/frames/video-silent.mp4
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { webpackOverride } from './webpack.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(here, '..', 'out', 'frames');
mkdirSync(outDir, { recursive: true });
const browserExecutable = process.env.CHROME ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const [mode, ...args] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.join(here, 'index.ts'), publicDir: path.join(here, 'public'), webpackOverride });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'Trailer', browserExecutable });
const opts = { serveUrl, composition, browserExecutable, chromiumOptions: { gl: 'angle' }, logLevel: 'warn' };

if (mode === 'stills') {
  for (const a of args) {
    const frame = Number(a);
    const output = path.join(outDir, `f${String(frame).padStart(4, '0')}.png`);
    await renderStill({ ...opts, frame, output, imageFormat: 'png' });
    console.log(output);
  }
} else if (mode === 'video') {
  const output = path.join(outDir, 'video-silent.mp4');
  let last = -1;
  await renderMedia({
    ...opts,
    codec: 'h264',
    outputLocation: output,
    muted: true,
    videoBitrate: '20M',
    x264Preset: 'slow',
    pixelFormat: 'yuv420p',
    concurrency: Number(process.env.CONCURRENCY ?? 4),
    frameRange: process.env.RANGE ? process.env.RANGE.split('-').map(Number) : undefined,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 20);
      if (p !== last) console.log(`${(progress * 100).toFixed(0)}%`), (last = p);
    },
  });
  console.log(output);
}
