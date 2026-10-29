/**
 * Gentle analytics. No streaks, no "you missed a day". Charts are single-hue (tomato)
 * with *texture* telling time sources apart, so they read in colour-blind and print
 * contexts too; every bar has a tooltip and there's a table view.
 */
import { useMemo, useState } from 'react';
import { useCachedLiveQuery } from '@/hooks/useCachedLiveQuery';
import { Table2, BarChart3, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useViewDb } from '@/features/demo';
import { updateSettings, useSettings } from '@/db/settings';
import {
  ALL_SOURCES,
  bucketDays,
  bySubject,
  focusFor,
  focusPeriods,
  goalDays,
  hourBySource,
  hourProfile,
  pagesFilled,
  rangeStats,
  sessionShape,
  SOURCE_LABEL,
  subjectTree,
  tasksDone,
  weekHourGrid,
  type Bucket,
  type SessionShape,
  type TreeNode,
} from '@/engine/stats';
import { addDays, addMonths, dayStart, DAY, formatDayLabel, formatDuration, formatHours, HOUR, today } from '@/engine/time';
import type { DailySummary, TimeSource } from '@/engine/types';
import { cx, Section, Segmented } from '@/components/ui';
import { FocusPeriods, GoalCalendar, GoalPicker, NO_SUBJECT_COLOR, SubjectDonut, topSlices } from '@/components/StatsWidgets';
import { ShareStatsSheet, type StatsSnapshot } from '@/components/StatsCard';

const TEXTURE: Record<TimeSource, React.CSSProperties> = {
  timed: { background: 'rgb(var(--pm-tomato))' },
  adjusted: { background: 'repeating-linear-gradient(135deg, rgb(var(--pm-tomato)) 0 3px, rgb(var(--pm-tomato) / 0.45) 3px 6px)' },
  manual: { background: 'rgb(var(--pm-tomato) / 0.12)', boxShadow: 'inset 0 0 0 1.5px rgb(var(--pm-tomato))' },
  imported: { background: 'radial-gradient(rgb(var(--pm-tomato)) 1.2px, rgb(var(--pm-tomato) / 0.25) 1.4px) 0 0 / 5px 5px' },
};
const SHORT: Record<TimeSource, string> = { timed: 'Timed', adjusted: 'Adjusted', manual: 'By hand', imported: 'Imported' };

type Range = 'day' | 'week' | 'month' | 'year';
type Unit = 'hour' | 'day' | 'month';
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'day', label: '1 day' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h: number) => (h % 24 === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);
const localDate = (day: string) => new Date(dayStart(day) + DAY / 2);
const shortDate = (day: string) => localDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = (day: string, month: 'long' | 'short' = 'long') => localDate(day).toLocaleDateString(undefined, { month });
const daysBetween = (a: string, b: string) => Math.round((dayStart(b) - dayStart(a)) / DAY) + 1;
const minDay = (a: string, b: string) => (a < b ? a : b);

/**
 * The stretch of days a range shows around `anchor`: one day, the 7 days ending on it, or its
 * calendar month / year (cut off at today). The comparison is the stretch just before, trimmed to
 * the same length, so day 12 of a month is held up against days 1–12 of the last one, not all 31.
 */
interface Period {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  unit: Unit;
  /** Header between the arrows. */
  label: string;
  /** Chart title. */
  title: string;
  /** "focus, ___" */
  name: string;
  /** "+2h vs ___" */
  vs: string;
}

