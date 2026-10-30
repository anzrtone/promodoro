/**
 * The SFX stem: promo/out/sfx.wav, 48 kHz stereo, exactly 33.0 s, every sound placed on the
 * frame-accurate timeline from the same edit data as the picture (remotion/edit.ts, timing.ts).
 *
 * Made like scripts/render-sounds.ts renders the app's sounds: offline, pure DSP, nothing licensed.
 * The 00:00 moment is the app's own "Desk bell" alarm (renderSound('bell')), faded before the next beat,
 * and the $0 sparkles use the app's glockenspiel ('chime'). Everything else is synthesised here.
 * Levels sit under the music: the stem is scaled so its loudest short-term window is about −21 LUFS.
 *   npm run sfx
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderSound } from '../../src/audio/synth';
import { CAPTIONS, SEGMENTS, STATS_FLICKS, STATS_RATE, TAG, WHY, lineTimes } from '../remotion/edit';
import stats from '../footage/stats.json';

const statsMarks = stats.marks as Record<string, number>;
import { FLIP, MONTAGE, T, TURN } from '../remotion/timing';

const SR = 48000;
const N = SR * 33;
const L = new Float32Array(N);
const R = new Float32Array(N);
const TAU = Math.PI * 2;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = rng(87);

/** Mix a mono buffer in at `at` seconds, with gain and pan (−1 left … 1 right). */
function mix(buf: Float32Array, at: number, gain = 1, pan = 0, sr = SR) {
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const step = sr / SR;
  const start = Math.round(at * SR);
  const len = Math.floor(buf.length / step);
  for (let i = 0; i < len; i++) {
    const j = start + i;
    if (j < 0 || j >= N) continue;
    const x = i * step;
    const k = Math.floor(x);
    const v = buf[k] + ((buf[k + 1] ?? 0) - buf[k]) * (x - k);
    L[j] += v * gl;
    R[j] += v * gr;
  }
}

const make = (sec: number, fn: (t: number, i: number) => number) => {
  const b = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < b.length; i++) b[i] = fn(i / SR, i);
  return b;
};

/** One-pole low-pass over a buffer, cutoff in Hz (or a function of time). */
function lowpass(b: Float32Array, hz: number | ((t: number) => number)) {
  let y = 0;
  for (let i = 0; i < b.length; i++) {
    const f = typeof hz === 'number' ? hz : hz(i / SR);
    const a = 1 - Math.exp((-TAU * f) / SR);
    y += a * (b[i] - y);
    b[i] = y;
  }
  return b;
}
const highpass = (b: Float32Array, hz: number) => {
  const lp = lowpass(Float32Array.from(b), hz);
  for (let i = 0; i < b.length; i++) b[i] -= lp[i];
  return b;
};

/* ---------------- the sounds ---------------- */

/** A soft UI tap: a tiny felt click with a short woody body. */
const tap = () =>
  lowpass(
    make(0.06, (t) => (rnd() * 2 - 1) * Math.exp(-t / 0.003) * 0.6 + Math.sin(TAU * 1250 * t) * Math.exp(-t / 0.012) * 0.5 + Math.sin(TAU * 420 * t) * Math.exp(-t / 0.02) * 0.4),
    5000,
  );

/** Wing flutter: quick soft feathery puffs. */
function flutter(sec: number, rate = 13) {
  const b = make(sec, (t) => {
    const ph = (t * rate) % 1;
    const puff = Math.exp(-ph / 0.18) * Math.sin(Math.PI * Math.min(1, t / 0.08)) * Math.min(1, (sec - t) / 0.1);
    return (rnd() * 2 - 1) * puff;
  });
  return lowpass(highpass(b, 350), 2200);
}

