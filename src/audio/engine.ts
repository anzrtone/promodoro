/**
 * Web Audio playback: alarm queue + ambient soundscapes.
 *
 * Alarm overlap queue: when several timers finish together (a focus timer and a tea
 * timer, say), their sounds play one after another instead of the second cutting off
 * the first. Each queued alarm is keyed (timerId@alarmTime) so the same alarm reported
 * twice (JS settle + native scheduler) only rings once.
 */
import { renderAmbient, renderSound, type AmbientId, type SoundId } from './synth';

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'playback' });
  return ctx;
}

/** WebViews start audio suspended until a gesture; call this from any tap. */
export function unlockAudio(): void {
  const c = audio();
  if (c.state === 'suspended') void c.resume();
}

function buffer(key: string, make: (sr: number) => Float32Array): AudioBuffer {
  const hit = buffers.get(key);
  if (hit) return hit;
  const c = audio();
  const data = make(c.sampleRate);
  const buf = c.createBuffer(1, data.length, c.sampleRate);
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  buffers.set(key, buf);
  return buf;
}

function play(id: SoundId, volume: number): { done: Promise<void>; stop(): void } {
  const c = audio();
  if (c.state === 'suspended') void c.resume();
  const src = c.createBufferSource();
  src.buffer = buffer(`s:${id}`, (sr) => renderSound(id, sr));
  const gain = c.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  src.connect(gain).connect(c.destination);
  const done = new Promise<void>((resolve) => {
    src.onended = () => resolve();
  });
  src.start();
  return {
    done,
    stop() {
      try {
        gain.gain.setTargetAtTime(0, c.currentTime, 0.05);
        src.stop(c.currentTime + 0.2);
      } catch {
        /* already stopped */
      }
    },
  };
}

/** Test-play button. */
export function previewSound(id: SoundId, volume: number): void {
  void play(id, volume).done;
}

interface QueuedAlarm {
  key: string;
  soundId: SoundId;
  volume: number;
  repeats: number;
}

class AlarmQueue {
  private queue: QueuedAlarm[] = [];
  private played = new Set<string>();
  private current: { stop(): void } | null = null;
  private busy = false;
  private generation = 0;
  private listeners = new Set<(ringing: boolean) => void>();

  enqueue(a: QueuedAlarm): boolean {
    if (this.played.has(a.key) || this.queue.some((q) => q.key === a.key)) return false;
    this.played.add(a.key);
    if (this.played.size > 200) this.played = new Set([...this.played].slice(-100));
    this.queue.push(a);
    void this.pump();
    return true;
  }

  /** Mark an alarm as handled without ringing (e.g. it fired while you were away). */
  markHandled(key: string) {
    this.played.add(key);
  }

  stopAll() {
    this.queue = [];
    this.generation++;
    this.current?.stop();
  }

  get ringing() {
    return this.busy;
  }

  onChange(fn: (ringing: boolean) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l(this.busy);
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    this.emit();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        const gen = this.generation;
        for (let i = 0; i < next.repeats && gen === this.generation; i++) {
          const h = play(next.soundId, next.volume);
          this.current = h;
          await h.done;
          if (i < next.repeats - 1) await sleep(350);
        }
        this.current = null;
        if (this.queue.length) await sleep(250);
      }
    } finally {
      this.busy = false;
      this.current = null;
      this.emit();
    }
  }
}

export const alarms = new AlarmQueue();

/* ---------------- ambient ---------------- */

let ambient: { id: AmbientId; src: AudioBufferSourceNode; gain: GainNode } | null = null;

export function setAmbient(id: AmbientId | null, volume: number): void {
  const c = audio();
  if (ambient && (!id || ambient.id !== id)) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.4);
    setTimeout(() => {
      try {
        old.src.stop();
      } catch {
        /* noop */
      }
    }, 2000);
    ambient = null;
  }
  if (!id) return;
  if (ambient) {
    ambient.gain.gain.setTargetAtTime(volume, c.currentTime, 0.2);
    return;
  }
  if (c.state === 'suspended') void c.resume();
  const src = c.createBufferSource();
  src.buffer = buffer(`a:${id}`, (sr) => renderAmbient(id, sr));
  src.loop = true;
  const gain = c.createGain();
  gain.gain.value = 0;
  src.connect(gain).connect(c.destination);
  src.start();
  gain.gain.setTargetAtTime(volume, c.currentTime, 0.6);
  ambient = { id, src, gain };
}

export const currentAmbient = () => ambient?.id ?? null;
