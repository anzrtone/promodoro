/**
 * Everything drawn on the notebook page itself: the page, Pomo's handwritten captions, the marker
 * swipe, the montage words, the $0 price tag, the doodled padlock, the desktop window and the end card.
 */
import type { CSSProperties, ReactNode } from 'react';
import { OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { clamp, inQuad, out, pop, prog } from '../anim';
import { FPS, fr, W } from '../timing';

const INK = 'rgb(45 49 46)';

/** The app's .bg-notebook: crème, a sand rule every line, a pink margin rule, plus light paper grain. */
export function NotebookBg({ drift = 0 }: { drift?: number }) {
  const LINE = 42; // the app's 28 px rule at the trailer's 1.5× scale
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FDFBF7', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -LINE,
          transform: `translateY(${drift % LINE}px)`,
          backgroundImage: [
            'linear-gradient(90deg, transparent 96px, #F4A2A2 96px, #F4A2A2 99px, transparent 99px)',
            `repeating-linear-gradient(180deg, transparent 0, transparent ${LINE - 2}px, #E5DFD1 ${LINE - 2}px, #E5DFD1 ${LINE}px)`,
          ].join(','),
        }}
      />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'multiply' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.9 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      {/* warm vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, transparent 55%, rgb(229 223 209 / 0.45))' }} />
    </div>
  );
}

export interface CaptionLine {
  text: string;
  /** Underline this word with a halo marker swipe. */
  mark?: string;
}

/**
 * Patrick Hand captions written on left to right (a soft-edged reveal, like ink following the pen).
 * Lines write one after another; the whole caption lifts away at `to`.
 */
