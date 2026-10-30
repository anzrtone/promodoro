/**
 * Promodoro, 30 s, 9:16. Pomo gives a tour of the real app, cut to the 87 BPM grid in timing.ts.
 */
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, CssAnimationClock, inOut, inQuad, out, pop, prog } from './anim';
import { FPS, MONTAGE, PHONE, T } from './timing';
import { PomoActor, type Stop } from './components/PomoActor';
import { PhoneFrame, ScreenTrack } from './components/Phone';
import { DesktopWindow, EndCard, HandCaption, MontageWords, NotebookBg, Padlock, PriceTag } from './components/Paper';
import forgot from '../footage/forgot.json';
import { CAPTIONS, SEGMENTS, WHY } from './edit';

/** Guide Pomo widths: opening 55 %, app beats 28 %, the $0 reveal 45 %, end card 35 % of the frame. */
const S = { open: 600, app: 300, reveal: 486, end: 378 };
const L = 200; // parked on the phone's left edge, over the bezel and the page
const R = 795; // …or its right edge (stays left of the right-hand safe zone)

/**
 * The app's own Pomo sits at (520, 822) in the frame (body centre) while the idle screen plays. In the
 * free-forever beat the guide Pomo is centred on it at 1.85× its size, which covers it completely
 * (Pomo's body centre is 7 % of its size below the middle of its box).
 */
const COVER = { x: 520, y: 822 - 0.07 * S.reveal };

const POMO_PATH: Stop[] = [
  // in from off-screen, settling a little above the middle
  { t: 0, x: -330, y: 700, s: S.open },
  { t: 0.42, x: 540, y: 850, s: S.open, e: pop },
  { t: 3.0, x: 540, y: 850, s: S.open },
  // to the phone's edge as it rises, low (the push-in brings the timer up): pointing up at the app's
  // own Pomo, then at the timer
  { t: 3.75, x: L, y: 1250, s: S.app, lean: 8, wr: 50 },
  { t: 8.0, x: L, y: 1250, s: S.app, lean: 8, wr: 50 },
  // Get time back: right edge (the chips are central), a point back at the app's Pomo before the push-in crops it out
  { t: 8.45, x: R, y: 800, s: S.app, lean: -8, wl: 45 },
  { t: 8.85, x: R, y: 800, s: S.app, lean: -8, wl: 45 },
  { t: 9.2, x: R, y: 810, s: S.app, lean: -4 },
  { t: 10.8, x: R, y: 810, s: S.app, lean: -4 },
  // Honest history: low on the left, under the gap it presents
  { t: 11.25, x: L, y: 1250, s: S.app, lean: 10, wr: 30 },
  { t: 13.55, x: L, y: 1250, s: S.app, lean: 10, wr: 30 },
  // Stats: right edge, beside the big total
  { t: 14.0, x: R, y: 700, s: S.app, lean: -10, wl: 40 },
  { t: 16.3, x: R, y: 700, s: S.app, lean: -10, wl: 40 },
  // No streaks: left edge, the card is pushed in on the right
  { t: 16.75, x: L, y: 900, s: S.app, lean: 10, wr: 35 },
  { t: 19.15, x: L, y: 900, s: S.app, lean: 10, wr: 35 },
  // the montage: a new edge on every beat
  { t: MONTAGE[0] + 0.22, x: R, y: 700, s: S.app, lean: -8, e: out },
  { t: MONTAGE[1], x: R, y: 710, s: S.app, lean: -8 },
  { t: MONTAGE[1] + 0.22, x: L, y: 950, s: S.app, lean: 8, e: out },
  { t: MONTAGE[2], x: L, y: 960, s: S.app, lean: 8 },
  { t: MONTAGE[2] + 0.22, x: R, y: 1150, s: S.app, lean: -8, e: out },
  { t: MONTAGE[3], x: R, y: 1160, s: S.app, lean: -8 },
  { t: MONTAGE[3] + 0.22, x: L, y: 720, s: S.app, lean: 8, e: out },
  // up over the app's own Pomo with the price tag, arriving just before the hit
  { t: 22.02, x: COVER.x, y: COVER.y, s: S.reveal, e: out },
  { t: T.end, x: COVER.x, y: COVER.y, s: S.reveal },
  // centred above the wordmark
  { t: 28.1, x: 480, y: 640, s: S.end },
  { t: 30, x: 480, y: 640, s: S.end },
];

