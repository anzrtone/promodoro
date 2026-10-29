/**
 * History timeline: an activity map of every logged moment.
 *  Day   — sessions along the hours, overlapping timers stacked in lanes, unlogged gaps
 *          drawn as dashed blocks with memory anchors; drag across a gap to claim it.
 *  Week  — days as rows, time of day as columns, to reveal patterns.
 *  Month — a heat map of focus per day.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useCachedLiveQuery } from '@/hooks/useCachedLiveQuery';
import { ChevronLeft, ChevronRight, Minus, Plus, Share2 } from 'lucide-react';
import { useViewDb } from '@/features/demo';
import { useSettings } from '@/db/settings';
import { focusFor, SOURCE_LABEL } from '@/engine/stats';
import { addDays, dayStart, DAY, formatDayLabel, formatDuration, formatHours, formatTimeOfDay, HOUR, MINUTE, today, weekStart } from '@/engine/time';
import { assignLanes, attachAnchors, findGaps, snap, type Gap } from '@/engine/timeline';
import { snapshot } from '@/engine/timer';
import type { Board, Session, TimerState } from '@/engine/types';
import { usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { navigate, useNav } from '@/features/nav';
import { ClaimSheet, SessionDetail, type ClaimDraft } from '@/components/SessionEditor';
import { ShareDaySheet } from '@/components/DayPage';
import { cx, Empty, Segmented, SourceDot } from '@/components/ui';

type View = 'day' | 'week' | 'month';

export function TimelineScreen() {
  const nav = useNav();
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(nav.day ?? today());
  const [manual, setManual] = useState<ClaimDraft | null>(null);
  const [share, setShare] = useState(false);
  useEffect(() => {
    if (nav.day) setDay(nav.day);
  }, [nav.day]);

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour="timeline-nav">
        <div className="flex items-center gap-1">
          <button className="btn-ghost !p-2" onClick={() => setDay(addDays(day, -step))} aria-label="Earlier">
            <ChevronLeft size={20} />
          </button>
          <h2 className="min-w-[10ch] text-center font-display text-xl font-semibold">
            {view === 'day' ? formatDayLabel(day) : view === 'week' ? `Week of ${formatDayLabel(weekStart(day))}` : monthLabel(day)}
          </h2>
          <button className="btn-ghost !p-2" onClick={() => setDay(addDays(day, step))} aria-label="Later" disabled={day >= today()}>
            <ChevronRight size={20} />
          </button>
          {day !== today() && (
            <button className="chip ml-1" onClick={() => setDay(today())}>
              Today
            </button>
          )}
        </div>
        <Segmented<View>
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </div>

      {view === 'day' && <DayView day={day} />}
      {view === 'week' && (
        <WeekView
          start={weekStart(day)}
          onPick={(d) => {
            setDay(d);
            setView('day');
          }}
        />
      )}
      {view === 'month' && (
        <MonthView
          day={day}
          onPick={(d) => {
            setDay(d);
            setView('day');
          }}
        />
      )}

      <div className="flex flex-wrap gap-2" data-tour="timeline-actions">
        <button className="btn-soft" onClick={() => setManual({ start: dayStart(day) + 9 * HOUR, end: dayStart(day) + 9 * HOUR + 25 * MINUTE })}>
          <Plus size={16} /> Add a past session
        </button>
        <button className="btn-soft" onClick={() => setShare(true)}>
          <Share2 size={16} /> Share this page
        </button>
        <button className="btn-ghost" onClick={() => navigate('settings', { settingsSection: 'data' })}>
          Import history…
        </button>
      </div>

      <ClaimSheet draft={manual} mode="entry" onClose={() => setManual(null)} />
      {share && <ShareDaySheet day={day} onClose={() => setShare(false)} />}
    </div>
  );
}

const monthLabel = (day: string) => {
  const [y, m] = day.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

/* ------------------------------------------------------------------ */

interface Block {
  id: string;
  start: number;
  end: number;
  session?: Session;
  live?: TimerState;
}

