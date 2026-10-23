/**
 * Daily report (Android): a notification each evening with the day's focus.
 *
 * Android can't compute text at fire time, so the next report is scheduled with the numbers
 * as they stand and rescheduled whenever they might have changed (a session ends, the app is
 * put away, the settings change). Days with no focus get no report, so only the next one is
 * ever scheduled: the following day's is set up the next time the app runs.
 */
import { db } from '@/db/schema';
import { getSettings } from '@/db/settings';
import { focusFor } from '@/engine/stats';
import { formatDuration, localDay } from '@/engine/time';
import type { TimeSource } from '@/engine/types';
import { platform } from '@/platform';
import type { ReportSpec } from '@/platform/types';

/** The next moment local time reads `minutes` after midnight (never in the past). */
export function nextReportAt(now: number, minutes: number): number {
  const d = new Date(now);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (d.getTime() <= now + 30_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The report's words, or null when there was no focus to report. */
export function reportText(focusMs: number, sessions: number, goalMs: number): { title: string; body: string } | null {
  if (focusMs < 60_000) return null;
  let body = `You focused for ${formatDuration(focusMs)} today`;
  if (sessions > 1) body += ` across ${sessions} sessions`;
  if (goalMs > 0 && focusMs >= goalMs) body += ' · goal reached 🎉';
  return { title: "Today's report is ready", body };
}

let lastKey = '';

export async function buildReport(now = Date.now()): Promise<ReportSpec | null> {
  const s = await getSettings();
  if (!s.dailyReport) return null;
  const at = nextReportAt(now, s.dailyReportMinutes);
  const sum = await db.daily.get(localDay(at));
  if (!sum) return null;
  const sources: TimeSource[] = s.chartSources;
  const text = reportText(focusFor(sum, sources), sum.sessions, s.dailyGoalMs);
  return text && { at, ...text };
}

/** Bring the scheduled notification in line with today's numbers and the settings. */
export async function refreshDailyReport(): Promise<void> {
  const p = platform();
  if (!p.scheduleReport) return;
  try {
    const report = await buildReport();
    const key = report ? `${report.at}|${report.body}` : '';
    if (key === lastKey) return;
    lastKey = key;
    await p.scheduleReport(report);
  } catch (err) {
    lastKey = '';
    console.warn('[report] could not schedule', err);
  }
}