function periodOf(range: Range, anchor: string, t: string): Period {
  if (range === 'day') {
    const prev = addDays(anchor, -1);
    return { start: anchor, end: anchor, prevStart: prev, prevEnd: prev, unit: 'hour', label: formatDayLabel(anchor), title: 'Hour by hour', name: anchor === t ? 'today' : formatDayLabel(anchor).toLowerCase(), vs: anchor === t ? 'yesterday' : 'the day before' };
  }
  if (range === 'week') {
    const start = addDays(anchor, -6);
    return { start, end: anchor, prevStart: addDays(start, -7), prevEnd: addDays(start, -1), unit: 'day', label: anchor === t ? 'Last 7 days' : `${shortDate(start)} – ${shortDate(anchor)}`, title: 'Day by day', name: anchor === t ? 'last 7 days' : `${shortDate(start)} – ${shortDate(anchor)}`, vs: 'the previous 7 days' };
  }
  const months = range === 'month' ? 1 : 12;
  const start = range === 'month' ? `${anchor.slice(0, 8)}01` : `${anchor.slice(0, 5)}01-01`;
  const last = addDays(addMonths(start, months), -1);
  const end = minDay(last, t);
  const prevStart = addMonths(start, -months);
  const prevEnd = minDay(addDays(prevStart, daysBetween(start, end) - 1), addDays(start, -1));
  const partial = end < last;
  if (range === 'month') {
    const prev = monthName(prevStart);
    return { start, end, prevStart, prevEnd, unit: 'day', label: localDate(start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), title: 'Day by day', name: monthName(start), vs: partial ? `the same days of ${prev}` : prev };
  }
  const year = start.slice(0, 4);
  const prev = prevStart.slice(0, 4);
  return { start, end, prevStart, prevEnd, unit: 'month', label: year, title: 'Month by month', name: year, vs: partial ? `this point in ${prev}` : prev };
}

/** Step the anchor one whole range back or forward, never past today. */
function stepAnchor(range: Range, anchor: string, dir: 1 | -1, t: string): string {
  const next = range === 'day' ? addDays(anchor, dir) : range === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, dir * (range === 'month' ? 1 : 12));
  return minDay(next, t);
}

/** One bar of the main chart (and one row of its table). */
interface Col {
  key: string;
  tick: string;
  /** Show the tick label (dense charts label every few bars). */
  showTick: boolean;
  long: string;
  bySource: Record<TimeSource, number>;
  overtimeMs: number;
  current: boolean;
}

/** "+1h 20m vs previous 7 days"; never coloured, it's information not a grade. Durations under a minute apart count as the same. */
function delta(cur: number, prev: number, fmt: (n: number) => string, vs: string): string | undefined {
  if (!prev) return undefined; // nothing to compare against yet
  const diff = cur - prev;
  if (fmt === formatDuration ? Math.abs(diff) < 60_000 : diff === 0) return `same as ${vs}`;
  return `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))} vs ${vs}`;
}