/** A paper page turn: a swish that brightens then settles, with a little crackle. */
function pageTurn(sec = 0.42) {
  const b = make(sec, (t) => {
    const k = t / sec;
    const env = Math.sin(Math.PI * Math.min(1, k * 1.2)) ** 1.5;
    const crackle = rnd() < 0.004 ? (rnd() * 2 - 1) * 3 : 0;
    return ((rnd() * 2 - 1) + crackle) * env;
  });
  return lowpass(highpass(b, 500), (t) => 900 + 4200 * Math.sin(Math.PI * Math.min(1, t / sec)));
}

/** A pen scribbling on paper for `sec`: scratchy strokes at a writing rhythm. */
function scribble(sec: number) {
  const r = rng(Math.floor(sec * 1000));
  const strokes: number[] = [];
  for (let t = 0; t < sec; t += 0.07 + r() * 0.08) strokes.push(t);
  const b = make(sec + 0.05, (t) => {
    let env = 0;
    for (const s of strokes) if (t >= s && t < s + 0.09) env = Math.max(env, Math.sin((Math.PI * (t - s)) / 0.09) * (0.6 + 0.4 * Math.sin(s * 37)));
    return (rnd() * 2 - 1) * env;
  });
  return lowpass(highpass(b, 1800), 7000);
}

/** A struck tine (the halo "ting", sparkles): a few inharmonic partials. */
const tine = (freq: number, decay = 0.6, sec = 1.6) =>
  make(sec, (t) => (Math.sin(TAU * freq * t) * Math.exp(-t / decay) + 0.25 * Math.sin(TAU * freq * 2.76 * t) * Math.exp(-t / (decay * 0.3)) + 0.08 * Math.sin(TAU * freq * 5.4 * t) * Math.exp(-t / (decay * 0.12))) * Math.min(1, t / 0.002));

/** A soft pop: a round bubble with a quick pitch drop. */
const popSound = () => {
  let ph = 0;
  return make(0.16, (t) => {
    ph += (TAU * (720 - 380 * Math.min(1, t / 0.06))) / SR;
    return Math.sin(ph) * Math.exp(-t / 0.035) * Math.min(1, t / 0.003);
  });
};

/** A gentle whoosh for something sliding onto the page. */
function whoosh(sec = 0.7) {
  const b = make(sec, (t) => (rnd() * 2 - 1) * Math.sin(Math.PI * (t / sec)) ** 2);
  return lowpass(b, (t) => 300 + 1500 * Math.sin(Math.PI * (t / sec)));
}

/** "Ka-ching": a soft register bell and a drawer's papery "ch", for the $0 flip. */
function kaching() {
  const bell = make(1.4, (t) => {
    const s = (f: number, at: number, g: number) => (t >= at ? g * Math.exp(-(t - at) / 0.35) * (Math.sin(TAU * f * (t - at)) + 0.4 * Math.sin(TAU * f * 2.76 * (t - at)) * Math.exp(-(t - at) / 0.1)) : 0);
    return s(2093, 0, 0.6) + s(2637, 0.07, 0.7);
  });
  const ch = lowpass(highpass(make(0.25, (t) => (rnd() * 2 - 1) * Math.exp(-t / 0.05)), 2500), 9000);
  for (let i = 0; i < ch.length; i++) bell[i] += ch[i] * 0.5;
  return bell;
}

