/**
 * Gentle analytics. No streaks, no "you missed a day". Charts are single-hue (tomato)
 * with *texture* telling time sources apart, so they read in colour-blind and print
 * contexts too; every bar has a tooltip and there's a table view.
 */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Table2, BarChart3 } from 'lucide-react';
import { db } from '@/db/schema';
import { updateSettings, useSettings } from '@/db/settings';
import { ALL_SOURCES, focusFor, hourProfile, pagesFilled, rangeStats, SOURCE_LABEL } from '@/engine/stats';
import { addDays, dayStart, DAY, formatDayLabel, formatDuration, formatHours, HOUR, today } from '@/engine/time';
import type { DailySummary, TimeSource } from '@/engine/types';
import { cx, Section } from '@/components/ui';

const TEXTURE: Record<TimeSource, React.CSSProperties> = {
  timed: { background: 'rgb(var(--pm-tomato))' },
  adjusted: { background: 'repeating-linear-gradient(135deg, rgb(var(--pm-tomato)) 0 3px, rgb(var(--pm-tomato) / 0.45) 3px 6px)' },
  manual: { background: 'rgb(var(--pm-tomato) / 0.12)', boxShadow: 'inset 0 0 0 1.5px rgb(var(--pm-tomato))' },
  imported: { background: 'radial-gradient(rgb(var(--pm-tomato)) 1.2px, rgb(var(--pm-tomato) / 0.25) 1.4px) 0 0 / 5px 5px' },
};
const SHORT: Record<TimeSource, string> = { timed: 'Timed', adjusted: 'Adjusted', manual: 'By hand', imported: 'Imported' };

