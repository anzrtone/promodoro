/** Pure layout math for the history timeline (day strip, lanes, gaps, memory anchors). */
import { MINUTE } from './time';
import type { AnyEvent } from './types';

export interface Interval {
  start: number;
  end: number;
}

export interface LaidOut<T extends Interval> {
  item: T;
  lane: number;
}

/** Greedy interval-graph colouring: overlapping items stack into rows instead of covering each other. */
export function assignLanes<T extends Interval>(items: T[]): { rows: LaidOut<T>[]; lanes: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const laneEnds: number[] = [];
  const rows: LaidOut<T>[] = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else laneEnds[lane] = item.end;
    rows.push({ item, lane });
  }
  return { rows, lanes: Math.max(1, laneEnds.length) };
}

/** Merge overlapping intervals into a union. */
export function union(items: Interval[]): Interval[] {
  const sorted = [...items].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

export interface Gap extends Interval {
  /** Gap runs up to "now" (the most recent stretch of unlogged time). */
  open: boolean;
  anchors: Anchor[];
}

export interface Anchor {
  ts: number;
  kind: 'opened' | 'returned' | 'alarm' | 'left';
  text: string;
}

/**
 * Unlogged stretches between sessions within [from, to]. Only gaps after the first
 * activity of the window are reported (we don't pretend you "missed" your sleep).
 */
export function findGaps(
  sessions: Interval[],
  window: Interval,
  opts: { minGapMs?: number; maxGapMs?: number; now?: number } = {},
): Gap[] {
  const minGap = opts.minGapMs ?? 5 * MINUTE;
  const maxGap = opts.maxGapMs ?? 6 * 60 * MINUTE;
  const blocks = union(
    sessions
      .map((s) => ({ start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }))
      .filter((s) => s.end > s.start),
  );
  const gaps: Gap[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const end = blocks[i].end;
    const next = blocks[i + 1]?.start;
    const now = opts.now ?? Number.POSITIVE_INFINITY;
    const until = next ?? Math.min(window.end, now);
    const open = next === undefined && until === now;
    const len = until - end;
    if (len >= minGap && len <= maxGap) gaps.push({ start: end, end: until, open, anchors: [] });
  }
  return gaps;
}

const anchorKinds: Partial<Record<AnyEvent['type'], Anchor['kind']>> = {
  'app.open': 'opened',
  'app.resume': 'returned',
  'timer.alarm': 'alarm',
  'app.background': 'left',
};

/** Attach "you opened the app at 2:58" style memory joggers to gaps. */
export function attachAnchors(gaps: Gap[], events: AnyEvent[], fmt: (ms: number) => string): Gap[] {
  const marks = events.filter((e) => anchorKinds[e.type]);
  return gaps.map((g) => ({
    ...g,
    anchors: marks
      .filter((e) => e.ts > g.start + MINUTE && e.ts < g.end - MINUTE)
      .slice(-4)
      .map((e) => {
        const kind = anchorKinds[e.type]!;
        const verb = kind === 'opened' ? 'opened Promodoro' : kind === 'returned' ? 'came back to Promodoro' : kind === 'alarm' ? 'heard an alarm' : 'switched away';
        return { ts: e.ts, kind, text: `You ${verb} at ${fmt(e.ts)}` };
      }),
  }));
}

/** Snap a timestamp to a minute grid (used by drag-to-claim). */
export function snap(ms: number, stepMin = 5): number {
  const step = stepMin * MINUTE;
  return Math.round(ms / step) * step;
}
