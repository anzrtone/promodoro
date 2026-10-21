/**
 * Render the app's procedural alarm sounds to WAV files for Android notification
 * channels (res/raw). Same synth code the app plays in the foreground.
 *   npm run sounds
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SOUNDS } from '../src/audio/catalog';
import { encodeWav, renderSound } from '../src/audio/synth';

const SR = 32000;
const out = 'android/app/src/main/res/raw';
mkdirSync(out, { recursive: true });
for (const id of [...SOUNDS.map((s) => s.id), 'silence' as const]) {
  const wav = encodeWav(renderSound(id, SR), SR);
  writeFileSync(`${out}/${id}.wav`, wav);
  console.log(`${id}.wav  ${(wav.length / 1024).toFixed(0)} KB`);
}