export function HandCaption({ from, to, lines, y = 150, size = 104, x = W / 2 - 20, write = 0.5, markAt }: { from: number; to: number; lines: Array<string | CaptionLine>; y?: number; size?: number; x?: number; write?: number; markAt?: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < from - 0.05 || t > to + 0.3) return null;
  const leave = clamp((t - to) / 0.18, 0, 1);
  const durs = lines.map((l) => write * (0.45 + 0.55 * Math.min(1, (typeof l === 'string' ? l : l.text).length / 16)));
  let at = from;
  return (
    <div style={{ position: 'absolute', left: 0, width: W, top: y, opacity: 1 - leave, transform: `translateY(${-14 * leave}px)` }}>
      {lines.map((l, i) => {
        const line = typeof l === 'string' ? { text: l } : l;
        const start = at;
        at += durs[i] + 0.06;
        const p = clamp((t - start) / durs[i], 0, 1);
        const edge = p * 112 - 6;
        const mask = `linear-gradient(90deg, #000 ${edge - 6}%, transparent ${edge + 6}%)`;
        return (
          <div key={i} style={{ position: 'relative', width: W, textAlign: 'center', transform: `translateX(${x - W / 2}px)` }}>
            <span style={{ position: 'relative', display: 'inline-block', fontFamily: '"Patrick Hand"', fontSize: size, lineHeight: 1.08, color: INK, whiteSpace: 'pre' }}>
              {line.mark ? <MarkedText text={line.text} word={line.mark} at={markAt ?? start + durs[i] + 0.1} size={size} /> : null}
              <span style={{ position: 'relative', WebkitMaskImage: mask, maskImage: mask }}>{line.text}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The halo marker swipe behind one word of a line (positioned by measuring with a hidden copy). */
function MarkedText({ text, word, at, size }: { text: string; word: string; at: number; size: number }) {
  const i = text.indexOf(word);
  return (
    <span aria-hidden style={{ position: 'absolute', inset: 0, whiteSpace: 'pre', color: 'transparent' }}>
      {text.slice(0, i)}
      <span style={{ position: 'relative' }}>
        <MarkerSwipe at={at} width={size * 0.42 * word.length + 24} height={size * 0.42} style={{ position: 'absolute', left: -12, bottom: size * 0.04 }} />
        {word}
      </span>
    </span>
  );
}

/** A quick, slightly wobbly highlighter stroke that sweeps in left to right. */
export function MarkerSwipe({ at, width, height, style }: { at: number; width: number; height: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const p = out(clamp((frame / FPS - at) / 0.32, 0, 1));
  const d = `M6 ${height * 0.62} C ${width * 0.3} ${height * 0.42}, ${width * 0.62} ${height * 0.7}, ${width - 6} ${height * 0.46}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', ...style }}>
      <path d={d} fill="none" stroke="#FFE893" strokeWidth={height * 0.78} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} opacity={0.95} />
      <path d={d} fill="none" stroke="#F3D774" strokeWidth={height * 0.2} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} opacity={0.35} transform={`translate(0 ${height * 0.22})`} />
    </svg>
  );
}

/** Montage words in Fredoka, each dropping in on its beat. */
export function MontageWords({ beats, until }: { beats: number[]; until: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < beats[0] - 0.1 || t > until + 0.25) return null;
  const leave = clamp((t - until) / 0.2, 0, 1);
  const word = (w: string, i: number) => {
    const p = clamp((t - beats[i]) / 0.38, 0, 1);
    return (
      <span key={w} style={{ display: 'inline-block', opacity: Math.min(1, p * 3), transform: `translateY(${(1 - pop(p)) * -70}px) rotate(${(1 - pop(p)) * (i % 2 ? 6 : -6)}deg)` }}>
        {w}
      </span>
    );
  };
  const dot = (i: number) => <span style={{ display: 'inline-block', margin: '0 22px', color: 'rgb(45 49 46 / 0.3)', opacity: t >= beats[i] ? 1 : 0 }}>·</span>;
  return (
    <div style={{ position: 'absolute', top: 150, left: 0, width: W, textAlign: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: 112, lineHeight: 1.12, color: '#EE6B6E', opacity: 1 - leave, transform: `translate(-20px, ${-14 * leave}px)` }}>
      <div>
        {word('Focus', 0)}
        {dot(1)}
        {word('Tasks', 1)}
      </div>
      <div>
        {word('Share', 2)}
        {dot(3)}
        {word('Sync', 3)}
      </div>
    </div>
  );
}

/** Pomo's four-point sparkle (the same path the component draws). */
export const SPARKLE = 'M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8Z';

/**
 * A handwritten paper price tag hanging on a string under Pomo. It turns over in 3D around the
 * hit at `flip` (seconds), from "price?" to "$0". (x, y) is where the string is tied.
 */
export function PriceTag({ x, y, tilt, flip, show }: { x: number; y: number; tilt: number; flip: number; show: [number, number] }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < show[0] || t > show[1] + 0.3) return null;
  const appear = pop(clamp((t - show[0]) / 0.45, 0, 1));
  const leave = clamp((t - show[1]) / 0.25, 0, 1);
  // The turn starts 6 frames before the hit, so the hit frame shows it mid-turn with $0 coming round.
  const fp = clamp((frame - (fr(flip) - 6)) / 26, 0, 1);
  const angle = 180 * pop(fp);
  const swing = Math.sin(t * 2.4) * 3 + Math.sin(fp * Math.PI) * 7 - tilt * 0.5;
  const TW = 340;
  const TH = 260;
  const STRING = 70;
  const face = (children: ReactNode, back = false): ReactNode => (
    <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: back ? 'rotateY(180deg)' : undefined }}>
      <svg width={TW} height={TH} viewBox={`0 0 ${TW} ${TH}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={`M${TW / 2} 4 L${TW - 8} 64 V${TH - 18} Q${TW - 8} ${TH - 6} ${TW - 20} ${TH - 6} H20 Q8 ${TH - 6} 8 ${TH - 18} V64 Z`} fill="#F5EFE0" stroke="#E5DFD1" strokeWidth={3} strokeLinejoin="round" />
        <path d={`M36 86 H${TW - 36} M36 ${TH - 28} H${TW - 36}`} stroke="#E5DFD1" strokeWidth={2} strokeDasharray="10 9" />
        <circle cx={TW / 2} cy={34} r={10} fill="#FDFBF7" stroke="#D8CFBC" strokeWidth={3} />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 80, bottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `rotate(${swing}deg) scale(${appear * (1 - leave * 0.3)})`, transformOrigin: '0 0', opacity: 1 - leave, filter: 'drop-shadow(0 16px 18px rgb(45 49 46 / 0.18))' }}>
      <svg width={40} height={STRING + 40} style={{ position: 'absolute', left: -20, top: 0, overflow: 'visible' }}>
        <path d={`M20 0 C 10 ${STRING * 0.4}, 30 ${STRING * 0.75}, 20 ${STRING + 34}`} stroke="#B8A98C" strokeWidth={3} fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', left: -TW / 2, top: STRING, width: TW, height: TH, transformStyle: 'preserve-3d', transform: `perspective(1400px) rotateY(${angle}deg)` }}>
        {face(<span style={{ fontFamily: '"Patrick Hand"', fontSize: 84, color: 'rgb(45 49 46 / 0.75)' }}>price?</span>)}
        {face(<span style={{ fontFamily: 'Fredoka', fontWeight: 600, fontSize: 150, color: '#EE6B6E', lineHeight: 1 }}>$0</span>, true)}
      </div>
    </div>
  );
}

/** A small doodled padlock that springs open and bursts into Pomo-style sparkles. */
export function Padlock({ x, y, show, open, burst, size = 2 }: { x: number; y: number; show: number; open: number; burst: number; size?: number }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < show) return null;
  const appear = pop(clamp((t - show) / 0.4, 0, 1));
  const lift = pop(clamp((t - open) / 0.25, 0, 1));
  const b = clamp((t - burst) / 0.9, 0, 1);
  const lockGone = clamp((t - burst) / 0.12, 0, 1);
  const N = 10;
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      <svg width={160} height={180} viewBox="-80 -100 160 180" style={{ position: 'absolute', left: -80, top: -100, overflow: 'visible', opacity: 1 - lockGone, transform: `scale(${size * appear * (1 + lockGone * 0.5)}) rotate(-6deg)` }}>
        <g fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-24 -10 C-25 -46 25 -48 24 -12" transform={`translate(${lift * 10} ${-lift * 22}) rotate(${lift * 24} 24 -12)`} />
          <path d="M-40 -12 C-14 -15 18 -13 41 -10 C43 14 42 38 39 56 C14 59 -14 58 -39 55 C-42 30 -42 8 -40 -12Z" fill="#F5EFE0" />
          <circle cx={0} cy={18} r={6} fill={INK} />
          <path d="M0 22 L1 36" />
        </g>
      </svg>
      {b > 0 && b < 1 &&
        Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 + 0.3;
          const dist = size * (30 + 120 * out(b) * (0.7 + ((i * 37) % 10) / 20));
          const s = (1.4 + (i % 3) * 0.5) * (1 - b) * (0.6 + Math.abs(Math.sin(b * 9 + i)) * 0.6);
          return (
            <svg key={i} width={4} height={4} style={{ position: 'absolute', left: Math.cos(a) * dist, top: Math.sin(a) * dist - 20 * size, overflow: 'visible' }}>
              <path d={SPARKLE} transform={`scale(${s * 1.6 * size}) rotate(${b * 90})`} fill="#FFE893" stroke="#E9C85C" strokeWidth={0.8} />
            </svg>
          );
        })}
    </div>
  );
}

