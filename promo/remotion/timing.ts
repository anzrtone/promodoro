/**
 * The edit's clock. Everything (picture and the SFX stem) is placed from these numbers, so the
 * cut stays on the music grid: 87 BPM, a beat every 0.6897 s, a bar every 2.759 s.
 */
export const FPS = 60;
export const W = 1080;
export const H = 1920;
/** 33.0 s: the end card holds after the stamp so the music can ring out (silent by about 32.6 s). */
export const DURATION = 1980;

export const BEAT = 60 / 87;
export const BAR = BEAT * 4;

/** Seconds → composition frame. */
export const fr = (s: number) => Math.round(s * FPS);

/** Beat starts (seconds). */
export const T = {
  hello: 0,
  flow: 5.52, //    drums kick in: the timer hits 00:00 and the alarm plays
  forgot: 8.28,
  timeline: 11.03,
  stats: 13.79, //  hi-hats drop out; Stats runs two bars, flicking down through every chart
  montage: 19.31,
  free: 22.07, //   drums come back: the $0 tag flips
  why: 24.83,
  end: 27.59,
  stamp: 28.97, //  final hit: the logo stamps down
} as const;

export const SYNC = { zero: fr(T.flow), flip: fr(T.free), stamp: fr(T.stamp) };

export const BARS = Array.from({ length: 12 }, (_, i) => +(i * BAR).toFixed(2));

/** Page-turn length between features (frames), and the quicker flips in the montage. */
export const TURN = 18;
export const FLIP = 10;

/** Montage: one page per beat. */
export const MONTAGE = [0, 1, 2, 3].map((i) => T.montage + i * BEAT);

/** Phone layout (composition px). The screen keeps the 412×915 capture aspect. */
export const PHONE = { cx: 520, cy: 1150, screenW: 588, bezel: 16, radius: 86 };
export const SCREEN_H = (PHONE.screenW * 915) / 412;
