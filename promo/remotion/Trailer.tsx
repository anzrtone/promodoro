/**
 * Promodoro, 30 s, 9:16. Pomo gives a tour of the real app, cut to the 87 BPM grid in timing.ts.
 */
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { clamp, CssAnimationClock, inOut, out, pop, prog, track } from './anim';
import { FLIP, FPS, MONTAGE, PHONE, SYNC, T } from './timing';
import { PomoActor, type Stop } from './components/PomoActor';
import { PhoneFrame, ScreenTrack, type Segment, type Tap } from './components/Phone';
import { DesktopWindow, EndCard, HandCaption, MontageWords, NotebookBg, Padlock, PriceTag } from './components/Paper';
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

export const SEGMENTS: Segment[] = [
  { shot: 'countdown', from: 3.3, to: T.forgot, clip: 3.3 - SYNC.zero / FPS + ZERO, zoom: { ox: 0.5, oy: 0.4, s0: 1, s1: 1.16 } },
  { shot: 'forgot', from: T.forgot, to: T.timeline, clip: 0.4, zoom: { ox: 0.5, oy: 0.62, s0: 1, s1: 1.14 }, taps: taps(forgot) },
  { shot: 'timeline', from: T.timeline, to: T.stats, clip: 1.1, rate: 1.4, zoom: { ox: 0.5, oy: 0.26, s0: 1, s1: 1.12 }, taps: taps(timeline) },
  { shot: 'stats', from: T.stats, to: T.stickers, clip: 1.45, rate: 1.12, zoom: { ox: 0.5, oy: 0.3, s0: 1, s1: 1.1 }, taps: taps(stats) },
  { shot: 'stickers', from: T.stickers, to: T.montage, clip: 1.15, zoom: { ox: 0.5, oy: 0.45, s0: 1, s1: 1.06 }, taps: taps(stickers) },
  { shot: 'm-focusmode', from: MONTAGE[0], to: MONTAGE[1], clip: 1.6, turn: FLIP },
  { shot: 'm-subjects', from: MONTAGE[1], to: MONTAGE[2], clip: 1.25, turn: FLIP },
  { shot: 'm-share', from: MONTAGE[2], to: MONTAGE[3], clip: 1.45, turn: FLIP },
  { shot: 'm-sync', from: MONTAGE[3], to: T.free, clip: 1.3, turn: FLIP },
  { shot: 'idle', from: T.free, to: 30, clip: 0, rate: 0.8 },
];