export function StatsScreen() {
  const settings = useSettings();
  const sources = settings.chartSources;
  const dailyGoalMs = settings.dailyGoalMs;
  const profileName = settings.profile.name;
  const [range, setRange] = useState<Range>('day');
  const [anchor, setAnchor] = useState(today);
  const [table, setTable] = useState(false);
  const [sharing, setSharing] = useState(false);
  const t = today();
  const period = useMemo(() => periodOf(range, anchor, t), [range, anchor, t]);
  const { start, end, prevStart, prevEnd, unit, vs } = period;
  const days = daysBetween(start, end);
  const isNow = end === t;
  const from = dayStart(start);
  const to = dayStart(addDays(end, 1));

  // Pomo's tour shows sample data here; otherwise this is the real notebook.
  const db = useViewDb();
  const k = `stats:${db.name}`;
  const both = useCachedLiveQuery(`${k}:daily:${prevStart}:${end}`, () => db.daily.where('day').between(prevStart, end, true, true).toArray(), [db, prevStart, end], []);
  const all = useCachedLiveQuery(`${k}:daily`, () => db.daily.toArray(), [db], []);
  const sessionsRaw = useCachedLiveQuery(`${k}:sessions:${start}:${end}`, () => db.sessions.where('end').above(from).filter((s) => !s.deleted && s.start < to).toArray(), [db, from, to], []);
  const boards = useCachedLiveQuery(`${k}:boards`, () => db.boards.toArray(), [db], []);
  const folders = useCachedLiveQuery(`${k}:folders`, () => db.folders.toArray(), [db], []);
  const tasks = useCachedLiveQuery(`${k}:tasks`, () => db.tasks.toArray(), [db], []);
  const stickers = useCachedLiveQuery(`${k}:stickers:${start}:${end}`, () => db.stickers.where('earnedAt').between(from, to).toArray(), [db, from, to], []);

  const toggleSource = (s: TimeSource) => {
    const next = sources.includes(s) ? sources.filter((x) => x !== s) : [...sources, s];
    if (next.length) void updateSettings({ chartSources: next });
  };

  // Everything below is pure in the query results; keep it off unrelated renders (sheets, toggles).
  const { cols, stats, prev, allTime, done, prevDone, colorOf, nameOf, periodDays, periods, slices, goal, snapshot, tree, weekGrid } = useMemo(() => {
    const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
    const buckets = bucketDays(dayList, unit === 'hour' ? 'day' : unit);
    const bucketIndex = new Map(buckets.flatMap((b, i) => b.days.map((d) => [d, i] as const)));
    const summaries = both.filter((s) => s.day >= start && s.day <= end);
    const prevSummaries = both.filter((s) => s.day >= prevStart && s.day <= prevEnd);
    const sessions = sessionsRaw.filter((s) => s.day >= start && s.day <= end);
    const byDay = new Map(summaries.map((s) => [s.day, s]));
    const stats = rangeStats(summaries, sources);
    const prev = rangeStats(prevSummaries, sources);
    const allTime = all.reduce((a, s) => a + focusFor(s, sources), 0);

    const nowHour = new Date().getHours();
    const dense = buckets.length > 10;
    const cols: Col[] =
      unit === 'hour'
        ? hourBySource(sessions, ALL_SOURCES).map((bySource, h) => ({
            key: String(h),
            tick: hourLabel(h).slice(0, -1),
            showTick: h % 3 === 0,
            long: `${hourLabel(h)} – ${hourLabel(h + 1)}`,
            bySource,
            overtimeMs: 0,
            current: start === t && h === nowHour,
          }))
        : buckets.map((b, i) => ({
            key: b.key,
            tick: unit === 'month' ? bucketLabel(b, unit) : dense ? String(Number(b.key.slice(8))) : localDate(b.key).toLocaleDateString(undefined, { weekday: 'narrow' }),
            showTick: unit === 'month' || !dense || i % 5 === 0 || i === buckets.length - 1,
            long: bucketLabel(b, unit, true),
            ...sumBucket(b, byDay),
            current: b.days.includes(t),
          }));

    const done = tasksDone(tasks, start, end);
    const prevDone = tasksDone(tasks, prevStart, prevEnd);
    const boardById = new Map(boards.map((b) => [b.id, b]));
    const colorOf = (id?: string) => (id ? boardById.get(id)?.color : undefined) ?? NO_SUBJECT_COLOR;
    const nameOf = (id?: string) => (id ? boardById.get(id)?.name : undefined) ?? 'No subject';
    const periodDays = dayList.slice(-31);
    const periods = focusPeriods(sessions, sources);
    const slices = topSlices(bySubject(sessions, sources).map((r) => ({ name: nameOf(r.boardId || undefined), color: colorOf(r.boardId || undefined), ms: r.ms })));
    const goal = goalDays(dayList, byDay, sources, dailyGoalMs);
    const hours = hourProfile(sessions, sources);
    const shape = sessionShape(sessions, sources);
    const rangeLabel =
      days === 1
        ? localDate(start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
        : `${shortDate(start)} – ${localDate(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const snapshot: StatsSnapshot = {
      name: profileName,
      rangeLabel,
      rangeName: period.name,
      vs,
      barsTitle: unit === 'hour' ? 'focus by hour' : unit === 'month' ? 'focus per month' : 'focus per day',
      totals: { focusMs: stats.totalMs, activeDays: stats.activeDays, totalDays: days, avgMs: stats.avgPerActiveDay, sessions: stats.sessions, tasksDone: done, prevFocusMs: prev.totalMs || undefined },
      bars: cols.map((c) => ({ label: c.tick, ms: ALL_SOURCES.reduce((a, s) => a + (sources.includes(s) ? c.bySource[s] : 0), 0) })),
      periods: periodDays.map((d) => ({ day: d, blocks: (periods.get(d) ?? []).map((p) => ({ from: p.from, to: p.to, color: colorOf(p.boardId) })) })),
      slices,
      goal: { goalMs: dailyGoalMs, days: goal },
      hours,
      shape,
      stickers: stickers.map((s) => s.id),
    };

    const tree = subjectTree(sessions, sources, { boards, folders, tasks, bucketOf: (d) => bucketIndex.get(d) ?? -1, buckets: buckets.length });
    const weekGrid = weekHourGrid(sessions, sources);
    return { cols, stats, prev, allTime, done, prevDone, colorOf, nameOf, periodDays, periods, slices, goal, snapshot, tree, weekGrid };
  }, [both, all, sessionsRaw, boards, folders, tasks, stickers, sources, period, days, start, end, prevStart, prevEnd, unit, vs, t, dailyGoalMs, profileName]);
  const { hours, shape } = snapshot;
  const oneDay = range === 'day';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* which stretch of time, stepped like the timeline; then what counts */}
      <div className="space-y-3" data-tour="stats-filters">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button className="btn-ghost !p-2" onClick={() => setAnchor(stepAnchor(range, anchor, -1, t))} aria-label="Earlier">
              <ChevronLeft size={20} />
            </button>
            <h2 className="min-w-[10ch] text-center font-display text-xl font-semibold">{period.label}</h2>
            <button className="btn-ghost !p-2" onClick={() => setAnchor(stepAnchor(range, anchor, 1, t))} aria-label="Later" disabled={isNow}>
              <ChevronRight size={20} />
            </button>
            {!isNow && (
              <button className="chip ml-1" onClick={() => setAnchor(t)}>
                Today
              </button>
            )}
          </div>
          <Segmented<Range> size="sm" value={range} onChange={setRange} options={RANGES} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink/45">counting</span>
          {ALL_SOURCES.map((s) => (
            <button key={s} className={cx('chip', sources.includes(s) && 'chip-on')} onClick={() => toggleSource(s)} title={SOURCE_LABEL[s]}>
              <span className="inline-block h-3 w-4 rounded-sm" style={TEXTURE[s]} />
              {SHORT[s]}
            </button>
          ))}
          <button className="btn-primary ml-auto !py-1.5 text-[13px]" onClick={() => setSharing(true)} data-tour="stats-share">
            <Share2 size={15} /> Share
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-tour="stats-tiles">
        <Tile big label={`focus, ${period.name}`} value={formatDuration(stats.totalMs)} sub={delta(stats.totalMs, prev.totalMs, formatDuration, vs)} />
        {oneDay ? (
          <Tile label="longest sitting" value={shape.longestMs ? formatDuration(shape.longestMs) : '—'} />
        ) : (
          <Tile label="per active day" value={formatDuration(stats.avgPerActiveDay)} sub={delta(stats.avgPerActiveDay, prev.avgPerActiveDay, formatDuration, vs)} />
        )}
        <Tile
          label="sessions"
          value={String(stats.sessions)}
          sub={[stats.overtimeMs ? `+${formatDuration(stats.overtimeMs)} flow overtime` : '', delta(stats.sessions, prev.sessions, String, vs)].filter(Boolean).join(' · ') || undefined}
        />
        {oneDay ? (
          <Tile label="of the daily goal" value={`${Math.round((goal[0]?.ratio ?? 0) * 100)}%`} sub={`${formatDuration(goal[0]?.ms ?? 0)} of ${formatDuration(dailyGoalMs)}`} />
        ) : (
          <Tile label="days focused" value={`${stats.activeDays}`} sub={`of ${days} days`} />
        )}
        <Tile label="tasks done" value={String(done)} sub={prevDone || done ? delta(done, prevDone, String, vs) : undefined} />
        <Tile label="pages filled, all time" value={String(pagesFilled(all))} sub={`${formatHours(allTime)} total`} />
      </div>

      <Section
        tour="stats-bars"
        title={period.title}
        aside={
          <button className="btn-ghost !p-2" onClick={() => setTable(!table)} aria-label={table ? 'Show chart' : 'Show table'} title={table ? 'Chart view' : 'Table view'}>
            {table ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        }
      >
        {table ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <BucketTable cols={cols} unit={unit} sources={sources} />
          </div>
        ) : (
          <BucketBars cols={cols} sources={sources} />
        )}
        <p className="mt-2 text-xs text-ink/50">Imported lumps and hand-added time are labelled, never judged. Toggle them above to see averages your way.</p>
      </Section>

      <Section tour="stats-periods" title="Focus periods" aside={days > 31 ? <span className="text-xs text-ink/45">last 31 days</span> : undefined}>
        <FocusPeriods days={periodDays} periods={periods} colorOf={colorOf} nameOf={nameOf} />
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section tour="stats-donut" title="Where the time went">
          <SubjectDonut slices={slices} />
        </Section>
        <Section tour="stats-goal" title="Daily goal" aside={<GoalPicker goalMs={settings.dailyGoalMs} onChange={(ms) => void updateSettings({ dailyGoalMs: ms })} />}>
          <GoalCalendar days={goal} goalMs={settings.dailyGoalMs} />
        </Section>
      </div>

      {/* One day's rhythm is already the hour chart above, so it only gets the session shape. */}
      <div className={cx('grid gap-4', !oneDay && 'md:grid-cols-2')}>
        {!oneDay && (
          <Section tour="stats-when" title="When you focus">
            <HourBars hours={hours} />
            <WeekHeatmap grid={weekGrid} />
          </Section>
        )}
        <Section tour="stats-shape" title="How sessions go">
          <ShapePanel shape={shape} />
        </Section>
      </div>

      <Section tour="stats-tree" title="By subject">
        {tree.length === 0 ? <p className="font-hand text-[20px] text-ink/45">nothing yet, and that's okay</p> : <SubjectTree nodes={tree} max={tree[0].ms} />}
      </Section>
      {sharing && <ShareStatsSheet snapshot={snapshot} onClose={() => setSharing(false)} />}
    </div>
  );
}

function Tile({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={cx('card p-4', big && 'col-span-2 bg-paper sm:col-span-1')}>
      <div className={cx('font-display font-semibold leading-none', big ? 'text-4xl' : 'text-2xl')}>{value}</div>
      <div className="mt-1 font-hand text-[17px] leading-tight text-ink/60">{label}</div>
      {sub && <div className="text-xs text-ink/45">{sub}</div>}
    </div>
  );
}

function bucketLabel(b: Bucket, unit: Exclude<Unit, 'hour'>, long = false): string {
  if (unit === 'day') return long ? formatDayLabel(b.key) : '';
  return localDate(`${b.key}-15`).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'narrow' });
}

function sumBucket(b: Bucket, byDay: Map<string, DailySummary>) {
  const bySource: Record<TimeSource, number> = { timed: 0, adjusted: 0, manual: 0, imported: 0 };
  let overtimeMs = 0;
  for (const d of b.days) {
    const s = byDay.get(d);
    if (!s) continue;
    for (const k of ALL_SOURCES) bySource[k] += s.bySource[k] ?? 0;
    overtimeMs += s.overtimeMs;
  }
  return { bySource, overtimeMs };
}

function BucketBars({ cols, sources }: { cols: Col[]; sources: TimeSource[] }) {
  const totals = cols.map((c) => ALL_SOURCES.reduce((a, k) => a + (sources.includes(k) ? c.bySource[k] : 0), 0));
  const max = Math.max(HOUR, ...totals);
  const best = Math.max(...totals);
  return (
    <div className="mb-6 flex h-48 items-end gap-[2px] border-b border-rule pb-0.5" role="img" aria-label="Focus over the range">
      {cols.map((c, i) => {
        const total = totals[i];
        return (
          <div key={c.key} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${c.long}: ${formatDuration(total)}`}>
            {total > 0 && (total === best || c.current) && <span className="mb-1 whitespace-nowrap text-[11px] font-bold text-ink/70">{total === best && <span className="text-[#E9B949]">★ </span>}{formatHours(total)}</span>}
            <div className="flex w-full max-w-[44px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] group-hover:brightness-110" style={{ height: `${(total / max) * 100}%` }}>
              {ALL_SOURCES.filter((s) => sources.includes(s) && c.bySource[s] > 0).map((s) => (
                <div key={s} style={{ ...TEXTURE[s], flexGrow: c.bySource[s] }} />
              ))}
            </div>
            <span className={cx('absolute -bottom-5 whitespace-nowrap text-[10px] font-bold', c.current ? 'text-tomato' : 'text-ink/45', !c.showTick && 'hidden')}>{c.tick}</span>
          </div>
        );
      })}
    </div>
  );
}

