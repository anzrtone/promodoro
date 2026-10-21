/** Presets, cycle sequencing and the suggested-break calculator. */
import { MINUTE } from './time';
import type { Phase, Preset } from './types';

export const DEFAULT_PRESETS: Preset[] = [
  { id: 'p-25-5', name: 'Classic 25 / 5', focusMin: 25, shortMin: 5, longMin: 15, rounds: 4, builtin: true, order: 0 },
  { id: 'p-30-5', name: 'Steady 30 / 5', focusMin: 30, shortMin: 5, longMin: 20, rounds: 4, builtin: true, order: 1 },
  { id: 'p-30-15', name: 'Gentle 30 / 15', focusMin: 30, shortMin: 15, longMin: 30, rounds: 3, builtin: true, order: 2 },
  { id: 'p-50-10', name: 'Deep Study 50 / 10', focusMin: 50, shortMin: 10, longMin: 30, rounds: 3, builtin: false, order: 3 },
];

export interface BreakPolicy {
  /** 'ratio': work ÷ ratio (default 5). 'preset': the preset's fixed lengths. */
  mode: 'ratio' | 'preset';
  ratio: number;
}

export const DEFAULT_BREAK_POLICY: BreakPolicy = { mode: 'ratio', ratio: 5 };

/**
 * Suggest a break from how long you *actually* worked (incl. overtime and recovered time).
 * 50 min → 10 min, 120 min → 24 min at the default ratio of 5. Long breaks get a gentle
 * 1.5× bump. Always a suggestion: the user can change or skip it.
 */
export function suggestBreakMs(workedMs: number, phase: Exclude<Phase, 'focus' | 'side'>, preset: Preset, policy: BreakPolicy): number {
  if (policy.mode === 'preset') return (phase === 'long' ? preset.longMin : preset.shortMin) * MINUTE;
  const ratio = Math.max(1, policy.ratio || 5);
  let min = workedMs / MINUTE / ratio;
  if (phase === 'long') min *= 1.5;
  return Math.min(60, Math.max(1, Math.round(min))) * MINUTE;
}

/** Which break follows focus round `round` (1-based) in a preset. */
export function breakAfter(round: number, preset: Preset): 'short' | 'long' {
  return preset.rounds > 0 && round % preset.rounds === 0 ? 'long' : 'short';
}

/** Round number for the focus session after a break. Long breaks start a new cycle. */
export function roundAfterBreak(round: number, breakPhase: 'short' | 'long', preset: Preset): number {
  if (breakPhase === 'long') return 1;
  return (round % Math.max(1, preset.rounds)) + 1;
}

export function phaseLabel(p: Phase): string {
  return p === 'focus' ? 'Focus' : p === 'short' ? 'Short break' : p === 'long' ? 'Long break' : 'Side timer';
}

export const isBreak = (p: Phase) => p === 'short' || p === 'long';
