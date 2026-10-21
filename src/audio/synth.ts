/**
 * Procedural sound design. Pure DSP (no Web Audio): returns mono Float32 samples.
 *
 * The same functions are used by the app (turned into AudioBuffers) and by
 * scripts/render-sounds.ts, which writes the WAVs Android plays from its notification
 * channels — so a timer sounds identical in the foreground and from a locked phone.
 * No sample libraries, no licensing questions.
 */

export type SoundId = 'kitchen' | 'bell' | 'chime' | 'marimba' | 'musicbox' | 'birds' | 'soft';
export type AmbientId = 'brown' | 'rain' | 'waves' | 'fire';

const TAU = Math.PI * 2;

/** Deterministic PRNG so renders are reproducible (mulberry32). */
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

const note = (n: string): number => {
  const m = /^([A-G])(#?)(\d)$/.exec(n)!;
  const semis: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const s = semis[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, s / 12);
};

/** Add a struck, inharmonic "bell/tine" voice into `out`. */
function strike(
  out: Float32Array,
  sr: number,
  at: number,
  freq: number,
  partials: Array<[ratio: number, amp: number, decay: number]>,
  gain = 1,
  attack = 0.002,
) {
  const start = Math.floor(at * sr);
  const longest = Math.max(...partials.map((p) => p[2]));
  const len = Math.min(out.length - start, Math.floor(longest * 6 * sr));
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const a = t < attack ? t / attack : 1;
    let v = 0;
    for (const [r, amp, d] of partials) v += amp * Math.exp(-t / d) * Math.sin(TAU * freq * r * t);
    out[start + i] += v * a * gain;
  }
}

function normalize(out: Float32Array, peak = 0.89): Float32Array {
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  // 8 ms fade-out guard against clicks.
  const f = Math.min(out.length, 384);
  for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
  return out;
}

const BELL: Array<[number, number, number]> = [
  [1, 1, 0.9],
  [2.76, 0.5, 0.45],
  [5.4, 0.28, 0.22],
  [8.93, 0.14, 0.12],
];
const GLOCK: Array<[number, number, number]> = [
  [1, 1, 0.7],
  [2.76, 0.25, 0.18],
  [5.4, 0.08, 0.06],
];
const MARIMBA: Array<[number, number, number]> = [
  [1, 1, 0.32],
  [3.93, 0.32, 0.06],
  [9.2, 0.06, 0.02],
];
const TINE: Array<[number, number, number]> = [
  [1, 1, 0.9],
  [3, 0.18, 0.25],
  [5.02, 0.06, 0.1],
];

