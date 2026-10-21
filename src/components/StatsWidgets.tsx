/**
 * Calendar-style stats widgets: when in the day you focused, where the time went, and the
 * daily-goal rings. Goal rings only ever fill up; an empty day is just an empty ring.
 */
import type { Period } from '@/engine/stats';
import { addDays, dayStart, DAY, formatDuration, HOUR, MINUTE, weekStart } from '@/engine/time';
import { cx } from './ui';

const localDate = (day: string) => new Date(dayStart(day) + DAY / 2);
const shortDate = (day: string) => localDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const NO_SUBJECT_COLOR = 'rgb(var(--pm-ink) / 0.35)';

function DayAxis({ indent }: { indent: string }) {
  return (
    <div className={cx('flex justify-between pt-1 text-[10px] font-bold text-ink/45', indent)}>
      <span>12a</span>
      <span>6a</span>
      <span>12p</span>
      <span>6p</span>
      <span>12a</span>
    </div>
  );
}

/** One row per day, blocks placed by time of day and coloured by subject. */
export function FocusPeriods({ days, periods, colorOf, nameOf }: { days: string[]; periods: Map<string, Period[]>; colorOf: (boardId?: string) => string; nameOf: (boardId?: string) => string }) {
  const tall = days.length <= 7;
  if (!days.some((d) => periods.get(d)?.length)) return <p className="font-hand text-[20px] text-ink/45">your days show up here as you focus</p>;
  return (
    <div>
      <div className="space-y-[3px]" role="img" aria-label="Focus blocks by day and time of day">
        {days.map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right text-[10px] font-bold text-ink/45">
              {tall ? localDate(d).toLocaleDateString(undefined, { weekday: 'short' }) : Number(d.slice(8)) === 1 || d === days[0] ? shortDate(d) : Number(d.slice(8))}
            </span>
            <div
              className="relative flex-1 overflow-hidden rounded-[3px]"
              style={{
                height: tall ? 22 : 10,
                background: 'repeating-linear-gradient(90deg, rgb(var(--pm-rule) / 0.45) 0 1px, transparent 1px 25%), rgb(var(--pm-paper))',
              }}
            >
              {(periods.get(d) ?? []).map((p, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 rounded-[2px]"
                  style={{ left: `${(p.from / 1440) * 100}%`, width: `max(2px, ${((p.to - p.from) / 1440) * 100}%)`, background: colorOf(p.boardId) }}
                  title={`${shortDate(d)} · ${nameOf(p.boardId)} · ${fmtMin(p.from)}–${fmtMin(p.to)}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <DayAxis indent="pl-14" />
    </div>
  );
}

function fmtMin(m: number) {
  const d = new Date(2000, 0, 1, 0, Math.round(m));
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export interface SubjectSlice {
  name: string;
  color: string;
  ms: number;
}

/** Top subjects (the rest folded into "other"), so the donut stays legible. */
export function topSlices(rows: SubjectSlice[], n = 6): SubjectSlice[] {
  if (rows.length <= n) return rows;
  const rest = rows.slice(n - 1).reduce((a, r) => a + r.ms, 0);
  return [...rows.slice(0, n - 1), { name: 'Everything else', color: 'rgb(var(--pm-ink) / 0.25)', ms: rest }];
}

export function SubjectDonut({ slices }: { slices: SubjectSlice[] }) {
  const total = slices.reduce((a, s) => a + s.ms, 0);
  if (!total) return <p className="font-hand text-[20px] text-ink/45">nothing yet, and that's okay</p>;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Share of focus by subject">
        <g transform="rotate(-90 70 70)">
          {slices.map((s) => {
            const len = (s.ms / total) * C;
            const el = <circle key={s.name} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="20" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </g>
        <text x="70" y="76" textAnchor="middle" className="fill-current font-display text-[17px] font-semibold">
          {formatDuration(total)}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.name} title={`${s.name}: ${formatDuration(s.ms)}`}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="text-xs text-ink/50 tabular">{Math.round((s.ms / total) * 100)}%</span>
              <span className="w-16 text-right font-display font-semibold tabular">{formatDuration(s.ms)}</span>
            </div>
            <div className="ml-[18px] mt-1 h-1.5 rounded-full" style={{ width: `${(s.ms / slices[0].ms) * 100}%`, background: s.color, minWidth: 4 }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export const GOAL_CHOICES = [30, 60, 90, 120, 180, 240, 300, 360, 480].map((m) => m * MINUTE);

export function GoalPicker({ goalMs, onChange }: { goalMs: number; onChange: (ms: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/45">
      goal
      <select className="field !w-auto !py-1 !text-[13px] normal-case" value={goalMs} onChange={(e) => onChange(Number(e.target.value))}>
        {(GOAL_CHOICES.includes(goalMs) ? GOAL_CHOICES : [...GOAL_CHOICES, goalMs].sort((a, b) => a - b)).map((ms) => (
          <option key={ms} value={ms}>
            {formatDuration(ms)} a day
          </option>
        ))}
      </select>
    </label>
  );
}

function Ring({ ratio, label, size = 40 }: { ratio: number; label: string; size?: number }) {
  const r = size / 2 - 3;
  const C = 2 * Math.PI * r;
  const met = ratio >= 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill={met ? 'rgb(var(--pm-tomato) / 0.14)' : 'none'} stroke="rgb(var(--pm-rule))" strokeWidth="3.5" />
      {ratio > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--pm-tomato))"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, ratio) * C} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className={cx('font-display text-[11px] font-semibold', ratio ? 'fill-current' : 'fill-current opacity-30')}>
        {label}
      </text>
    </svg>
  );
}

const hoursLabel = (ms: number) => (ms ? (ms / HOUR >= 10 ? String(Math.round(ms / HOUR)) : (ms / HOUR).toFixed(1)) : '0');

/**
 * Up to five weeks: a Monday-first calendar of rings (hours inside). Longer ranges get a
 * compact week-column grid so a whole year still fits.
 */
export function GoalCalendar({ days, goalMs }: { days: Array<{ day: string; ms: number; ratio: number }>; goalMs: number }) {
  const met = days.filter((d) => d.ratio >= 1).length;
  const summary = (
    <p className="mb-3 font-hand text-[19px] text-ink/70">
      goal reached on <b className="text-tomato">{met}</b> of {days.length} days
      <span className="text-ink/45"> · {formatDuration(goalMs)} a day</span>
    </p>
  );
  const first = days[0]?.day;
  if (!first) return null;
  const lead = (localDate(first).getDay() + 6) % 7;

  if (days.length <= 35) {
    return (
      <div>
        {summary}
        <div className="grid grid-cols-7 gap-1 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
            <span key={i} className="text-[10px] font-bold text-ink/45">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {days.map((d) => (
            <div key={d.day} className="flex justify-center" title={`${shortDate(d.day)}: ${formatDuration(d.ms)} of ${formatDuration(goalMs)}`}>
              <Ring ratio={d.ratio} label={hoursLabel(d.ms)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Compact: one column per week, rows Mon..Sun.
  const weeks: Array<Array<(typeof days)[number] | null>> = [];
  let w0 = weekStart(first);
  const byDay = new Map(days.map((d) => [d.day, d]));
  while (w0 <= days[days.length - 1].day) {
    weeks.push(Array.from({ length: 7 }, (_, i) => byDay.get(addDays(w0, i)) ?? null));
    w0 = addDays(w0, 7);
  }
  return (
    <div>
      {summary}
      <div className="flex gap-[2px] overflow-hidden" role="img" aria-label="Daily goal progress">
        {weeks.map((wk, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[2px]">
            {wk.map((d, j) => (
              <div
                key={j}
                className="aspect-square rounded-full"
                style={{
                  background: !d ? 'transparent' : d.ratio >= 1 ? 'rgb(var(--pm-tomato))' : d.ratio > 0 ? `rgb(var(--pm-tomato) / ${0.15 + 0.5 * d.ratio})` : 'rgb(var(--pm-rule) / 0.6)',
                }}
                title={d ? `${shortDate(d.day)}: ${formatDuration(d.ms)}` : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
