/** Time helpers. Everything is UTC epoch ms + a tz offset (minutes east of UTC). */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Current device offset, minutes east of UTC (e.g. +60 for CET, -300 for EST). */
export function tzNow(at: number = Date.now()): number {
  return -new Date(at).getTimezoneOffset();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day (YYYY-MM-DD) of an instant, as seen at offset `tz`. */
export function localDay(ms: number, tz: number = tzNow(ms)): string {
  const d = new Date(ms + tz * MINUTE);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC instant of local midnight for a YYYY-MM-DD day at offset tz. */
export function dayStart(day: string, tz?: number): number {
  const [y, m, d] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // When tz is not given, use the offset in force at that local midnight.
  const off = tz ?? tzNow(utcMidnight - tzNow(utcMidnight) * MINUTE);
  return utcMidnight - off * MINUTE;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function today(): string {
  return localDay(Date.now());
}

/** Monday-based week start for a day. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/** "25:00", "1:05:09". Negative values render as positive (callers show the sign). */
export function formatClock(ms: number, opts: { ceil?: boolean } = {}): string {
  const abs = Math.abs(ms);
  const total = opts.ceil ? Math.ceil(abs / SECOND) : Math.floor(abs / SECOND);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "1h 05m", "25m", "40s". */
export function formatDuration(ms: number, opts: { seconds?: boolean } = {}): string {
  const abs = Math.max(0, Math.round(ms / SECOND));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  if (h > 0) return m ? `${h}h ${pad(m)}m` : `${h}h`;
  if (m > 0) return opts.seconds && s ? `${m}m ${pad(s)}s` : `${m}m`;
  return `${s}s`;
}

/** Decimal hours, e.g. "12.5h". */
export function formatHours(ms: number): string {
  const h = ms / HOUR;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}

export function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDayLabel(day: string): string {
  const t = today();
  if (day === t) return 'Today';
  if (day === addDays(t, -1)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function formatAgo(ms: number): string {
  if (ms < 45 * SECOND) return 'just now';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min ago`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.round((ms % HOUR) / MINUTE);
    return m ? `${h} h ${m} min ago` : `${h} h ago`;
  }
  const d = Math.round(ms / DAY);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
}