function useDayData(day: string) {
  const db = useViewDb();
  const from = dayStart(day);
  const to = from + DAY;
  const sessions = useCachedLiveQuery(
    `tl:${db.name}:day:${day}`,
    () => db.sessions.where('end').above(from).filter((s) => s.start < to && !s.deleted && !s.bulk).toArray(),
    [db, from, to],
    [],
  );
  const bulk = useCachedLiveQuery(`tl:${db.name}:bulk:${day}`, () => db.sessions.where('day').equals(day).filter((s) => !!s.bulk && !s.deleted).toArray(), [db, day], []);
  const events = useCachedLiveQuery(`tl:${db.name}:events:${day}`, () => db.events.where('ts').between(from, to).toArray(), [db, from, to], []);
  const boards = useCachedLiveQuery(`tl:${db.name}:boards`, () => db.boards.toArray(), [db], []);
  return { from, to, sessions, bulk, events, boards };
}

function DayView({ day }: { day: string }) {
  const { from, to, sessions, bulk, events, boards } = useDayData(day);
  const { timers, now } = usePromodoroEngine();
  const isToday = day === today();
  const [zoom, setZoom] = useState(() => (window.innerWidth < 640 ? 84 : 120)); // px per hour
  const [detail, setDetail] = useState<Session | null>(null);
  const [claim, setClaim] = useState<ClaimDraft | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number; gap?: Gap } | null>(null);
  const [joggersOpen, setJoggersOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const live: Block[] = isToday
    ? timers.map((t) => ({ id: t.id, start: t.createdAt - snapshot(t, now).recoveredMs, end: now, live: t }))
    : [];
  const blocks: Block[] = [...sessions.map((s) => ({ id: s.id, start: s.start, end: s.end, session: s })), ...live];
  const { rows, lanes } = assignLanes(blocks);
  const gaps = useMemo(
    () => attachAnchors(findGaps(blocks.filter((b) => b.session?.phase !== 'side' && b.live?.phase !== 'side'), { start: from, end: to }, { now: isToday ? now : undefined }), events, formatTimeOfDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, events, isToday, Math.floor(now / MINUTE), timers.length],
  );
  const boardMap = new Map(boards.map((b) => [b.id, b]));

  const LANE_H = 46;
  const TOP = 26;
  const height = TOP + Math.max(1, lanes) * (LANE_H + 6) + 26;
  const width = 24 * zoom;
  const x = (t: number) => ((t - from) / HOUR) * zoom;
  const tAt = (px: number) => from + (px / zoom) * HOUR;

  // Scroll to the interesting part of the day: "now" today, else the first session.
  const firstStart = sessions.length ? Math.min(...sessions.map((x) => x.start)) : undefined;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focusT = isToday ? now : Math.max(from, firstStart ?? from + 8 * HOUR);
    el.scrollLeft = Math.max(0, x(focusT) - el.clientWidth * (isToday ? 0.7 : 0.15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, zoom, firstStart]);

  const pointerT = (e: RPointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return tAt(e.clientX - rect.left);
  };
  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return;
    const t = pointerT(e);
    const gap = gaps.find((g) => t >= g.start && t <= g.end);
    if (!gap) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const a = Math.min(Math.max(snap(t), gap.start), gap.end);
    setDrag({ a, b: a, gap });
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag?.gap) return;
    const t = Math.min(Math.max(snap(pointerT(e)), drag.gap.start), drag.gap.end);
    setDrag({ ...drag, b: t });
  };
  const onUp = () => {
    if (!drag?.gap) return setDrag(null);
    const [a, b] = drag.a <= drag.b ? [drag.a, drag.b] : [drag.b, drag.a];
    // A tap (no real drag) claims the whole gap.
    setClaim(b - a < 5 * MINUTE ? { start: drag.gap.start, end: drag.gap.end } : { start: a, end: b });
    setDrag(null);
  };

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden" data-tour="timeline-day">
        <div className="flex items-center justify-between border-b border-rule px-4 py-2" data-tour="timeline-claim">
          <span className="font-hand text-[19px] text-ink/60">drag across a dashed gap to claim it</span>
          <div className="flex items-center gap-1">
            <button className="btn-ghost !p-1.5" onClick={() => setZoom((z) => Math.max(40, z / 1.4))} aria-label="Zoom out">
              <Minus size={16} />
            </button>
            <button className="btn-ghost !p-1.5" onClick={() => setZoom((z) => Math.min(600, z * 1.4))} aria-label="Zoom in">
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div ref={scroller} className="overflow-x-auto overscroll-x-contain bg-creme">
          <div
            className="relative touch-pan-x select-none"
            style={{ width, height }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
          >
            {/* hour rules */}
            {Array.from({ length: 25 }, (_, h) => (
              <div key={h} className="absolute bottom-0 top-0 border-l border-rule" style={{ left: h * zoom }}>
                <span className="absolute left-1 top-1 text-[11px] font-bold text-ink/45">{hourLabel(h)}</span>
              </div>
            ))}
            {/* gaps */}
            {gaps.map((g) => (
              <div
                key={g.start}
                className="absolute rounded-note border-2 border-dashed border-ink/25 bg-sheet/50 hover:bg-halo/30 active:bg-halo/40"
                // touch-action:none lets pointer capture work on mobile without the browser
                // stealing the gesture as a horizontal scroll (the parent has touch-pan-x).
                style={{ left: x(g.start), width: Math.max(4, x(g.end) - x(g.start)), top: TOP - 6, height: LANE_H + 12, touchAction: 'none' }}
                title={g.anchors.map((a) => a.text).join('\n') || 'Unlogged time'}
              >
                {x(g.end) - x(g.start) > 70 && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-hand text-[16px] text-ink/50">
                    unlogged {formatDuration(g.end - g.start)}
                  </span>
                )}
                {g.anchors.map((a) => (
                  <span key={a.ts} className="pointer-events-none absolute -bottom-2 h-3 w-0.5 rounded bg-halo ring-1 ring-[#E9C85C]" style={{ left: x(a.ts) - x(g.start) }} />
                ))}
              </div>
            ))}
            {/* drag selection */}
            {drag && drag.b !== drag.a && (
              <div
                className="pointer-events-none absolute rounded-note border-2 border-tomato bg-tomato/20"
                style={{ left: x(Math.min(drag.a, drag.b)), width: Math.abs(x(drag.b) - x(drag.a)), top: TOP - 2, height: LANE_H + 4 }}
              >
                <span className="absolute -top-6 left-0 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-xs text-creme">
                  {formatTimeOfDay(Math.min(drag.a, drag.b))} – {formatTimeOfDay(Math.max(drag.a, drag.b))}
                </span>
              </div>
            )}
            {/* sessions */}
            {rows.map(({ item, lane }) => (
              <TimelineBlock
                key={item.id}
                b={item}
                left={x(Math.max(item.start, from))}
                width={Math.max(6, x(Math.min(item.end, to)) - x(Math.max(item.start, from)))}
                top={TOP + lane * (LANE_H + 6)}
                h={LANE_H}
                board={item.session?.boardId ? boardMap.get(item.session.boardId) : undefined}
                onClick={() => item.session && setDetail(item.session)}
                zoom={zoom}
              />
            ))}
            {isToday && (
              <div className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-tomato" style={{ left: x(now) }}>
                <span className="absolute -left-3 bottom-1 rounded-full bg-tomato px-1.5 text-[10px] font-bold text-white">now</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Legend />

      {gaps.some((g) => g.anchors.length) && (
        <div className="sticky-note p-3">
          <button
            type="button"
            aria-expanded={joggersOpen}
            onClick={() => setJoggersOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left font-display text-sm font-semibold"
          >
            <span>
              Memory joggers{' '}
              <span className="font-normal text-ink/50">({gaps.flatMap((g) => g.anchors).length})</span>
            </span>
            <span aria-hidden className={cx('text-ink/50 transition-transform duration-300', joggersOpen && 'rotate-180')}>▼</span>
          </button>
          <div
            className={cx('overflow-hidden transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none', joggersOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0')}
            aria-hidden={!joggersOpen}
          >
            <div className="mt-1 max-h-64 overflow-y-auto">
                {gaps.flatMap((g) => g.anchors).map((a) => (
                  <p key={a.ts} className="font-hand text-[18px] leading-6 text-ink/70">
                    · {a.text}
                  </p>
                ))}
            </div>
          </div>
        </div>
      )}

      <DayList sessions={[...sessions, ...bulk]} onOpen={setDetail} />

      <SessionDetail session={detail} onClose={() => setDetail(null)} />
      <ClaimSheet draft={claim} mode="claim" onClose={() => setClaim(null)} />
    </div>
  );
}

const hourLabel = (h: number) => (h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);

function TimelineBlock({ b, left, width, top, h, board, onClick, zoom }: { b: Block; left: number; width: number; top: number; h: number; board?: Board; onClick: () => void; zoom: number }) {
  const s = b.session;
  const phase = s?.phase ?? b.live?.phase ?? 'focus';
  const source = s?.source ?? 'timed';
  const brk = phase === 'short' || phase === 'long';
  const side = phase === 'side';
  const base = side ? 'bg-rule text-ink' : brk ? 'bg-leaf text-white' : 'bg-tomato text-white';
  const styled =
    source === 'manual'
      ? cx('border-2 border-dashed', brk ? 'border-leaf bg-leaf/15 text-ink' : 'border-tomato bg-tomato/15 text-ink')
      : source === 'imported'
        ? 'bg-halo text-ink ring-1 ring-[#E9C85C]'
        : base;
  const dur = b.end - b.start;
  const recoveredPx = s && source === 'adjusted' ? (s.recoveredMs / HOUR) * zoom : 0;
  const overtimePx = s?.overtimeMs ? (s.overtimeMs / HOUR) * zoom : 0;
  const title = `${s?.label ?? board?.name ?? (brk ? 'Break' : side ? 'Side timer' : 'Focus')} · ${formatDuration(s?.actualMs ?? dur)}`;
  return (
    <button
      data-block
      onClick={onClick}
      className={cx('absolute overflow-hidden rounded-note text-left shadow-note transition hover:brightness-105', styled, b.live && 'animate-breathe ring-2 ring-halo')}
      style={{ left, width, top: side ? top + h / 2 : top, height: side ? h / 2 : h }}
      title={`${title}\n${SOURCE_LABEL[source]}`}
    >
      {recoveredPx > 0 && (
        <span
          className="absolute bottom-0 left-0 top-0"
          style={{ width: recoveredPx, backgroundImage: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.45) 0 4px, transparent 4px 8px)' }}
          title="recovered time"
        />
      )}
      {overtimePx > 0 && <span className="absolute bottom-0 right-0 top-0 bg-halo/80" style={{ width: Math.min(width, overtimePx) }} title="overtime" />}
      {board && <span className="absolute left-0 top-0 h-full w-1" style={{ background: board.color }} />}
      {width > 46 && (
        <span className="relative block truncate px-2 pt-1 text-[12px] font-bold leading-tight">
          {s?.label ?? board?.name ?? (brk ? 'Break' : side ? b.live?.label ?? 'Timer' : 'Focus')}
          <span className="block font-normal opacity-80">{formatDuration(s?.actualMs ?? dur)}</span>
        </span>
      )}
    </button>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cx('inline-block h-3 w-5 rounded', cls)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
      {item('bg-tomato', 'timed focus')}
      {item('bg-tomato bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.5)_0_3px,transparent_3px_6px)]', 'recovered')}
      {item('bg-halo', 'overtime / imported')}
      {item('border-2 border-dashed border-tomato', 'added by hand')}
      {item('bg-leaf', 'break')}
      {item('border-2 border-dashed border-ink/25', 'unlogged')}
    </div>
  );
}

function DayList({ sessions, onOpen }: { sessions: Session[]; onOpen: (s: Session) => void }) {
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  const focus = sorted.filter((s) => s.phase === 'focus').reduce((a, s) => a + s.actualMs, 0);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-rule px-4 py-2">
        <h3 className="font-display font-semibold">The page</h3>
        <span className="font-hand text-[19px] text-tomato">{formatDuration(focus)} focused</span>
      </div>
      {sorted.length === 0 ? (
        <Empty>A blank page. Ready for whatever today holds.</Empty>
      ) : (
        <ul className="bg-notebook [--pm-line:40px] [--pm-margin-x:64px]">
          {sorted.map((s) => (
            <li key={s.id}>
              <button className="flex h-10 w-full items-center gap-3 pl-3 pr-4 text-left hover:bg-halo/20" onClick={() => onOpen(s)}>
                <span className="w-[52px] shrink-0 text-[12px] font-bold text-ink/50">{s.bulk ? 'lump' : formatTimeOfDay(s.start)}</span>
                <SourceDot source={s.source} rest={s.phase === 'short' || s.phase === 'long'} />
                <span className="flex-1 truncate font-hand text-[20px] leading-none">
                  {s.label ?? (s.phase === 'focus' ? 'Focus' : s.phase === 'side' ? 'Side timer' : 'Break')}
                  {s.note && <span className="text-ink/50"> · {s.note}</span>}
                </span>
                {s.overtimeMs > 0 && <span className="rounded-full bg-halo px-2 text-xs font-bold">+{formatDuration(s.overtimeMs)}</span>}
                <span className="font-display text-sm font-semibold">{formatDuration(s.actualMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WeekView({ start, onPick }: { start: string; onPick: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = dayStart(start);
  const to = dayStart(addDays(start, 7));
  const db = useViewDb();
  const sessions = useCachedLiveQuery(`tl:${db.name}:week:${start}`, () => db.sessions.where('end').above(from).filter((s) => s.start < to && !s.deleted && !s.bulk && s.phase !== 'side').toArray(), [db, from, to], []);
  const settings = useSettings();
  return (
    <div className="card overflow-x-auto p-3">
      <div className="min-w-[640px]">
        <div className="ml-[84px] flex text-[11px] font-bold text-ink/45">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1">
              {h % 3 === 0 ? hourLabel(h) : ''}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const ds = dayStart(d);
          const mine = sessions.filter((s) => s.end > ds && s.start < ds + DAY);
          const total = mine.filter((s) => s.phase === 'focus' && settings.chartSources.includes(s.source)).reduce((a, s) => a + s.actualMs, 0);
          return (
            <button key={d} className="flex h-9 w-full items-center gap-2 rounded hover:bg-halo/20" onClick={() => onPick(d)}>
              <span className="w-[76px] shrink-0 text-left text-xs">
                <b>{new Date(ds).toLocaleDateString(undefined, { weekday: 'short' })}</b> <span className="text-ink/50">{total ? formatHours(total) : ''}</span>
              </span>
              <span className="relative h-6 flex-1 rounded bg-creme bg-[linear-gradient(90deg,rgb(var(--pm-rule))_1px,transparent_1px)] bg-[length:calc(100%/24)_100%]">
                {mine.map((s) => (
                  <span
                    key={s.id}
                    className={cx('absolute top-0.5 bottom-0.5 rounded-sm', s.phase === 'focus' ? (s.source === 'manual' ? 'border border-dashed border-tomato bg-tomato/20' : s.source === 'imported' ? 'bg-halo' : 'bg-tomato') : 'bg-leaf/70')}
                    style={{ left: `${(Math.max(0, s.start - ds) / DAY) * 100}%`, width: `${Math.max(0.3, ((Math.min(ds + DAY, s.end) - Math.max(ds, s.start)) / DAY) * 100)}%` }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ day, onPick }: { day: string; onPick: (d: string) => void }) {
  const settings = useSettings();
  const first = day.slice(0, 8) + '01';
  const gridStart = weekStart(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const db = useViewDb();
  const summaries = useCachedLiveQuery(`tl:${db.name}:month:${cells[0]}`, () => db.daily.where('day').between(cells[0], cells[41], true, true).toArray(), [db, cells[0]], []);
  const byDay = new Map(summaries.map((s) => [s.day, focusFor(s, settings.chartSources)]));
  const max = Math.max(HOUR, ...byDay.values());
  const month = first.slice(0, 7);
  return (
    <div className="card p-4">
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-ink/45">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d) => {
          const ms = byDay.get(d) ?? 0;
          const k = ms / max;
          const inMonth = d.startsWith(month);
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              disabled={d > today()}
              className={cx('relative aspect-square rounded-note border border-rule text-left transition hover:ring-2 hover:ring-halo', !inMonth && 'opacity-35')}
              style={{ background: ms ? `rgb(var(--pm-tomato) / ${0.15 + k * 0.8})` : undefined }}
              title={ms ? `${d}: ${formatDuration(ms)}` : d}
            >
              <span className={cx('absolute left-1.5 top-1 text-[11px] font-bold', k > 0.55 ? 'text-white' : 'text-ink/60')}>{Number(d.slice(8))}</span>
              {ms > 0 && <span className={cx('absolute bottom-1 right-1.5 font-hand text-[14px]', k > 0.55 ? 'text-white' : 'text-ink/70')}>{formatHours(ms)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