/** A stamp landing: a soft low thump with a papery press. */
function thump() {
  const b = make(0.5, (t) => Math.sin(TAU * (70 + 50 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.09) + (rnd() * 2 - 1) * Math.exp(-t / 0.012) * 0.3);
  return lowpass(b, 1800);
}

/** The warm resolving chord under the logo (Fmaj9 → Cadd9): it rings, then fades away by itself. */
function chord(sec: number) {
  const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
  const first = [53, 60, 64, 67, 69].map(hz); // F C E G A
  const last = [48, 55, 62, 64, 67].map(hz); // C G D E G
  const b = make(sec, (t) => {
    const x = Math.min(1, Math.max(0, (t - 0.18) / 0.25));
    let v = 0;
    first.forEach((f, k) => (v += (1 - x) * (Math.sin(TAU * f * t + k) + 0.3 * Math.sin(TAU * f * 2 * t)) * Math.exp(-t / 0.5)));
    last.forEach((f, k) => (v += x * (Math.sin(TAU * f * t + k) + 0.25 * Math.sin(TAU * f * 2.003 * t) + 0.15 * Math.sin(TAU * f * 0.998 * t))));
    const tail = Math.min(1, Math.max(0, (t - (sec - 1.6)) / 1.6));
    const env = Math.min(1, t / 0.04) * (0.55 + 0.45 * Math.exp(-t / 0.4)) * Math.exp(-t / 3) * (0.5 + 0.5 * Math.cos(Math.PI * tail));
    return (v / 5) * env;
  });
  return lowpass(b, 3200);
}

/** A small metal padlock rattling in its hasp: a few quick, tinny knocks (`k` scales it). */
function rattle(k = 1) {
  const r = rng(Math.round(k * 100));
  const b = new Float32Array(Math.round(0.3 * SR));
  const n = Math.round(4 + 4 * k);
  for (let j = 0; j < n; j++) {
    const at = j * (0.026 + r() * 0.012);
    const f = 2300 + r() * 1700;
    const g = (0.6 + r() * 0.4) * Math.exp(-at / 0.12);
    const knock = make(0.06, (t) => (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.53 * t) + 0.3 * (r() * 2 - 1)) * Math.exp(-t / 0.008));
    const s = Math.round(at * SR);
    for (let i = 0; i < knock.length && s + i < b.length; i++) b[s + i] += knock[i] * g;
  }
  return lowpass(b, 7000);
}

/** The shackle springing open: a crisp little metal click. */
const click = () => make(0.08, (t) => (Math.sin(TAU * 3400 * t) * 0.7 + Math.sin(TAU * 5200 * t) * 0.3) * Math.exp(-t / 0.006) + (rnd() * 2 - 1) * Math.exp(-t / 0.002) * 0.5);

/* ---------------- the timeline ---------------- */

// Pomo's wings: every flight in the edit (see POMO_PATH in Trailer.tsx), and the hello wave.
const flights: Array<[number, number, number]> = [
  [0, 0.45, -0.4],
  [3.0, 3.75, -0.3],
  [8.0, 8.45, 0.3],
  [10.8, 11.25, -0.3],
  [13.55, 14.0, 0.3],
  [STATS_FLICKS - 0.35, STATS_FLICKS, 0.3],
  [MONTAGE[0], MONTAGE[0] + 0.22, 0.3],
  [MONTAGE[1], MONTAGE[1] + 0.22, -0.4], // off the left side to fetch the tag
  [TAG.in - 0.3, TAG.in, -0.2], // …and back in carrying it
  [TAG.open, 22.02, 0],
  [T.end, T.end + 0.5, 0],
];
for (const [a, b, pan] of flights) mix(flutter(b - a + 0.1), a, 0.22, pan);
mix(flutter(1.0, 7), 1.5, 0.12, 0.15); // the wave

mix(tine(2637 * 2, 0.5), 0.8, 0.22); // the halo drops into place: "ting"
mix(whoosh(0.75), 3.0, 0.22); // the phone rises onto the page

// pen under every caption line as it writes on
for (const c of [...CAPTIONS, WHY]) for (const { at, dur } of lineTimes(c)) mix(scribble(dur), at, 0.16, -0.1);
mix(scribble(0.3), T.free + 0.95, 0.1, 0.1); // the marker swipe under "forever"

// the app's "Desk bell" at 00:00 (the app keeps counting): faded out over 0.4 s from 2.1 s, so it
// never runs into the next beat
const bell = renderSound('bell', 32000);
for (let i = 0; i < bell.length; i++) bell[i] *= 1 - Math.min(1, Math.max(0, (i / 32000 - 2.1) / 0.4));
mix(bell, T.flow, 0.33, 0, 32000);