export function renderSound(id: SoundId | 'silence', sr: number): Float32Array {
  switch (id) {
    case 'silence':
      return new Float32Array(Math.floor(sr * 0.4));

    case 'kitchen': {
      // The iconic tomato kitchen timer: a clapper rattling a small bell, twice.
      const out = new Float32Array(Math.floor(sr * 2.9));
      const r = rng(7);
      for (const burst of [0, 1.5]) {
        for (let k = 0; k < 20; k++) {
          const t = burst + k / 17 + (r() - 0.5) * 0.006;
          strike(out, sr, t, 2650, [[1, 1, 0.05], [1.52, 0.6, 0.035], [2.41, 0.35, 0.02]], 0.75 + r() * 0.25, 0.0008);
        }
        strike(out, sr, burst + 20 / 17, 2650, [[1, 1, 0.35], [1.52, 0.5, 0.2]], 0.7);
      }
      return normalize(out);
    }

    case 'bell': {
      // Front-desk bell: ding … ding.
      const out = new Float32Array(Math.floor(sr * 2.8));
      strike(out, sr, 0, note('C6'), BELL, 1);
      strike(out, sr, 0.42, note('C6'), BELL, 0.8);
      return normalize(out);
    }

    case 'chime': {
      const out = new Float32Array(Math.floor(sr * 2.4));
      ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => strike(out, sr, i * 0.17, note(n), GLOCK, i === 3 ? 0.9 : 0.7));
      return normalize(out);
    }

    case 'marimba': {
      const out = new Float32Array(Math.floor(sr * 1.9));
      [['G4', 0], ['D5', 0.16], ['G5', 0.32], ['D5', 0.62], ['G5', 0.78]].forEach(([n, t], i) =>
        strike(out, sr, t as number, note(n as string), MARIMBA, i > 2 ? 0.6 : 0.9, 0.004),
      );
      return normalize(out);
    }

    case 'musicbox': {
      const out = new Float32Array(Math.floor(sr * 2.8));
      const tune: Array<[string, number]> = [['E6', 0], ['G6', 0.22], ['C7', 0.44], ['B6', 0.66], ['G6', 0.88], ['E6', 1.1], ['C6', 1.32]];
      tune.forEach(([n, t]) => strike(out, sr, t, note(n), TINE, 0.8));
      return normalize(out);
    }

    case 'birds': {
      const out = new Float32Array(Math.floor(sr * 2.2));
      const r = rng(42);
      const chirp = (at: number, f0: number, f1: number, dur: number, g: number) => {
        const s = Math.floor(at * sr);
        const n = Math.floor(dur * sr);
        let phase = 0;
        for (let i = 0; i < n && s + i < out.length; i++) {
          const x = i / n;
          const f = f0 + (f1 - f0) * Math.sin((x * Math.PI) / 2);
          phase += (TAU * (f + 180 * Math.sin(TAU * 38 * (i / sr)))) / sr;
          const env = Math.sin(Math.PI * x) ** 2;
          out[s + i] += Math.sin(phase) * env * g;
        }
      };
      for (const group of [0, 0.75, 1.45]) {
        const n = 2 + Math.floor(r() * 2);
        for (let k = 0; k < n; k++) chirp(group + k * 0.11, 2900 + r() * 500, 4300 + r() * 600, 0.07 + r() * 0.03, 0.8);
      }
      return normalize(out, 0.75);
    }

    case 'soft': {
      // Warm, slow pad: a gentle "time's up" for breaks.
      const out = new Float32Array(Math.floor(sr * 2.6));
      const voices = [note('A4'), note('E5'), note('C#5')];
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.35) / 0.9);
        let v = 0;
        voices.forEach((f, k) => {
          const delay = k * 0.12;
          if (t < delay) return;
          v += Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.003 * t) + 0.15 * Math.sin(TAU * f * 2 * t);
        });
        out[i] = v * env;
      }
      return normalize(out, 0.7);
    }
  }
}

/**
 * Seamlessly loopable ambient beds (default 8 s). The tail is cross-faded into the
 * head so the loop point is inaudible.
 */
export function renderAmbient(id: AmbientId, sr: number, seconds = 8): Float32Array {
  const n = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.5);
  const raw = new Float32Array(n + fade);
  const r = rng(id.length * 977 + 3);
  let brown = 0;
  let b0 = 0, b1 = 0, b2 = 0; // pink filter state
  let lp = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = r() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    const pink = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    const t = i / sr;
    switch (id) {
      case 'brown':
        raw[i] = brown * 3.2;
        break;
      case 'rain': {
        lp += 0.35 * (pink - lp);
        let drop = 0;
        if (r() < 0.0009) drop = (r() * 2 - 1) * 0.9;
        raw[i] = (pink - lp) * 0.9 + lp * 0.35 + drop;
        break;
      }
      case 'waves': {
        // Two overlapping swells with an 8 s period (loops exactly with the default length).
        const swell = 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * t) / seconds) ** 2, 1.5);
        lp += (0.05 + 0.25 * swell) * (pink - lp);
        raw[i] = lp * swell * 2.2 + brown * 0.8;
        break;
      }
      case 'fire': {
        let crackle = 0;
        if (r() < 0.0016) crackle = (r() * 2 - 1) * (0.4 + r() * 0.6);
        raw[i] = brown * 2.6 + crackle;
        break;
      }
    }
  }
  // Decay crackles/drops into short ticks.
  if (id === 'rain' || id === 'fire') {
    let tail = 0;
    for (let i = 0; i < raw.length; i++) {
      tail = tail * 0.82 + raw[i] * 0.18;
      raw[i] = raw[i] * 0.5 + tail * 0.5;
    }
  }
  const out = raw.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    out[i] = out[i] * x + raw[n + i] * (1 - x);
  }
  return normalize(out, 0.6);
}

/** 16-bit PCM mono WAV encoder (used by the Android sound render script). */
export function encodeWav(samples: Float32Array, sr: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Uint8Array(buf);
}
