/**
 * The edit as data: which capture plays when (and how it maps to the clip), and every caption.
 * Pure (no React), so the SFX stem (audio/render-sfx.ts) places its sounds from the same numbers.
 */
import type { Segment, Tap } from './components/Phone';
import type { CaptionLine } from './components/Paper';
import { FLIP, FPS, MONTAGE, SYNC, T } from './timing';
import forgot from '../footage/forgot.json';
import timeline from '../footage/timeline.json';
import stats from '../footage/stats.json';
import stickers from '../footage/stickers.json';

const taps = (j: { taps: Tap[] }) => j.taps;

/**
 * The countdown clip's first frame showing +00:00. The DOM marker (marks['+00:00']) fires about two
 * frames before the screencast shows it, so this is measured on the clip itself (frame 262 of the
 * current take; re-check with a frame grab after re-recording). It lands on frame 331 (T.flow).
 */
const ZERO_FRAME = 262.4;
const ZERO = ZERO_FRAME / FPS;

/*
 * Push-ins (zoom.s) are set so the focal UI's text reads at about 32 px or more in the frame: the
 * screen shows the 412-px-wide capture at 1.43×, so 13 px chips need 1.72×, 16 px text 1.4×.
 * On the Focus screen the origin sits low, so the push-in crops the app's own Pomo (y ≤ 300 in the
 * capture) out of view rather than enlarging it past the guide Pomo.
 */
export const SEGMENTS: Segment[] = [
  // Gentle Flow: the +00:01 timer and the overtime line
  { shot: 'countdown', from: 3.0, to: T.forgot, clip: 3.0 - SYNC.zero / FPS + ZERO, zoom: { ox: 0.5, oy: 0.95, s: 1.55, at: T.flow } },
  // Get time back: the "I started…" chips
  { shot: 'forgot', from: T.forgot, to: T.timeline, clip: 0.4, zoom: { ox: 0.5, oy: 0.8, s: 1.72 }, taps: taps(forgot) },
  // Honest history: the claimed gap
  { shot: 'timeline', from: T.timeline, to: T.stats, clip: 1.1, rate: 1.4, zoom: { ox: 0.5, oy: 0.24, s: 1.6 }, taps: taps(timeline) },
  // Stats: the big total and the tiles (left column whole, the right one's figures)
  { shot: 'stats', from: T.stats, to: T.stickers, clip: 1.45, rate: 1.12, zoom: { ox: 0.1, oy: 0.2, s: 1.5 }, taps: taps(stats) },
  // No streaks: the "Rest counts" card, brought to the middle of the screen
  { shot: 'stickers', from: T.stickers, to: T.montage, clip: 1.55, zoom: { ox: 1.155, oy: 0.64, s: 1.5 }, taps: taps(stickers) },
  { shot: 'm-focusmode', from: MONTAGE[0], to: MONTAGE[1], clip: 1.6, turn: FLIP },
  { shot: 'm-subjects', from: MONTAGE[1], to: MONTAGE[2], clip: 1.25, turn: FLIP },
  { shot: 'm-share', from: MONTAGE[2], to: MONTAGE[3], clip: 1.45, turn: FLIP },
  { shot: 'm-sync', from: MONTAGE[3], to: T.free, clip: 1.3, turn: FLIP },
  { shot: 'idle', from: T.free, to: 30, clip: 0, rate: 0.8 },
];


export interface Caption {
  from: number;
  to: number;
  lines: Array<string | CaptionLine>;
  write?: number;
  size?: number;
  y?: number;
}

export const CAPTIONS: Caption[] = [
  { from: 0.42, to: 5.3, write: 0.8, lines: ["Hi! I'm Pomo."] },
  { from: 5.6, to: 8.2, lines: ['Keep going', 'past zero.'] },
  { from: 8.36, to: 10.95, lines: ['Forgot to start?', 'Get it back.'] },
  { from: 11.11, to: 13.71, lines: ['No judgment.', 'Just your day.'] },
  { from: 13.87, to: 16.47, lines: ['Watch your weeks', 'take shape.'] },
  { from: 16.63, to: 19.23, lines: ['No streaks.', 'Just stickers.'] },
  { from: T.free, to: T.end - 0.15, write: 0.42, size: 116, lines: ['Every feature.', { text: 'Free forever.', mark: 'forever' }] },
  { from: T.end + 0.08, to: 31, lines: ['Focus at', 'your own pace.'] },
];

/** The "why" lines, on the sticky note. */
export const WHY: Caption = { from: T.why + 0.2, to: T.end - 0.1, y: 1368, size: 60, write: 0.55, lines: ['No account. No trial.', 'Made for students on a budget.'] };

/** When each caption line starts writing, and for how long (matches HandCaption). */
export function lineTimes(c: Caption): Array<{ at: number; dur: number }> {
  const write = c.write ?? 0.5;
  let at = c.from;
  return c.lines.map((l) => {
    const dur = write * (0.45 + 0.55 * Math.min(1, (typeof l === 'string' ? l : l.text).length / 16));
    const r = { at, dur };
    at += dur + 0.06;
    return r;
  });
}
