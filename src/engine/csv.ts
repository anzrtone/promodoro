/**
 * CSV parsing / writing and history import mapping (Forest, Flow, spreadsheets, …).
 * Tolerant by design: we trust the user's numbers and never police them.
 */
import { MINUTE, SECOND, localDay, tzNow, uid } from './time';
import type { Phase, Session } from './types';

export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map((d) => [d, head.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

/** RFC-4180-ish parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCSV(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

/* ---------------- parsing values ---------------- */

/**
 * Durations: "25", "25.5" (minutes), "1:25" (h:mm), "1:25:30", "25m", "1h 5m", "90 min",
 * "3600s", "PT1H5M". Bare numbers are minutes unless `unit` says otherwise.
 */
export function parseDuration(raw: string, unit: 'min' | 'sec' | 'hour' = 'min'): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const iso = /^pt(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (iso && (iso[1] || iso[2] || iso[3]))
    return Math.round((+(iso[1] ?? 0) * 3600 + +(iso[2] ?? 0) * 60 + +(iso[3] ?? 0)) * SECOND);
  const colon = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (colon) {
    const [a, b, c] = [+colon[1], +colon[2], colon[3] !== undefined ? +colon[3] : null];
    return c === null ? (a * 60 + b) * MINUTE : (a * 3600 + b * 60 + c) * SECOND;
  }
  const parts = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/g)];
  if (parts.length) {
    let ms = 0;
    for (const [, n, u] of parts) {
      const v = parseFloat(n.replace(',', '.'));
      ms += u.startsWith('h') ? v * 3600_000 : u.startsWith('m') ? v * MINUTE : v * SECOND;
    }
    return Math.round(ms);
  }
  const num = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * (unit === 'sec' ? SECOND : unit === 'hour' ? 3600_000 : MINUTE));
}

/**
 * Dates: ISO 8601 (with or without zone), "YYYY-MM-DD HH:mm[:ss]", "YYYY/MM/DD",
 * "MM/DD/YYYY HH:mm" (or DD/MM when the first part > 12), "Mon DD, YYYY h:mm AM",
 * epoch seconds / milliseconds. Zone-less values are read as local time.
 */
