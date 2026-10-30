/**
 * The real <Pomo> (src/components/Pomo.tsx) flown along a path: position, size, a banking tilt in
 * the direction of travel, a lean toward whatever Pomo is presenting, and a mood timeline. The
 * wings, halo bob and sparkles are Pomo's own CSS animations (seeked per frame by anim.tsx).
 */
import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { Pomo, type PomoMood } from '@/components/Pomo';
import { clamp, track, type Ease, type Key } from '../anim';
import { FPS } from '../timing';

export interface Stop {
  t: number;
  x: number;
  y: number;
  /** Pomo's size in px. */
  s: number;
  /** Lean (deg) toward what Pomo presents. */
  lean?: number;
  /** Raise the screen-left / screen-right wing (deg): the wing-point gesture. */
  wl?: number;
  wr?: number;
  e?: Ease;
}

export interface PomoActorProps {
  path: Stop[];
  moods: Array<[t: number, mood: PomoMood]>;
  /** A wave with the screen-right wing over [from, to] seconds. */
  wave?: [number, number];
  /** From this time (s) Pomo stops drifting sideways (it still bobs). */
  steadyFrom?: number;
  /** Halo drop offset (px, in Pomo's 200-unit space), for the "halo drops into place" entrance. */
  haloDrop?: Key[];
  /** Hung under Pomo (the price tag): rendered in Pomo's moving frame. */
  carry?: (pos: { x: number; y: number; s: number; tilt: number }) => ReactNode;
  style?: CSSProperties;
}

const keys = (path: Stop[], pick: (s: Stop) => number): Key[] => path.map((s) => [s.t, pick(s), s.e]);

export function pomoAt(path: Stop[], frame: number, steadyFrom = Infinity) {
  const x = track(frame, keys(path, (s) => s.x));
  const y = track(frame, keys(path, (s) => s.y));
  const s = track(frame, keys(path, (s) => s.s));
  const lean = track(frame, keys(path, (s) => s.lean ?? 0));
  // Bank into the direction of travel (velocity in px per frame).
  const vx = track(frame + 1, keys(path, (s) => s.x)) - track(frame - 1, keys(path, (s) => s.x));
  const bank = clamp(vx * 0.55, -16, 16);
  // A slow idle float on top of Pomo's own bob, so a hovering Pomo never looks pinned.
  const t = frame / FPS;
  // (From `steadyFrom` the sideways drift settles out, so a centred Pomo stays centred.)
  const fx = Math.sin(t * 1.3) * 5 * (1 - clamp((t - steadyFrom) / 0.5, 0, 1));
  const fy = Math.sin(t * 2.1 + 1) * 7;
  return { x: x + fx, y: y + fy, s, tilt: bank + lean };
}

export function PomoActor({ path, moods, wave, steadyFrom, haloDrop, carry, style }: PomoActorProps) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const { x, y, s, tilt } = pomoAt(path, frame, steadyFrom);
  let mood: PomoMood = moods[0][1];
  let since = -1;
  for (const [mt, m] of moods)
    if (t >= mt) {
      mood = m;
      since = mt;
    }
  // A small squash-pop whenever the mood changes.
  const k = clamp((t - since) / 0.25, 0, 1);
  const popScale = since > 0 ? 1 + Math.sin(k * Math.PI) * 0.07 : 1;
  const drop = haloDrop ? track(frame, haloDrop) : 0;
  let wl = track(frame, keys(path, (p) => p.wl ?? 0));
  let wr = track(frame, keys(path, (p) => p.wr ?? 0));
  if (wave && t > wave[0] && t < wave[1]) {
    const k = (t - wave[0]) / (wave[1] - wave[0]);
    const env = Math.sin(Math.PI * k);
    wr += env * (38 + 22 * Math.sin(k * Math.PI * 2 * 3));
    wl += env * 6;
  }
  return (
    <>
      {carry?.({ x, y, s, tilt })}
      <div
        className="pomo-actor"
        style={{
          position: 'absolute',
          left: x - s / 2,
          top: y - s / 2,
          width: s,
          height: s,
          transform: `rotate(${tilt}deg) scale(${popScale})`,
          filter: 'drop-shadow(0 18px 22px rgb(45 49 46 / 0.16))',
          ['--halo-drop' as string]: `${drop}px`,
          ['--wing-l' as string]: `${wl}deg`,
          ['--wing-r' as string]: `${wr}deg`,
          ...style,
        }}
      >
        <Pomo mood={mood} size={s} />
      </div>
    </>
  );
}