const MOODS: Array<[number, import('@/components/Pomo').PomoMood]> = [
  [0, 'happy'],
  [4.2, 'focused'],
  [T.flow, 'flow'],
  [T.forgot, 'puzzled'],
  [T.forgot + (forgot.taps[1].t - 0.4) + 0.05, 'happy'],
  [T.stats, 'cheering'],
  [T.stickers, 'shy'],
  [MONTAGE[0], 'happy'],
  [MONTAGE[1], 'cheering'],
  [MONTAGE[2], 'happy'],
  [MONTAGE[3], 'cheering'],
  [T.why, 'shy'],
  [T.end, 'cheering'],
];

export function Trailer() {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  // Camera: a slow push-in on the whole page during "why".
  const cam = 1 + 0.04 * prog(frame, T.why, T.end, inOut) * (1 - prog(frame, T.end, T.end + 0.4));

  // Phone: rises from below at 3.0 s; dimmed and blurred under the free-forever beat; then flanks
  // the wordmark (left, small) and slides out as it stamps.
  const enter = prog(frame, 3.0, 3.75, pop);
  const flank = prog(frame, T.end, T.end + 0.5, inOut);
  const exit = prog(frame, T.stamp, T.stamp + 0.35, inQuad);
  const phoneX = PHONE.cx + (175 - PHONE.cx) * flank - 600 * exit;
  const phoneY = PHONE.cy + (1 - enter) * 1500 + (1080 - PHONE.cy) * flank;
  // fully blurred and dimmed by the time the tag turns on the hit
  const under = clamp(prog(frame, T.free - 0.45, T.free - 0.05) - prog(frame, T.end, T.end + 0.35), 0, 1);

  return (
    <AbsoluteFill className="trailer" style={{ background: '#FDFBF7' }}>
      <CssAnimationClock />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: '50% 48%' }}>
        <NotebookBg drift={t * 7} />

        {t > 2.95 && t < T.stamp + 0.4 && (
          <PhoneFrame x={phoneX} y={phoneY} scale={1 - 0.55 * flank} rotate={-5 * (1 - enter) - 6 * flank} rotX={2 + Math.sin(t * 0.5) * 1.2} rotY={Math.sin(t * 0.6) * 3.5} dim={under * 0.55} blur={under * 14}>
            <ScreenTrack segments={SEGMENTS} />
          </PhoneFrame>
        )}

        {t > T.end - 0.05 && t < T.stamp + 0.4 && <DesktopWindow shot="desktop" from={T.end - 0.05} x={790 + (1 - flank) * 650 + 700 * exit} y={1060} width={300} rotate={6} />}

        <Padlock x={150} y={1180} show={T.free - 0.52} open={T.free - 0.22} burst={T.free} />

        {/* the why note: a sticky note taped to the page */}
        <WhyNote />

        <PomoActor
          path={POMO_PATH}
          moods={MOODS}
          wave={[1.5, 2.5]}
          haloDrop={[
            [0, -150],
            [0.45, -150],
            [0.8, 0, pop],
          ]}
          // Held close under Pomo (the tag's point tucked behind its body): the paper covers the app's
          // timer behind it completely.
          carry={({ x, y, s, tilt }) => <PriceTag x={x} y={y + s * 0.2} string={12} tilt={tilt} flip={T.free} show={[T.free - 0.35, T.end - 0.1]} />}
        />

        {/* captions, top third (the montage words take the caption spot on their beat) */}
        {CAPTIONS.map((c, i) => (
          <HandCaption key={i} {...c} />
        ))}
        <MontageWords beats={MONTAGE} until={T.free - 0.15} />

        <EndCard stamp={T.stamp} x={480} y={1000} />
      </div>
    </AbsoluteFill>
  );
}

function WhyNote() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (t < T.why - 0.1 || t > T.end + 0.3) return null;
  const k = pop(clamp((t - T.why) / 0.45, 0, 1));
  const leave = prog(frame, T.end - 0.1, T.end + 0.2);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 520 - 400,
          top: 1345,
          width: 800,
          height: 185,
          borderRadius: 14,
          background: '#F5EFE0',
          border: '2px solid #E5DFD1',
          boxShadow: '0 1px 0 #E5DFD1, 0 10px 30px -16px rgb(45 49 46 / 0.25)',
          opacity: Math.min(1, k * 2) * (1 - leave),
          transform: `translateX(${18 * (1 - k)}px) rotate(${-1.2 + 0.6 * (1 - k)}deg) scale(${0.9 + 0.1 * k})`,
        }}
      >
        <div className="washi" style={{ position: 'absolute', top: -14, left: '50%', width: 130, height: 30, marginLeft: -65, transform: 'rotate(-3deg)', borderRadius: 3, background: 'rgb(255 232 147 / 0.75)', backgroundImage: 'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.3) 0 7px, transparent 7px 14px)' }} />
      </div>
      <HandCaption {...WHY} />
    </>
  );
}