function BucketTable({ cols, unit, sources }: { cols: Col[]; unit: Unit; sources: TimeSource[] }) {
  const shown = ALL_SOURCES.filter((s) => sources.includes(s));
  const byHour = unit === 'hour';
  // An hour table is mostly empty rows, so it lists only the hours that hold something.
  const rows = [...cols].reverse().filter((c) => !byHour || shown.some((k) => c.bySource[k] > 0));
  if (!rows.length) return <p className="font-hand text-[20px] text-ink/45">a blank page, nothing to tabulate</p>;
  return (
    <table className="w-full min-w-[480px] text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-ink/50">
          <th className="py-1">{byHour ? 'Hour' : unit === 'day' ? 'Day' : 'Month'}</th>
          {shown.map((s) => (
            <th key={s}>{SHORT[s]}</th>
          ))}
          {!byHour && <th>Overtime</th>}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const total = shown.reduce((a, k) => a + c.bySource[k], 0);
          return (
            <tr key={c.key} className="border-t border-rule">
              <td className="py-1.5">{c.long}</td>
              {shown.map((x) => (
                <td key={x}>{c.bySource[x] ? formatDuration(c.bySource[x]) : '—'}</td>
              ))}
              {!byHour && <td>{c.overtimeMs ? formatDuration(c.overtimeMs) : '—'}</td>}
              <td className="font-bold">{total ? formatDuration(total) : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HourBars({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));
  if (hours.every((h) => h === 0)) return <p className="font-hand text-[20px] text-ink/45">your rhythm shows up after a few sessions</p>;
  return (
    <div>
      <p className="mb-2 font-hand text-[19px] text-ink/70">
        you focus most around <b className="text-tomato">{hourLabel(peak)}</b>
      </p>
      <div className="flex h-28 items-end gap-[2px] border-b border-rule">
        {hours.map((ms, h) => (
          <div key={h} className="flex h-full flex-1 items-end" title={`${hourLabel(h)}: ${formatDuration(ms)}`}>
            <div className="w-full rounded-t-[4px] bg-tomato hover:brightness-110" style={{ height: `${(ms / max) * 100}%`, minHeight: ms ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <HourAxis />
    </div>
  );
}

function HourAxis({ indent }: { indent?: boolean }) {
  return (
    <div className={cx('flex justify-between pt-1 text-[10px] font-bold text-ink/45', indent && 'pl-9')}>
      <span>12a</span>
      <span>6a</span>
      <span>12p</span>
      <span>6p</span>
      <span>12a</span>
    </div>
  );
}

/** Weekday × hour grid. Shade is sqrt-scaled so a single long evening doesn't wash the rest out. */
function WeekHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat());
  if (!max) return null;
  let peak = [0, 0];
  grid.forEach((row, w) => row.forEach((ms, h) => ms > grid[peak[0]][peak[1]] && (peak = [w, h])));
  const days = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const bestDay = days.indexOf(Math.max(...days));
  return (
    <div className="mt-5">
      <p className="mb-2 font-hand text-[19px] text-ink/70">
        fullest hour: <b className="text-tomato">{WEEKDAYS[peak[0]]} {hourLabel(peak[1])}</b> · fullest day: <b className="text-tomato">{WEEKDAYS[bestDay]}</b>
      </p>
      <div className="space-y-[2px]" role="img" aria-label="Focus by weekday and hour">
        {grid.map((row, w) => (
          <div key={w} className="flex items-center gap-[2px]">
            <span className="w-9 shrink-0 text-[10px] font-bold text-ink/45">{WEEKDAYS[w]}</span>
            {row.map((ms, h) => (
              <div
                key={h}
                className="aspect-square flex-1 rounded-[2px]"
                style={{ background: ms ? `rgb(var(--pm-tomato) / ${0.15 + 0.85 * Math.sqrt(ms / max)})` : 'rgb(var(--pm-rule) / 0.5)' }}
                title={`${WEEKDAYS[w]} ${hourLabel(h)}: ${ms ? formatDuration(ms) : 'nothing'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <HourAxis indent />
    </div>
  );
}

function ShapePanel({ shape }: { shape: SessionShape }) {
  if (!shape.count) return <p className="font-hand text-[20px] text-ink/45">a few sessions in, this fills in</p>;
  const ratio = shape.breakMs ? shape.focusMs / shape.breakMs : 0;
  const rows: Array<[string, string, string?]> = [];
  if (shape.targeted) {
    rows.push([
      'typical session',
      `${formatDuration(shape.medianActualMs)}`,
      shape.medianPlannedMs ? `of a planned ${formatDuration(shape.medianPlannedMs)}` : undefined,
    ]);
  }
  rows.push(['longest sitting', formatDuration(shape.longestMs)]);
  rows.push(['paused', shape.pausedPerHourMs >= 60_000 ? `${formatDuration(shape.pausedPerHourMs)}` : 'barely', shape.pausedPerHourMs >= 60_000 ? 'per focus hour' : undefined]);
  rows.push(['focus : rest', ratio ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} : 1` : 'no breaks logged', ratio ? `${formatDuration(shape.focusMs)} focus, ${formatDuration(shape.breakMs)} rest` : undefined]);
  return (
    <div>
      {shape.targeted > 0 && (
        <div className="mb-4">
          <p className="mb-2 font-hand text-[19px] text-ink/70">
            <b className="text-tomato">{shape.ranFull}</b> of {shape.targeted} ran to the bell
            {shape.wrappedEarly > 0 && <>, {shape.wrappedEarly} wrapped early</>}
          </p>
          <div className="flex h-3 overflow-hidden rounded-full" title={`${shape.ranFull} full, ${shape.wrappedEarly} early`}>
            <div className="bg-tomato" style={{ flexGrow: shape.ranFull }} />
            <div style={{ ...TEXTURE.manual, flexGrow: shape.wrappedEarly }} />
          </div>
          <p className="mt-1 text-xs text-ink/50">Done is done: stopping early is a choice, not a miss.</p>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v, note]) => (
          <div key={k} className="contents">
            <dt className="text-xs font-bold uppercase tracking-wide text-ink/45">{k}</dt>
            <dd>
              <span className="font-display font-semibold tabular">{v}</span>
              {note && <span className="ml-1.5 text-ink/55">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  if (values.length < 2 || !max) return <span className="w-14" />;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 56},${14 - (v / max) * 12}`).join(' ');
  return (
    <svg width="56" height="16" className="shrink-0 text-tomato" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SubjectTree({ nodes, max, depth = 0 }: { nodes: TreeNode[]; max: number; depth?: number }) {
  return (
    <ul className={cx(depth === 0 ? 'space-y-1' : 'mt-1 space-y-1')}>
      {nodes.map((n) => (
        <SubjectRow key={`${n.kind}:${n.id}`} node={n} max={max} depth={depth} />
      ))}
    </ul>
  );
}

function SubjectRow({ node: n, max, depth }: { node: TreeNode; max: number; depth: number }) {
  const [open, setOpen] = useState(false);
  const kids = n.children.length > 0;
  return (
    <li>
      <button
        type="button"
        disabled={!kids}
        onClick={() => setOpen(!open)}
        aria-expanded={kids ? open : undefined}
        className="grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 rounded-lg py-1 text-left text-sm hover:bg-halo/40 disabled:hover:bg-transparent sm:grid-cols-[minmax(0,12rem)_1fr_auto_auto]"
        title={`${n.name}: ${formatDuration(n.ms)} over ${n.sessions} session${n.sessions === 1 ? '' : 's'}`}
      >
        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
          <ChevronRight size={14} className={cx('shrink-0 text-ink/45 transition-transform', open && 'rotate-90', !kids && 'invisible')} />
          {n.kind === 'task' ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-ink/30" />
          ) : (
            <span className={cx('h-2.5 w-2.5 shrink-0', n.kind === 'folder' ? 'rounded-sm' : 'rounded-full')} style={{ background: n.color ?? 'rgb(var(--pm-rule))' }} />
          )}
          <span className={cx('truncate', n.kind === 'folder' && 'font-bold', n.kind === 'task' && 'text-ink/75')}>{n.name}</span>
        </span>
        <span className={cx('h-3 min-w-0 overflow-hidden rounded-r', n.kind === 'task' ? 'bg-tomato/50' : 'bg-tomato')} style={{ width: `${Math.min(100, (n.ms / max) * 100)}%`, minWidth: 4 }} />
        <span className="hidden sm:block">
          <Spark values={n.trend} />
        </span>
        <span className="font-display font-semibold tabular">{formatDuration(n.ms)}</span>
      </button>
      {open && kids && <SubjectTree nodes={n.children} max={max} depth={depth + 1} />}
    </li>
  );
}