// taps from the captures, where they're on screen
for (const s of SEGMENTS) {
  for (const tp of s.taps ?? []) {
    const at = s.from + (tp.t - s.clip) / (s.rate ?? 1);
    if (at >= s.from - 0.15 && at <= s.to) mix(tap(), at, 0.3, (tp.x / 412 - 0.5) * 0.6);
  }
}

// paper page turns between features, quicker flips in the montage
for (const s of SEGMENTS.slice(1)) {
  const len = (s.turn ?? TURN) / 60;
  mix(pageTurn(Math.max(0.22, len * 1.6)), s.from - len / 2, s.turn === FLIP ? 0.2 : 0.26, 0.2);
}

// the Stats page flicking down through its charts: a soft paper swish on each flick
for (const [k, at] of Object.entries(statsMarks)) if (k.startsWith('flick-')) mix(whoosh(0.28), T.stats + (at - 1.5) / STATS_RATE, 0.1, 0.2);
MONTAGE.forEach((m, i) => mix(popSound(), m + 0.05, 0.14, i % 2 ? 0.25 : -0.25)); // montage words drop in

// "price?" flies in with a whoosh as the padlock pops onto the page; the padlock rattles on the
// beats, its shackle clicks open, then it bursts with the $0 flip
mix(whoosh(0.5), TAG.in - 0.38, 0.16, -0.3);
mix(popSound(), TAG.in - 0.12, 0.12, -0.5);
for (const [at, deg] of TAG.rattles) mix(rattle(deg / 11), at, 0.2, -0.5);
mix(click(), TAG.open, 0.22, -0.5);

// $0: ka-ching on the hit, dissolving into the app's glockenspiel and sparkles; the padlock bursts with it
mix(kaching(), T.free, 0.3);
mix(renderSound('chime', 32000), T.free + 0.18, 0.16, 0, 32000);
for (let i = 0; i < 9; i++) mix(tine(3000 + rnd() * 2400, 0.25, 0.8), T.free + 0.08 + i * 0.07 + rnd() * 0.04, 0.05, -0.6 + rnd() * 0.3);

// the logo: lands on the final hit and a warm chord rings out, silent by 32.6 s (the stem runs to 33.0)
mix(thump(), T.stamp, 0.42);
mix(chord(32.6 - T.stamp), T.stamp, 0.26);
mix(whoosh(0.4), T.stamp, 0.12); // phone and desktop slide out

/* ---------------- level, then write ---------------- */

function encode(gain: number) {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + N * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 4, 40);
  const fade = SR * 0.02;
  for (let i = 0; i < N; i++) {
    const f = Math.min(1, (N - i) / fade);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * f)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * f)) * 32767), 46 + i * 4);
  }
  return buf;
}

mkdirSync('out', { recursive: true });
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const out = 'out/sfx.wav';
writeFileSync(out, encode(0.5 / peak));
// Measure the loudest short-term (3 s) window and set it to TARGET, keeping peaks under −1 dBFS.
const TARGET = -21;
const st = (() => {
  const r = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i ${out} -af ebur128=metadata=1,ametadata=print:key=lavfi.r128.S -f null - 2>&1 | grep -o 'lavfi.r128.S=-\\?[0-9.]*' | cut -d= -f2 | sort -g | tail -1`], { encoding: 'utf8' });
  return parseFloat(r);
})();
const gain = (0.5 / peak) * 10 ** ((TARGET - st) / 20);
const safe = Math.min(gain, 0.89 / peak);
writeFileSync(out, encode(safe));
console.log(`${out}: 33.0 s, 48 kHz stereo; loudest short-term was ${st.toFixed(1)} LUFS, gain → ${(TARGET + 20 * Math.log10(safe / gain)).toFixed(1)} LUFS, peak ${(20 * Math.log10(peak * safe)).toFixed(1)} dBFS`);
