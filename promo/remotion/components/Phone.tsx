/**
 * A clean Android phone drawn in CSS, the real app captures playing on its screen, paper page-turns
 * between features, slow push-ins on the part of the UI being shown, and halo-yellow tap ripples.
 */
import type { CSSProperties, ReactNode } from 'react';
import { OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { clamp, inOut, out } from '../anim';
import { FPS, fr, PHONE, SCREEN_H, TURN } from '../timing';

export interface Tap {
  t: number;
  x: number;
  y: number;
}

export interface Segment {
  shot: string;
  /** Composition seconds this page is the one in front. */
  from: number;
  to: number;
  /** Clip seconds shown at `from`. */
  clip: number;
  rate?: number;
  /** Push-in: scale s0→s1 across the page, around (ox, oy) as fractions of the screen. */
  zoom?: { ox: number; oy: number; s0: number; s1: number };
  taps?: Tap[];
  /** Page-turn length into this page (frames). */
  turn?: number;
}

const BODY_W = PHONE.screenW + PHONE.bezel * 2;
const BODY_H = SCREEN_H + PHONE.bezel * 2;
const PX = PHONE.screenW / 412; // capture CSS px → composition px

export function PhoneFrame({ x = PHONE.cx, y = PHONE.cy, scale = 1, rotate = 0, rotX = 0, rotY = 0, dim = 0, children, style }: { x?: number; y?: number; scale?: number; rotate?: number; rotX?: number; rotY?: number; dim?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - BODY_W / 2,
        top: y - BODY_H / 2,
        width: BODY_W,
        height: BODY_H,
        transform: `perspective(2600px) rotate(${rotate}deg) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`,
        ...style,
      }}
    >
      {/* side keys */}
      <div style={{ position: 'absolute', right: -5, top: 250, width: 6, height: 120, borderRadius: 4, background: 'rgb(45 49 46 / 0.85)' }} />
      <div style={{ position: 'absolute', right: -5, top: 400, width: 6, height: 70, borderRadius: 4, background: 'rgb(45 49 46 / 0.85)' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: PHONE.radius,
          background: 'rgb(45 49 46 / 0.9)',
          boxShadow: '0 50px 90px -40px rgb(45 49 46 / 0.45), 0 10px 30px -16px rgb(45 49 46 / 0.25), inset 0 0 0 2px rgb(255 255 255 / 0.06)',
          padding: PHONE.bezel,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: PHONE.radius - PHONE.bezel, overflow: 'hidden', background: 'rgb(var(--pm-creme))', isolation: 'isolate' }}>
          {children}
          {/* punch-hole camera */}
          <div style={{ position: 'absolute', top: 14, left: '50%', width: 20, height: 20, marginLeft: -10, borderRadius: 99, background: '#1F2220', boxShadow: 'inset 0 0 0 3px #2D312E' }} />
          {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgb(45 49 46 / ${dim * 0.5})` }} />}
          {/* a faint glass sheen */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgb(255 255 255 / 0.10), transparent 35%)', pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
}

/** Which frames a page is on screen, including the turns in and out. */
function span(segs: Segment[], i: number) {
  const s = segs[i];
  const tin = s.turn ?? TURN;
  const tout = segs[i + 1]?.turn ?? TURN;
  const a = fr(s.from) - (i === 0 ? 0 : Math.ceil(tin / 2));
  const b = fr(s.to) + (i === segs.length - 1 ? 0 : Math.ceil(tout / 2));
  return { a, b, tout };
}

export function ScreenTrack({ segments }: { segments: Segment[] }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {segments
        .map((s, i) => ({ s, i, ...span(segments, i) }))
        .filter(({ a, b }) => frame >= a - 2 && frame < b)
        // the outgoing page sits on top while it turns
        .sort((p, q) => q.i - p.i)
        .map(({ s, i, a, b, tout }) => {
          const boundary = fr(s.to);
          const p = i < segments.length - 1 ? clamp((frame - (boundary - tout / 2)) / tout, 0, 1) : 0;
          return (
            <Page key={s.shot + i} seg={s} start={a} end={b} turn={inOut(p)} />
          );
        })}
    </div>
  );
}

function Page({ seg, start, end, turn }: { seg: Segment; start: number; end: number; turn: number }) {
  const frame = useCurrentFrame();
  const rate = seg.rate ?? 1;
  // Clip frame at the start of this sequence (the page shows a little before `from`, during the turn in).
  const clipAtStart = seg.clip - ((fr(seg.from) - start) / FPS) * rate;
  const z = seg.zoom;
  const zp = z ? out(clamp((frame / FPS - seg.from) / (seg.to - seg.from), 0, 1)) : 0;
  const scale = z ? z.s0 + (z.s1 - z.s0) * zp : 1;
  const angle = turn * 100;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transformOrigin: 'left center',
        transform: turn > 0 ? `perspective(1800px) rotateY(${-angle}deg)` : undefined,
        backfaceVisibility: 'hidden',
        opacity: turn > 0.92 ? 1 - (turn - 0.92) / 0.08 : 1,
        boxShadow: turn > 0 ? `${-20 * turn}px 0 40px rgb(45 49 46 / ${0.25 * turn})` : undefined,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transformOrigin: z ? `${z.ox * 100}% ${z.oy * 100}%` : undefined, transform: `scale(${scale})` }}>
        <Sequence from={start} durationInFrames={end - start} layout="none">
          <OffthreadVideo src={staticFile(`footage/${seg.shot}.mp4`)} startFrom={Math.max(0, Math.round(clipAtStart * FPS))} playbackRate={rate} muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        </Sequence>
        {seg.taps?.map((tap, k) => <Ripple key={k} at={seg.from + (tap.t - seg.clip) / rate} x={tap.x * PX} y={tap.y * PX} />)}
      </div>
      {/* paper shading as the page lifts */}
      {turn > 0 && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgb(45 49 46 / ${0.05 + turn * 0.25}), rgb(255 255 255 / ${turn * 0.25}) 70%, rgb(45 49 46 / ${turn * 0.3}))` }} />}
    </div>
  );
}

/** A soft halo-yellow ripple where a finger touched (no cursor: this is a phone). */
export function Ripple({ at, x, y }: { at: number; x: number; y: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS - at;
  if (t < -0.06 || t > 0.6) return null;
  const press = clamp((t + 0.06) / 0.08, 0, 1) * (1 - clamp((t - 0.12) / 0.2, 0, 1));
  const k = clamp(t / 0.55, 0, 1);
  const r = 18 + 62 * out(k);
  return (
    <>
      <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '4px solid rgb(233 200 92 / 0.9)', background: 'rgb(255 232 147 / 0.35)', opacity: t < 0 ? 0 : 1 - k }} />
      <div style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: '50%', background: 'rgb(255 232 147 / 0.75)', opacity: press }} />
    </>
  );
}
