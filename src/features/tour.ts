/**
 * The little guided tour after the welcome notebook: Pomo points at a few real controls.
 * Targets are elements marked with data-tour="…"; missing targets are simply skipped.
 */
import { useSyncExternalStore } from 'react';
import { navigate } from './nav';

export interface TourStep {
  target: string | null;
  text: string;
}

export const TOUR: TourStep[] = [
  { target: 'start', text: "Tap here to start (or press Space). When the timer hits zero I'll chime and keep counting, so flow time is never lost." },
  { target: 'setup', text: 'Pick a subject and a task here. Tap the clock to switch presets, or drag it to fine-tune.' },
  { target: 'timeline', text: 'Forgot to start me? No worries. Backdate a start, or claim the gap on your Timeline later.' },
  { target: 'stickers', text: 'No streaks here, ever. Just stickers for being kind to yourself.' },
  { target: null, text: "That's it! I made you something. Ready when you are, {name}." },
];

let step: number | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function startTour() {
  navigate('focus');
  step = 0;
  emit();
}

export function setTourStep(n: number | null) {
  step = n !== null && n >= TOUR.length ? null : n;
  emit();
}

export function useTourStep(): number | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => step,
  );
}
