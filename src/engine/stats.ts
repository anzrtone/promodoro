/** Aggregations over sessions. Pure; the DB layer caches the daily ones. */
import { addDays, HOUR, localDay } from './time';
import { isBreak } from './cycle';
import type { DailySummary, Session, TimeSource } from './types';

export const ALL_SOURCES: TimeSource[] = ['timed', 'adjusted', 'manual', 'imported'];

export const SOURCE_LABEL: Record<TimeSource, string> = {
  timed: 'Timed',
  adjusted: 'Timed + recovered',
  manual: 'Added by hand',
  imported: 'Imported',
};

const live = (s: Session) => !s.deleted;

export function emptySummary(day: string): DailySummary {
  return { day, focusMs: 0, breakMs: 0, overtimeMs: 0, sessions: 0, bySource: { timed: 0, adjusted: 0, manual: 0, imported: 0 } };
}

export function summarizeDay(day: string, sessions: Session[]): DailySummary {
  const out = emptySummary(day);
  for (const s of sessions) {
    if (!live(s) || s.day !== day) continue;
    if (s.phase === 'focus') {
      out.focusMs += s.actualMs;
      out.overtimeMs += s.overtimeMs;
      out.sessions += 1;
      out.bySource[s.source] += s.actualMs;
    } else if (isBreak(s.phase)) out.breakMs += s.actualMs;
  }
  return out;
}

/** Focus ms in a summary counting only the selected sources (so a 300 h import can be filtered out). */
export function focusFor(sum: DailySummary, sources: TimeSource[]): number {
  return sources.reduce((acc, src) => acc + (sum.bySource[src] ?? 0), 0);
}

export interface RangeStats {
  totalMs: number;
  activeDays: number;
  avgPerActiveDay: number;
  overtimeMs: number;
  sessions: number;
  bestDay?: { day: string; ms: number };
}

export function rangeStats(summaries: DailySummary[], sources: TimeSource[]): RangeStats {
  let totalMs = 0;
  let activeDays = 0;
  let overtimeMs = 0;
  let sessions = 0;
  let bestDay: RangeStats['bestDay'];
  for (const s of summaries) {
    const ms = focusFor(s, sources);
    if (ms > 0) activeDays++;
    totalMs += ms;
    overtimeMs += s.overtimeMs;
    sessions += s.sessions;
    if (!bestDay || ms > bestDay.ms) bestDay = { day: s.day, ms };
  }
  return { totalMs, activeDays, avgPerActiveDay: activeDays ? totalMs / activeDays : 0, overtimeMs, sessions, bestDay: bestDay?.ms ? bestDay : undefined };
}

/** Focus minutes by local hour-of-day (0..23), for "when do you focus best". */
export function hourProfile(sessions: Session[], sources: TimeSource[]): number[] {
  const hours = new Array(24).fill(0);
  for (const s of sessions) {
    if (!live(s) || s.bulk || s.phase !== 'focus' || !sources.includes(s.source)) continue;
    let t = s.start;
    while (t < s.end) {
      const local = new Date(t + s.tz * 60_000);
      const h = local.getUTCHours();
      const nextHour = t - (local.getUTCMinutes() * 60_000 + local.getUTCSeconds() * 1000 + local.getUTCMilliseconds()) + HOUR;
      const seg = Math.min(s.end, nextHour) - t;
      hours[h] += seg;
      t += seg;
    }
  }
  return hours;
}

/** Average mood score per hour bucket, if the user leaves margin moods. */
export function moodScore(m: Session['mood']): number | null {
  return m === 'great' ? 4 : m === 'good' ? 3 : m === 'meh' ? 2 : m === 'tough' ? 1 : null;
}

/** Days with any focus, counted as "pages filled". Deliberately not a streak. */
export function pagesFilled(summaries: DailySummary[]): number {
  return summaries.filter((s) => s.focusMs > 0).length;
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Longest gap in days between consecutive active days ending at `day` (for comeback stickers). */
export function daysAwayBefore(day: string, activeDays: string[]): number {
  const prev = activeDays.filter((d) => d < day).sort().pop();
  if (!prev) return 0;
  let n = 0;
  for (let d = prev; d < day; d = addDays(d, 1)) n++;
  return n - 1;
}

export { localDay };
