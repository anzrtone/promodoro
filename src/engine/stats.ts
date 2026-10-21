/** Aggregations over sessions. Pure; the DB layer caches the daily ones. */
import { addDays, DAY, HOUR, localDay, weekStart } from './time';
import { isBreak } from './cycle';
import type { Board, DailySummary, Folder, Session, Task, TimeSource } from './types';

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

const charted = (s: Session, sources: TimeSource[]) => live(s) && !s.bulk && s.phase === 'focus' && sources.includes(s.source);

/** Split a session's wall-clock span at local hour boundaries: cb(weekday 0=Mon..6, hour, ms). */
function eachHourSlice(s: Session, cb: (weekday: number, hour: number, ms: number) => void) {
  let t = s.start;
  while (t < s.end) {
    const local = new Date(t + s.tz * 60_000);
    const nextHour = t - (local.getUTCMinutes() * 60_000 + local.getUTCSeconds() * 1000 + local.getUTCMilliseconds()) + HOUR;
    const seg = Math.min(s.end, nextHour) - t;
    cb((local.getUTCDay() + 6) % 7, local.getUTCHours(), seg);
    t += seg;
  }
}

/** Focus minutes by local hour-of-day (0..23), for "when do you focus best". */
export function hourProfile(sessions: Session[], sources: TimeSource[]): number[] {
  const hours = new Array(24).fill(0);
  for (const s of sessions) if (charted(s, sources)) eachHourSlice(s, (_, h, ms) => (hours[h] += ms));
  return hours;
}

/** Focus ms as a 7×24 grid, Monday first, for the weekday × hour heatmap. */
export function weekHourGrid(sessions: Session[], sources: TimeSource[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const s of sessions) if (charted(s, sources)) eachHourSlice(s, (w, h, ms) => (grid[w][h] += ms));
  return grid;
}

export interface Bucket {
  key: string;
  days: string[];
}

/** Group a run of days into day / week (Monday) / month buckets so long ranges stay readable. */
export function bucketDays(days: string[], unit: 'day' | 'week' | 'month'): Bucket[] {
  const out: Bucket[] = [];
  for (const d of days) {
    const key = unit === 'day' ? d : unit === 'week' ? weekStart(d) : d.slice(0, 7);
    const last = out[out.length - 1];
    if (last?.key === key) last.days.push(d);
    else out.push({ key, days: [d] });
  }
  return out;
}