const POMO_PATH: Stop[] = [
  { t: 0, x: -240, y: 260, s: 380 },
  { t: 0.25, x: -240, y: 260, s: 380 },
  { t: 1.25, x: 540, y: 880, s: 400, e: out },
  { t: 3.0, x: 540, y: 860, s: 400 },
  { t: 3.7, x: 172, y: 640, s: 230, lean: 8 },
  { t: 8.1, x: 172, y: 660, s: 230, lean: 8 },
  { t: 8.6, x: 880, y: 960, s: 210, lean: -10 },
  { t: 10.95, x: 880, y: 980, s: 210, lean: -10 },
  { t: 11.4, x: 185, y: 600, s: 220, lean: 10 },
  { t: 13.7, x: 185, y: 620, s: 220, lean: 10 },
  { t: 14.1, x: 880, y: 700, s: 230, lean: -8 },
  { t: 16.45, x: 880, y: 720, s: 230, lean: -8 },
  { t: 16.85, x: 180, y: 1000, s: 220, lean: 6 },
  { t: 19.2, x: 180, y: 1000, s: 220, lean: 6 },
  // the montage: Pomo darts to a new spot on every beat
  { t: MONTAGE[0] + 0.22, x: 880, y: 640, s: 200, lean: -8, e: out },
  { t: MONTAGE[1], x: 880, y: 650, s: 200, lean: -8 },
  { t: MONTAGE[1] + 0.22, x: 180, y: 840, s: 200, lean: 8, e: out },
  { t: MONTAGE[2], x: 180, y: 850, s: 200, lean: 8 },
  { t: MONTAGE[2] + 0.22, x: 880, y: 1080, s: 200, lean: -8, e: out },
  { t: MONTAGE[3], x: 880, y: 1090, s: 200, lean: -8 },
  { t: MONTAGE[3] + 0.22, x: 190, y: 620, s: 200, lean: 8, e: out },
  { t: 21.62, x: 190, y: 620, s: 200, lean: 0 },
  // up to the middle, holding the price tag, arriving just before the hit
  { t: 22.02, x: 540, y: 760, s: 300, e: out },
  { t: 24.75, x: 540, y: 760, s: 300 },
  { t: 25.2, x: 540, y: 690, s: 260 },
  { t: 27.5, x: 540, y: 690, s: 260 },
  { t: 27.95, x: 540, y: 610, s: 220 },
  { t: 28.6, x: 540, y: 610, s: 220 },
  { t: 28.95, x: 520, y: 760, s: 300, e: out },
  { t: 30, x: 520, y: 750, s: 300 },
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

  // Phone: slides up onto the page at ~3.5 s, dims under the free-forever beat, then makes way.
  const enter = prog(frame, 3.35, 4.1, pop);
  const apart = prog(frame, T.end, T.end + 0.45, out);
  const exit = prog(frame, 28.5, 28.95, inOut);
  const phoneX = PHONE.cx + (310 - PHONE.cx) * apart - 700 * exit;
  const phoneY = PHONE.cy + (1 - enter) * 1500 + (1060 - PHONE.cy) * apart;
  const phoneScale = 1 - 0.36 * apart;
  const phoneRot = -5 * (1 - enter) - 7 * apart;
  const dim = clamp(prog(frame, T.free - 0.2, T.free + 0.25) - prog(frame, T.end - 0.1, T.end + 0.3), 0, 1) * 0.55;

  return (
    <AbsoluteFill className="trailer" style={{ background: '#FDFBF7' }}>
      <CssAnimationClock />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam})`, transformOrigin: '50% 48%' }}>
        <NotebookBg drift={t * 7} />

        {t > 3.2 && t < 29.1 && (
          <PhoneFrame x={phoneX} y={phoneY} scale={phoneScale} rotate={phoneRot} rotX={2 + Math.sin(t * 0.5) * 1.2} rotY={Math.sin(t * 0.6) * 3.5} dim={dim}>
            <ScreenTrack segments={SEGMENTS} />
          </PhoneFrame>
        )}

        {t > T.end - 0.1 && t < 29.1 && (
          <DesktopWindow
            shot="desktop"
            from={T.end - 0.1}
            x={700 + (1 - apart) * 500 + 700 * exit}
            y={1010}
            width={470}
            rotate={6}
            opacity={Math.min(1, apart * 2)}
          />
        )}

        <Padlock x={150} y={1330} show={T.free - 0.25} open={T.free + 0.2} burst={T.free + 0.42} />

        {/* the why note: a sticky note taped to the page */}
        <WhyNote />

        <PomoActor
          path={POMO_PATH}
          moods={MOODS}
          haloDrop={[
            [0, -150],
            [1.1, -150],
            [1.5, 0, pop],
          ]}
          carry={({ x, y, s, tilt }) => <PriceTag x={x} y={y + s * 0.34} tilt={tilt} flip={T.free} show={[T.free - 0.35, T.end - 0.1]} />}
        />

        {/* captions, top third */}
        <HandCaption from={1.45} to={5.4} lines={["Hi! I'm Pomo."]} />
        <HandCaption from={5.6} to={8.2} lines={['Keep going', 'past zero.']} />
        <HandCaption from={8.36} to={10.95} lines={['Forgot to start?', 'Get it back.']} />
        <HandCaption from={11.11} to={13.71} lines={['No judgment.', 'Just your day.']} />
        <HandCaption from={13.87} to={16.47} lines={['Watch your weeks', 'take shape.']} />
        <HandCaption from={16.63} to={19.23} lines={['No streaks.', 'Just stickers.']} />
        <MontageWords beats={MONTAGE} until={T.free - 0.15} />
        <HandCaption from={T.free} to={T.end - 0.15} write={0.42} size={116} lines={['Every feature.', { text: 'Free forever.', mark: 'forever' }]} />
        <HandCaption from={T.end + 0.08} to={31} lines={['Focus at', 'your own pace.']} />

        <EndCard stamp={T.stamp} y={1090} />
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
          top: 1210,
          width: 800,
          height: 240,
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
      <HandCaption from={T.why + 0.2} to={T.end - 0.1} y={1242} size={60} write={0.55} lines={['No account. No trial.', 'Made for students on a budget.']} />
    </>
  );
}


