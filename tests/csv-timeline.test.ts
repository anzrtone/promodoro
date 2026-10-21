import { describe, expect, it } from 'vitest';
import { guessMapping, importKey, mapRows, parseCSV, parseDate, parseDuration, toCSV } from '@/engine/csv';
import { assignLanes, findGaps } from '@/engine/timeline';
import { suggestBreakMs, breakAfter, roundAfterBreak, DEFAULT_PRESETS } from '@/engine/cycle';
import { localDay, MINUTE, HOUR } from '@/engine/time';
import { hourProfile } from '@/engine/stats';
import type { Session } from '@/engine/types';

describe('csv', () => {
  it('parses quotes, escaped quotes, CRLF and BOM', () => {
    const rows = parseCSV('﻿a,b,c\r\n"x, y","say ""hi""",3\r\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', '3']]);
  });

  it('detects semicolon delimiters', () => {
    expect(parseCSV('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('round-trips through toCSV', () => {
    const data = [['n', 'note'], ['1', 'has, comma "and quotes"']];
    expect(parseCSV(toCSV(data))).toEqual(data);
  });

  it('reads many duration formats', () => {
    expect(parseDuration('25')).toBe(25 * MINUTE);
    expect(parseDuration('1:30')).toBe(90 * MINUTE);
    expect(parseDuration('1:02:03')).toBe((3600 + 123) * 1000);
    expect(parseDuration('1h 5m')).toBe(65 * MINUTE);
    expect(parseDuration('90 min')).toBe(90 * MINUTE);
    expect(parseDuration('PT1H5M')).toBe(65 * MINUTE);
    expect(parseDuration('3600', 'sec')).toBe(HOUR);
    expect(parseDuration('300', 'hour')).toBe(300 * HOUR);
    expect(parseDuration('')).toBeNull();
  });

  it('reads many date formats', () => {
    expect(parseDate('2026-10-21T13:00:00Z')).toBe(Date.UTC(2026, 9, 21, 13));
    expect(parseDate('2026-10-21 13:00')).toBe(new Date(2026, 9, 21, 13).getTime());
    expect(parseDate('10/21/2026 1:00 PM')).toBe(new Date(2026, 9, 21, 13).getTime());
    expect(parseDate('21/10/2026 13:00')).toBe(new Date(2026, 9, 21, 13).getTime());
    expect(parseDate('1792587600')).toBe(1792587600000);
  });

  it('maps a Forest-style export, skipping failed sessions', () => {
    const csv = 'Start Time,End Time,Tag,Note,Tree Type,Is Success\n2026-10-20 09:00,2026-10-20 09:25,Study,ch 3,Cedar,True\n2026-10-20 10:00,2026-10-20 10:10,Study,,Cedar,False\n';
    const rows = parseCSV(csv);
    const m = guessMapping(rows[0]);
    expect(m.start).toBe(0);
    expect(m.end).toBe(1);
    expect(m.label).toBe(2);
    expect(m.note).toBe(3);
    expect(m.success).toBe(5);
    const res = mapRows(rows, m);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].durationMs).toBe(25 * MINUTE);
    expect(res.rows[0].label).toBe('Study');
    expect(res.skipped).toHaveLength(1);
  });

  it('maps date + duration spreadsheets and bulk hours', () => {
    const rows = parseCSV('Date,Hours,Subject\n2026-01-01,300,Thesis\n');
    const m = guessMapping(rows[0]);
    expect(m.durationUnit).toBe('hour');
    const res = mapRows(rows, m);
    expect(res.rows[0].durationMs).toBe(300 * HOUR);
  });

  it('import keys are stable per minute', () => {
    expect(importKey(1000, 25 * MINUTE)).toBe(importKey(20_000, 25 * MINUTE + 10_000));
  });
});

describe('timeline', () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 21, h, m);

  it('stacks overlapping timers into lanes', () => {
    const { rows, lanes } = assignLanes([
      { start: at(13), end: at(13, 25) },
      { start: at(13, 10), end: at(13, 15) },
      { start: at(13, 30), end: at(14) },
    ]);
    expect(lanes).toBe(2);
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0]);
  });

  it('finds unlogged gaps up to now', () => {
    const gaps = findGaps(
      [{ start: at(13), end: at(13, 25) }, { start: at(13, 30), end: at(13, 55) }, { start: at(14), end: at(14, 13) }],
      { start: at(0), end: at(24) },
      { now: at(15) },
    );
    expect(gaps.map((g) => [g.start, g.end, g.open])).toEqual([
      [at(13, 25), at(13, 30), false],
      [at(13, 55), at(14), false],
      [at(14, 13), at(15), true],
    ]);
  });
});

describe('breaks & cycles', () => {
  const preset = DEFAULT_PRESETS[0];
  it('suggests work ÷ 5', () => {
    expect(suggestBreakMs(50 * MINUTE, 'short', preset, { mode: 'ratio', ratio: 5 })).toBe(10 * MINUTE);
    expect(suggestBreakMs(120 * MINUTE, 'short', preset, { mode: 'ratio', ratio: 5 })).toBe(24 * MINUTE);
    expect(suggestBreakMs(2 * MINUTE, 'short', preset, { mode: 'ratio', ratio: 5 })).toBe(1 * MINUTE);
    expect(suggestBreakMs(50 * MINUTE, 'short', preset, { mode: 'preset', ratio: 5 })).toBe(5 * MINUTE);
  });
  it('long break after the last round, then a new cycle', () => {
    expect(breakAfter(3, preset)).toBe('short');
    expect(breakAfter(4, preset)).toBe('long');
    expect(roundAfterBreak(3, 'short', preset)).toBe(4);
    expect(roundAfterBreak(4, 'long', preset)).toBe(1);
  });
});

describe('time & stats', () => {
  it('local day honours the stored offset (DST/travel safe)', () => {
    const t = Date.UTC(2026, 9, 21, 23, 30);
    expect(localDay(t, 0)).toBe('2026-10-21');
    expect(localDay(t, 120)).toBe('2026-10-22');
    expect(localDay(t, -300)).toBe('2026-10-21');
  });

  it('hour profile splits sessions across hours in local time', () => {
    const s = { start: Date.UTC(2026, 9, 21, 9, 40), end: Date.UTC(2026, 9, 21, 10, 20), tz: 60, phase: 'focus', source: 'timed' } as Session;
    const h = hourProfile([s], ['timed']);
    expect(h[10]).toBe(20 * MINUTE);
    expect(h[11]).toBe(20 * MINUTE);
  });
});