export function parseDate(raw: string, dayFirst = false): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{10}$/.test(s)) return +s * 1000;
  if (/^\d{13}$/.test(s)) return +s;
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(am|pm)?)?\s*(z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (ymd) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', ap, zone] = ymd;
    let hour = +h;
    if (ap) hour = (hour % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
    if (zone) return Date.parse(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${mi}:${se.padStart(2, '0')}${zone.toUpperCase() === 'Z' ? 'Z' : zone.length === 5 ? zone.slice(0, 3) + ':' + zone.slice(3) : zone}`);
    return new Date(+y, +mo - 1, +d, hour, +mi, +se).getTime();
  }
  const mdy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(s);
  if (mdy) {
    const [, a, b, yy, h = '0', mi = '0', se = '0', ap] = mdy;
    let [mo, d] = [+a, +b];
    if (dayFirst || mo > 12) [mo, d] = [d, mo];
    let hour = +h;
    if (ap) hour = (hour % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
    const year = yy.length === 2 ? 2000 + +yy : +yy;
    return new Date(year, mo - 1, d, hour, +mi, +se).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/* ---------------- column mapping ---------------- */

export interface ColumnMapping {
  start?: number;
  end?: number;
  /** A date-only column combined with `time` (some exports split them). */
  date?: number;
  time?: number;
  duration?: number;
  durationUnit: 'min' | 'sec' | 'hour';
  label?: number;
  note?: number;
  /** Column that marks a failed/abandoned session (Forest "Is Success"). */
  success?: number;
  dayFirst: boolean;
}

const has = (h: string, ...words: string[]) => words.some((w) => h.includes(w));

/** Guess which column is which from header names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = { durationUnit: 'min', dayFirst: false };
  headers.forEach((raw, i) => {
    const h = raw.trim().toLowerCase();
    if (m.start === undefined && has(h, 'start', 'begin', 'from')) m.start = i;
    else if (m.end === undefined && has(h, 'end', 'finish', 'stop', 'to ')) m.end = i;
    else if (m.duration === undefined && has(h, 'duration', 'length', 'minutes', 'mins', 'seconds', 'hours', 'time spent', 'elapsed')) {
      m.duration = i;
      if (has(h, 'second', 'sec')) m.durationUnit = 'sec';
      else if (has(h, 'hour')) m.durationUnit = 'hour';
    } else if (m.date === undefined && (h === 'date' || h === 'day')) m.date = i;
    else if (m.time === undefined && h === 'time') m.time = i;
    else if (m.label === undefined && has(h, 'tag', 'label', 'subject', 'project', 'category', 'task', 'title', 'name', 'activity')) m.label = i;
    else if (m.note === undefined && has(h, 'note', 'comment', 'description')) m.note = i;
    else if (m.success === undefined && has(h, 'success', 'completed', 'status')) m.success = i;
  });
  return m;
}

export interface ImportRow {
  start: number;
  end: number;
  durationMs: number;
  label?: string;
  note?: string;
}

export interface ImportResult {
  rows: ImportRow[];
  skipped: { line: number; reason: string }[];
}

export function mapRows(rows: string[][], m: ColumnMapping, hasHeader = true): ImportResult {
  const out: ImportRow[] = [];
  const skipped: ImportResult['skipped'] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((r, idx) => {
    const line = idx + (hasHeader ? 2 : 1);
    const cell = (i?: number) => (i === undefined ? '' : (r[i] ?? '').trim());
    let start = m.start !== undefined ? parseDate(cell(m.start), m.dayFirst) : null;
    if (start === null && m.date !== undefined) start = parseDate(`${cell(m.date)} ${cell(m.time) || '00:00'}`.trim(), m.dayFirst);
    let end = m.end !== undefined ? parseDate(cell(m.end), m.dayFirst) : null;
    let dur = m.duration !== undefined ? parseDuration(cell(m.duration), m.durationUnit) : null;
    if (start !== null && end !== null && end < start) end += 24 * 3600_000; // crossed midnight in a time-only export
    if (dur === null && start !== null && end !== null) dur = end - start;
    if (start === null && end !== null && dur !== null) start = end - dur;
    if (start !== null && end === null && dur !== null) end = start + dur;
    if (start === null || end === null || dur === null) return skipped.push({ line, reason: 'Could not read a date and a duration' });
    if (!(dur > 0)) return skipped.push({ line, reason: 'Duration is zero' });
    if (m.success !== undefined && /^(false|no|0|failed|fail)$/i.test(cell(m.success)))
      return skipped.push({ line, reason: 'Marked as not completed in the source app' });
    out.push({ start, end, durationMs: dur, label: cell(m.label) || undefined, note: cell(m.note) || undefined });
  });
  return { rows: out, skipped };
}

/** Stable fingerprint so importing the same file twice doesn't double count. */
export function importKey(start: number, durationMs: number): string {
  return `${Math.round(start / MINUTE)}:${Math.round(durationMs / MINUTE)}`;
}

export function rowToSession(r: ImportRow, from: string, phase: Phase = 'focus'): Session {
  const tz = tzNow(r.start);
  return {
    id: uid('imp'),
    start: r.start,
    end: r.end,
    tz,
    day: localDay(r.start, tz),
    phase,
    label: r.label,
    note: r.note,
    plannedMs: 0,
    actualMs: r.durationMs,
    timedMs: 0,
    recoveredMs: 0,
    pausedMs: Math.max(0, r.end - r.start - r.durationMs),
    overtimeMs: 0,
    source: 'imported',
    importKey: importKey(r.start, r.durationMs),
    importFrom: from,
    createdAt: Date.now(),
  };
}

/** Is `candidate` a likely duplicate of an existing session (±1 min start, ±1 min length)? */
export function isLikelyDuplicate(candidate: { start: number; actualMs: number }, existing: { start: number; actualMs: number }[]): boolean {
  return existing.some((e) => Math.abs(e.start - candidate.start) <= MINUTE && Math.abs(e.actualMs - candidate.actualMs) <= MINUTE);
}

export const SESSION_CSV_HEADER = [
  'id', 'start', 'end', 'tz_offset_min', 'day', 'phase', 'mode', 'label', 'board', 'planned_min', 'actual_min',
  'timed_min', 'recovered_min', 'paused_min', 'overtime_min', 'source', 'end_reason', 'mood', 'note',
];

const min = (ms: number) => Math.round((ms / MINUTE) * 100) / 100;

export function sessionsToCSV(sessions: Session[], boardName: (id?: string) => string = () => ''): string {
  return toCSV([
    SESSION_CSV_HEADER,
    ...sessions
      .filter((s) => !s.deleted)
      .sort((a, b) => a.start - b.start)
      .map((s) => [
        s.id, new Date(s.start).toISOString(), new Date(s.end).toISOString(), s.tz, s.day, s.phase, s.mode ?? '', s.label ?? '',
        boardName(s.boardId), min(s.plannedMs), min(s.actualMs), min(s.timedMs), min(s.recoveredMs), min(s.pausedMs),
        min(s.overtimeMs), s.source, s.endReason ?? '', s.mood ?? '', s.note ?? '',
      ]),
  ]);
}