/** A small, clean desktop window around the 1280×800 desktop capture. */
export function DesktopWindow({ x, y, width, rotate, shot, from, opacity = 1, clip = 0 }: { x: number; y: number; width: number; rotate: number; shot: string; from: number; opacity?: number; clip?: number }) {
  const h = (width * 800) / 1280;
  const bar = 34;
  return (
    <div style={{ position: 'absolute', left: x - width / 2, top: y - (h + bar) / 2, width, height: h + bar, transform: `perspective(2200px) rotate(${rotate}deg) rotateY(${-rotate * 1.5}deg)`, opacity, borderRadius: 16, overflow: 'hidden', background: 'rgb(45 49 46 / 0.92)', boxShadow: '0 50px 80px -40px rgb(45 49 46 / 0.5), 0 10px 30px -16px rgb(45 49 46 / 0.25)' }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', color: 'rgb(242 237 224 / 0.75)', fontFamily: 'Nunito', fontWeight: 700, fontSize: 17 }}>
        <span>Promodoro</span>
        <span style={{ letterSpacing: 18, fontSize: 15 }}>– ▢ ✕</span>
      </div>
      <div style={{ position: 'relative', width, height: h, overflow: 'hidden' }}>
        <Sequence from={fr(from)} layout="none">
          <OffthreadVideo src={staticFile(`footage/${shot}.mp4`)} startFrom={Math.round(clip * FPS)} muted style={{ width: '100%', height: '100%', display: 'block' }} />
        </Sequence>
      </div>
    </div>
  );
}

/**
 * The end card: the Promodoro wordmark (about 75 % of the frame width) falls and stamps down on the
 * final hit, fully opaque from that frame, then the small print. Both hold to the last frame.
 */
export function EndCard({ stamp, x = 480, y = 1000 }: { stamp: number; x?: number; y?: number }) {
  const frame = useCurrentFrame();
  const land = fr(stamp);
  const fall = clamp((frame - (land - 12)) / 12, 0, 1);
  if (fall <= 0) return null;
  const after = Math.max(0, frame - land) / FPS;
  const s = fall < 1 ? 1.35 - 0.35 * inQuad(fall) : 1 - Math.sin(Math.min(1, after / 0.3) * Math.PI) * 0.03 * Math.exp(-after * 4);
  const squashY = fall < 1 ? 1 : 1 - Math.sin(Math.min(1, after / 0.18) * Math.PI) * 0.06;
  const small = prog(frame, stamp + 0.12, stamp + 0.42, out);
  const ink = clamp(after / 0.5, 0, 1);
  const WORD = 174;
  return (
    <>
      {fall >= 1 && (
        <div style={{ position: 'absolute', left: x - 450 * (0.92 + ink * 0.12), top: y - 120 * (0.92 + ink * 0.12), width: 900 * (0.92 + ink * 0.12), height: 240 * (0.92 + ink * 0.12), borderRadius: '50%', border: '5px solid rgb(238 107 110 / 0.45)', opacity: (1 - ink) * 0.8 }} />
      )}
      <div style={{ position: 'absolute', left: x - 500, width: 1000, top: y - WORD * 0.68, textAlign: 'center', fontFamily: 'Fredoka', fontWeight: 600, fontSize: WORD, lineHeight: 1.3, color: '#EE6B6E', transform: `scale(${s}, ${s * squashY})`, opacity: Math.min(1, fall * 1.6), textShadow: '0 7px 0 rgb(217 84 90 / 0.22)' }}>Promodoro</div>
      <div style={{ position: 'absolute', left: x - 500, width: 1000, top: y + WORD * 0.62, textAlign: 'center', fontFamily: 'Nunito', fontWeight: 700, fontSize: 46, lineHeight: 1.3, color: 'rgb(45 49 46 / 0.78)', opacity: small, transform: `translateY(${(1 - small) * 14}px)` }}>
        Every feature, free forever
        <br />
        Windows + Android
      </div>
    </>
  );
}