export interface SessionShape {
  /** Focus sessions counted (bulk lumps left out). */
  count: number;
  /** Countdown sessions that had a target, split by how they ended. */
  targeted: number;
  ranFull: number;
  wrappedEarly: number;
  /** Medians over targeted sessions (0 when there are none). */
  medianActualMs: number;
  medianPlannedMs: number;
  /** Paused time per hour of focus. */
  pausedPerHourMs: number;
  focusMs: number;
  breakMs: number;
  longestMs: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** How sessions tend to go: full vs wrapped early, typical length vs plan, pauses, focus:break. */
export function sessionShape(sessions: Session[], sources: TimeSource[]): SessionShape {
  const out: SessionShape = { count: 0, targeted: 0, ranFull: 0, wrappedEarly: 0, medianActualMs: 0, medianPlannedMs: 0, pausedPerHourMs: 0, focusMs: 0, breakMs: 0, longestMs: 0 };
  const actual: number[] = [];
  const planned: number[] = [];
  let paused = 0;
  for (const s of sessions) {
    if (!live(s) || s.bulk) continue;
    if (isBreak(s.phase)) {
      out.breakMs += s.actualMs;
      continue;
    }
    if (!charted(s, sources)) continue;
    out.count++;
    out.focusMs += s.actualMs;
    paused += s.pausedMs;
    out.longestMs = Math.max(out.longestMs, s.actualMs);
    if (s.mode !== 'countup' && s.plannedMs > 0 && (s.endReason === 'complete' || s.endReason === 'early')) {
      out.targeted++;
      if (s.endReason === 'complete') out.ranFull++;
      else out.wrappedEarly++;
      actual.push(s.actualMs);
      planned.push(s.plannedMs);
    }
  }
  out.medianActualMs = median(actual);
  out.medianPlannedMs = median(planned);
  out.pausedPerHourMs = out.focusMs ? (paused / out.focusMs) * HOUR : 0;
  return out;
}

export interface TreeNode {
  id: string;
  kind: 'folder' | 'subject' | 'task' | 'none';
  name: string;
  color?: string;
  ms: number;
  sessions: number;
  /** Focus ms per bucket, for the row's little trend line. */
  trend: number[];
  children: TreeNode[];
}

/**
 * Focus time as a folder → subfolder → subject → task tree. A session lands on its subject, or on
 * its task's subject/folder when it has none; anything left goes under "No subject". Empty branches
 * are dropped and every level is sorted by time.
 */
export function subjectTree(
  sessions: Session[],
  sources: TimeSource[],
  ctx: { boards: Board[]; folders: Folder[]; tasks: Task[]; bucketOf: (day: string) => number; buckets: number },
): TreeNode[] {
  const { boards, folders, tasks, bucketOf, buckets } = ctx;
  const nodes = new Map<string, TreeNode>();
  const node = (key: string, make: () => Omit<TreeNode, 'ms' | 'sessions' | 'trend' | 'children'>) => {
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { ...make(), ms: 0, sessions: 0, trend: new Array(buckets).fill(0), children: [] }));
    return n;
  };
  const roots: TreeNode[] = [];
  const parents = new Map<TreeNode, TreeNode | null>();
  const attach = (parent: TreeNode | null, child: TreeNode) => {
    if (parents.has(child)) return;
    parents.set(child, parent);
    (parent ? parent.children : roots).push(child);
  };
  const folderChain = (id: string | undefined): TreeNode | null => {
    const f = id ? folders.find((x) => x.id === id) : undefined;
    if (!f) return null;
    const n = node(`f:${f.id}`, () => ({ id: f.id, kind: 'folder', name: f.name, color: f.color }));
    attach(f.parentId ? folderChain(f.parentId) : null, n);
    return n;
  };

  for (const s of sessions) {
    if (!charted(s, sources)) continue;
    const task = s.taskId ? tasks.find((t) => t.id === s.taskId) : undefined;
    const board = boards.find((b) => b.id === (s.boardId ?? task?.boardId));
    let leafParent: TreeNode;
    if (board) {
      leafParent = node(`b:${board.id}`, () => ({ id: board.id, kind: 'subject', name: board.name, color: board.color }));
      attach(folderChain(board.folderId), leafParent);
    } else {
      const f = folderChain(task?.folderId);
      leafParent = f ?? node('none', () => ({ id: '', kind: 'none', name: 'No subject' }));
      if (!f) attach(null, leafParent);
    }
    const path: TreeNode[] = [];
    if (task) {
      const t = node(`t:${task.id}`, () => ({ id: task.id, kind: 'task', name: task.title }));
      attach(leafParent, t);
      path.push(t);
    }
    // Credit the leaf and every ancestor once.
    for (let n: TreeNode | null | undefined = leafParent; n; n = parents.get(n)) path.push(n);
    const b = bucketOf(s.day);
    for (const n of path) {
      n.ms += s.actualMs;
      n.sessions++;
      if (b >= 0 && b < buckets) n.trend[b] += s.actualMs;
    }
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => b.ms - a.ms);
    list.forEach((n) => sort(n.children));
    return list;
  };
  return sort(roots);
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

export interface Period {
  /** Minutes after local midnight, 0..1440. */
  from: number;
  to: number;
  boardId?: string;
}

/** Focus blocks per local day, split at midnight, for the "focus periods" chart. */
export function focusPeriods(sessions: Session[], sources: TimeSource[]): Map<string, Period[]> {
  const out = new Map<string, Period[]>();
  for (const s of sessions) {
    if (!charted(s, sources)) continue;
    let t = s.start;
    while (t < s.end) {
      const local = t + s.tz * 60_000;
      const intoDay = ((local % DAY) + DAY) % DAY;
      const seg = Math.min(s.end, t + (DAY - intoDay)) - t;
      const day = localDay(t, s.tz);
      const list = out.get(day) ?? [];
      list.push({ from: intoDay / 60_000, to: (intoDay + seg) / 60_000, boardId: s.boardId });
      out.set(day, list);
      t += seg;
    }
  }
  return out;
}

/** Focus ms per subject ('' = no subject), biggest first. */
export function bySubject(sessions: Session[], sources: TimeSource[]): Array<{ boardId: string; ms: number }> {
  const m = new Map<string, number>();
  for (const s of sessions) if (live(s) && s.phase === 'focus' && sources.includes(s.source)) m.set(s.boardId ?? '', (m.get(s.boardId ?? '') ?? 0) + s.actualMs);
  return [...m.entries()].map(([boardId, ms]) => ({ boardId, ms })).sort((a, b) => b.ms - a.ms);
}

/** Tasks ticked off on a local day within [from, to]. */
export function tasksDone(tasks: Task[], from: string, to: string): number {
  return tasks.filter((t) => t.done && t.doneAt && localDay(t.doneAt) >= from && localDay(t.doneAt) <= to).length;
}

/** Each day's focus against the daily goal (ratio may exceed 1). */
export function goalDays(days: string[], byDay: Map<string, DailySummary>, sources: TimeSource[], goalMs: number) {
  return days.map((day) => {
    const s = byDay.get(day);
    const ms = s ? focusFor(s, sources) : 0;
    return { day, ms, ratio: goalMs > 0 ? ms / goalMs : 0 };
  });
}