export function StatsScreen() {
  const settings = useSettings();
  const sources = settings.chartSources;
  const [days, setDays] = useState<7 | 30>(7);
  const [table, setTable] = useState(false);
  const end = today();
  const start = addDays(end, -(days - 1));
  const range = Array.from({ length: days }, (_, i) => addDays(start, i));
  const summaries = useLiveQuery(() => db.daily.where('day').between(start, end, true, true).toArray(), [start, end], []);
  const all = useLiveQuery(() => db.daily.toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.where('end').above(dayStart(start)).filter((s) => !s.deleted).toArray(), [start], []);
  const boards = useLiveQuery(() => db.boards.toArray(), [], []);
  const byDay = new Map(summaries.map((s) => [s.day, s]));
  const stats = rangeStats(summaries, sources);
  const hours = hourProfile(sessions, sources);
  const allTime = all.reduce((a, s) => a + focusFor(s, sources), 0);

  const toggleSource = (s: TimeSource) => {
    const next = sources.includes(s) ? sources.filter((x) => x !== s) : [...sources, s];
    if (next.length) void updateSettings({ chartSources: next });
  };

  const subjects = new Map<string, number>();
  for (const s of sessions) {
    if (s.phase !== 'focus' || !sources.includes(s.source) || s.day < start) continue;
    const k = s.boardId ?? '';
    subjects.set(k, (subjects.get(k) ?? 0) + s.actualMs);
  }
  const subjectRows = [...subjects.entries()].sort((a, b) => b[1] - a[1]);
  const subjectMax = Math.max(1, ...subjects.values());

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* filters: one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-rule bg-sheet p-1">
          {([7, 30] as const).map((d) => (
            <button key={d} className={cx('pill px-3 py-1.5 text-[13px]', days === d ? 'bg-halo' : 'text-ink/60')} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
        <span className="ml-1 text-xs font-bold uppercase tracking-wide text-ink/45">counting</span>
        {ALL_SOURCES.map((s) => (
          <button key={s} className={cx('chip', sources.includes(s) && 'chip-on')} onClick={() => toggleSource(s)} title={SOURCE_LABEL[s]}>
            <span className="inline-block h-3 w-4 rounded-sm" style={TEXTURE[s]} />
            {SHORT[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile big label={`focus, last ${days} days`} value={formatDuration(stats.totalMs)} />
        <Tile label="per active day" value={formatDuration(stats.avgPerActiveDay)} />
        <Tile label="flow overtime" value={stats.overtimeMs ? `+${formatDuration(stats.overtimeMs)}` : '—'} />
        <Tile label="pages filled, all time" value={String(pagesFilled(all))} sub={`${formatHours(allTime)} total`} />
      </div>

      <Section
        title={days === 7 ? 'This week' : 'Last 30 days'}
        aside={
          <button className="btn-ghost !p-2" onClick={() => setTable(!table)} aria-label={table ? 'Show chart' : 'Show table'} title={table ? 'Chart view' : 'Table view'}>
            {table ? <BarChart3 size={16} /> : <Table2 size={16} />}
          </button>
        }
      >
        {table ? <DayTable range={range} byDay={byDay} sources={sources} /> : <DayBars range={range} byDay={byDay} sources={sources} />}
        <p className="mt-2 text-xs text-ink/50">Imported lumps and hand-added time are labelled, never judged. Toggle them above to see averages your way.</p>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="When you focus">
          <HourBars hours={hours} />
        </Section>
        <Section title="By subject">
          {subjectRows.length === 0 ? (
            <p className="font-hand text-2xl text-ink/45">nothing yet, and that's okay</p>
          ) : (
            <ul className="space-y-2">
              {subjectRows.map(([id, ms]) => {
                const b = boards.find((x) => x.id === id);
                return (
                  <li key={id} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-sm" title={`${b?.name ?? 'No subject'}: ${formatDuration(ms)}`}>
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b?.color ?? 'rgb(var(--pm-rule))' }} />
                      {b?.name ?? 'No subject'}
                    </span>
                    <span className="h-3 rounded-r bg-tomato" style={{ width: `${(ms / subjectMax) * 100}%`, minWidth: 4 }} />
                    <span className="font-display font-semibold tabular">{formatDuration(ms)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={cx('card p-4', big && 'col-span-2 bg-paper sm:col-span-1')}>
      <div className={cx('font-display font-semibold leading-none', big ? 'text-4xl' : 'text-2xl')}>{value}</div>
      <div className="mt-1 font-hand text-[20px] leading-tight text-ink/60">{label}</div>
      {sub && <div className="text-xs text-ink/45">{sub}</div>}
    </div>
  );
}

function DayBars({ range, byDay, sources }: { range: string[]; byDay: Map<string, DailySummary>; sources: TimeSource[] }) {
  const totals = range.map((d) => (byDay.get(d) ? focusFor(byDay.get(d)!, sources) : 0));
  const max = Math.max(HOUR, ...totals);
  const best = Math.max(...totals);
  const dense = range.length > 10;
  return (
    <div className="mb-6 flex h-48 items-end gap-[2px] border-b border-rule pb-0.5" role="img" aria-label="Focus per day">
      {range.map((d, i) => {
        const sum = byDay.get(d);
        const t = totals[i];
        return (
          <div key={d} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${formatDayLabel(d)}: ${formatDuration(t)}`}>
            {t > 0 && (t === best || d === today()) && <span className="mb-1 text-[11px] font-bold text-ink/70">{formatHours(t)}</span>}
            <div className="flex w-full max-w-[44px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px] group-hover:brightness-110" style={{ height: `${(t / max) * 100}%` }}>
              {sum &&
                ALL_SOURCES.filter((s) => sources.includes(s) && sum.bySource[s] > 0).map((s) => (
                  <div key={s} style={{ ...TEXTURE[s], flexGrow: sum.bySource[s] }} />
                ))}
            </div>
            <span className={cx('absolute -bottom-5 text-[10px] font-bold text-ink/45', dense && i % 5 !== 0 && i !== range.length - 1 && 'hidden')}>
              {dense ? Number(d.slice(8)) : new Date(dayStart(d) + DAY / 2).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DayTable({ range, byDay, sources }: { range: string[]; byDay: Map<string, DailySummary>; sources: TimeSource[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-ink/50">
          <th className="py-1">Day</th>
          {ALL_SOURCES.filter((s) => sources.includes(s)).map((s) => (
            <th key={s}>{SHORT[s]}</th>
          ))}
          <th>Overtime</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {[...range].reverse().map((d) => {
          const s = byDay.get(d);
          return (
            <tr key={d} className="border-t border-rule">
              <td className="py-1.5">{formatDayLabel(d)}</td>
              {ALL_SOURCES.filter((x) => sources.includes(x)).map((x) => (
                <td key={x}>{s?.bySource[x] ? formatDuration(s.bySource[x]) : '—'}</td>
              ))}
              <td>{s?.overtimeMs ? formatDuration(s.overtimeMs) : '—'}</td>
              <td className="font-bold">{s ? formatDuration(focusFor(s, sources)) : '—'}</td>
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
  const label = (h: number) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);
  if (hours.every((h) => h === 0)) return <p className="font-hand text-2xl text-ink/45">your rhythm shows up after a few sessions</p>;
  return (
    <div>
      <p className="mb-2 font-hand text-[22px] text-ink/70">
        you focus most around <b className="text-tomato">{label(peak)}</b>
      </p>
      <div className="flex h-28 items-end gap-[2px] border-b border-rule">
        {hours.map((ms, h) => (
          <div key={h} className="flex h-full flex-1 items-end" title={`${label(h)}: ${formatDuration(ms)}`}>
            <div className="w-full rounded-t-[4px] bg-tomato hover:brightness-110" style={{ height: `${(ms / max) * 100}%`, minHeight: ms ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between pt-1 text-[10px] font-bold text-ink/45">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>12a</span>
      </div>
    </div>
  );
}
