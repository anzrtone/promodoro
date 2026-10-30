/**
 * Motion helpers, and the clock that keeps CSS animations frame-accurate.
 *
 * Remotion renders frames out of order across several tabs, so a CSS animation left running would
 * drift. Every animation is paused (styles.css) and seeked here, once per frame, by setting a
 * negative animation-delay from the composition time. Each element's own delay (Pomo sets some
 * inline: wing flaps, sparkles) is read once and kept, so the offsets still stack.
 */
import { useLayoutEffect } from 'react';
import { Easing, useCurrentFrame } from 'remotion';
import { FPS } from './timing';

export type Ease = (t: number) => number;

/** The app's `pop` curve: cubic-bezier(.2,.9,.3,1.3). */
export const pop: Ease = Easing.bezier(0.2, 0.9, 0.3, 1.3);
export const inOut: Ease = Easing.bezier(0.45, 0, 0.55, 1);
export const out: Ease = Easing.bezier(0.2, 0.8, 0.3, 1);
export const inQuad: Ease = Easing.bezier(0.55, 0, 1, 0.45);

/** A keyframe track in seconds: [time, value, easing into this key]. Holds outside the range. */
export type Key = [t: number, v: number, e?: Ease];

export function track(frame: number, keys: Key[]): number {
  const t = frame / FPS;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (e ?? inOut)(p);
    }
  }
  return keys[keys.length - 1][1];
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 0→1 over [from, to] seconds, eased. */
export const prog = (frame: number, from: number, to: number, e: Ease = inOut) => e(clamp((frame / FPS - from) / (to - from), 0, 1));

export function CssAnimationClock() {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    const t = frame / FPS;
    document.querySelectorAll<HTMLElement | SVGElement>('[class*="animate-"]').forEach((el) => {
      if (el.dataset.delay0 === undefined) el.dataset.delay0 = getComputedStyle(el).animationDelay;
      el.style.animationDelay = el.dataset.delay0
        .split(',')
        .map((d) => `${(parseFloat(d) || 0) - t}s`)
        .join(', ');
    });
  });
  return null;
}
