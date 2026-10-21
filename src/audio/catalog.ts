import type { AmbientId, SoundId } from './synth';

export interface SoundInfo {
  id: SoundId;
  name: string;
  hint: string;
}

/** Small built-in set (a bigger library comes later, once people ask for it). */
export const SOUNDS: SoundInfo[] = [
  { id: 'kitchen', name: 'Tomato timer', hint: 'the classic wind-up ring' },
  { id: 'bell', name: 'Desk bell', hint: 'ding … ding' },
  { id: 'chime', name: 'Glockenspiel', hint: 'four bright notes up' },
  { id: 'marimba', name: 'Marimba', hint: 'soft and woody' },
  { id: 'musicbox', name: 'Music box', hint: 'a tiny lullaby' },
  { id: 'birds', name: 'Morning birds', hint: 'chirpy little friends' },
  { id: 'soft', name: 'Soft pad', hint: 'barely-there, for breaks' },
];

export const AMBIENTS: Array<{ id: AmbientId; name: string; emoji: string }> = [
  { id: 'rain', name: 'Rain on the window', emoji: '🌧️' },
  { id: 'brown', name: 'Brown noise', emoji: '🟤' },
  { id: 'waves', name: 'Slow waves', emoji: '🌊' },
  { id: 'fire', name: 'Fireplace', emoji: '🔥' },
];

export const soundName = (id?: string) => SOUNDS.find((s) => s.id === id)?.name ?? 'Default';
export const isSoundId = (id?: string | null): id is SoundId => !!id && SOUNDS.some((s) => s.id === id);
