import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { ensureSeeded, updateSettings } from '@/db/settings';
import { buildReport, nextReportAt, reportText } from '@/features/dailyReport';
import { MINUTE, localDay } from '@/engine/time';

const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 23 + dayOffset, h, m, 0, 0).getTime();

describe('nextReportAt', () => {
  it('is later today when the time has not come yet', () => {
    expect(nextReportAt(at(15), 22 * 60)).toBe(at(22));
  });
  it('rolls to tomorrow once the time has passed', () => {
    expect(nextReportAt(at(22, 30), 22 * 60)).toBe(at(22, 0, 1));
    expect(nextReportAt(at(22), 22 * 60)).toBe(at(22, 0, 1));
  });
  it('honours a custom time', () => {
    expect(nextReportAt(at(6), 7 * 60 + 15)).toBe(at(7, 15));
  });
});

describe('reportText', () => {
  it('skips days without focus', () => {
    expect(reportText(0, 0, 2 * 60 * MINUTE)).toBeNull();
    expect(reportText(30_000, 1, 0)).toBeNull();
  });
  it('words the day', () => {
    expect(reportText(90 * MINUTE, 1, 0)?.body).toBe('You focused for 1h 30m today');
    expect(reportText(90 * MINUTE, 3, 0)?.body).toBe('You focused for 1h 30m today across 3 sessions');
  });
  it('mentions a reached goal', () => {
    expect(reportText(120 * MINUTE, 2, 120 * MINUTE)?.body).toContain('goal reached');
    expect(reportText(60 * MINUTE, 2, 120 * MINUTE)?.body).not.toContain('goal reached');
  });
});

describe('buildReport', () => {
  beforeAll(async () => {
    await ensureSeeded();
  });

  it('reports today’s focus for a report still to come today, and nothing when off or empty', async () => {
    const now = Date.now();
    const minutes = new Date(now + 3 * 60 * MINUTE).getHours() * 60;
    // A report 1–3 hours ahead may fall on tomorrow near midnight; pin it to today's date instead.
    const fireToday = nextReportAt(now, minutes);
    const day = localDay(fireToday);
    await updateSettings({ dailyReport: true, dailyReportMinutes: minutes });
    await db.daily.clear();
    expect(await buildReport(now)).toBeNull();

    await db.daily.put({ day, focusMs: 45 * MINUTE, breakMs: 0, overtimeMs: 0, sessions: 2, bySource: { timed: 45 * MINUTE, adjusted: 0, manual: 0, imported: 0 } });
    const r = await buildReport(now);
    expect(r?.at).toBe(fireToday);
    expect(r?.body).toBe('You focused for 45m today across 2 sessions');

    await updateSettings({ dailyReport: false });
    expect(await buildReport(now)).toBeNull();
  });
});
