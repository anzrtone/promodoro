/**
 * PromodoroCard — the main timer, drawn as a sticky note taped to a notebook page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, Coffee, FastForward, Flame, History, MoreHorizontal, Pause, Play, Trash2, Volume2 } from 'lucide-react';
import { db } from '@/db/schema';
import { updateSettings, useSettings } from '@/db/settings';
import { phaseLabel, isBreak } from '@/engine/cycle';
import { formatClock, formatDuration, formatTimeOfDay, MINUTE } from '@/engine/time';
import { lastSessionEnd } from '@/engine/timeline';
import { nextAlarmAt } from '@/engine/timer';
import type { ModeChoice, TimerSnapshot, TimerState } from '@/engine/types';
import { usePromodoroEngine, engine } from '@/hooks/usePromodoroEngine';
import { award } from '@/features/stickers';
import { SOUNDS, soundName } from '@/audio/catalog';
import { unlockAudio } from '@/audio/engine';
import { Pomo, POMO_LINES, type PomoMood } from './Pomo';
import { cx, Segmented, Sheet, Stepper } from './ui';

const MODE_OPTIONS: Array<{ value: ModeChoice; label: string; title: string }> = [
  { value: 'countdown', label: 'Countdown', title: 'Stops at zero' },
  { value: 'overtime', label: 'Gentle Flow', title: 'Rings at zero, then keeps counting your overtime' },
  { value: 'countup', label: 'Count up', title: 'Open-ended, no limit' },
];

function moodFor(t: TimerState | undefined, snap: TimerSnapshot | null, cheering: boolean): PomoMood {
  if (cheering) return 'cheering';
  if (!t || !snap) return 'happy';
  if (t.status === 'paused') return 'puzzled';
  if (isBreak(t.phase)) return 'sleepy';
  if (snap.inOvertime) return 'flow';
  return 'focused';
}

export function PromodoroCard({ compact = false }: { compact?: boolean }) {
  const { primary, primarySnap, now, cheerAt, ringing } = usePromodoroEngine();
  const settings = useSettings();
  const cheering = now - cheerAt < 6000;
  const mood = moodFor(primary, primarySnap, cheering);
  const [line, setLine] = useState<string | null>(null);
  const pokes = useRef<number[]>([]);
  const [pokeMood, setPokeMood] = useState<PomoMood | null>(null);

  const say = (m: PomoMood) => {
    const lines = POMO_LINES[m];
    setLine(lines[Math.floor(Math.random() * lines.length)]);
  };
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), 3800);
    return () => clearTimeout(t);
  }, [line]);
  useEffect(() => {
    if (settings.pomoTalks && primary) say(mood);
    // speak on phase/state changes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary?.id, primary?.status, primarySnap?.inOvertime]);

  const onPoke = () => {
    unlockAudio();
    const t = Date.now();
    pokes.current = [...pokes.current.filter((x) => t - x < 3000), t];
    if (pokes.current.length >= 7) {
      pokes.current = [];
      setPokeMood('frustrated');
      say('frustrated');
      void award('pomo-poke');
      setTimeout(() => setPokeMood(null), 2600);
    } else if (settings.pomoTalks) say(mood);
  };

  return (
    <div className={cx('sticky-note relative mx-auto w-full', compact ? 'p-3' : 'max-w-[560px] px-5 pb-6 pt-7 sm:px-8')}>
      {!compact && <div className="washi" />}
      <div className={cx('flex flex-col items-center', compact ? 'gap-1' : 'gap-3')}>
        {primary && <PhaseRow t={primary} compact={compact} />}
        <div className="relative">
          <Pomo
            mood={pokeMood ?? mood}
            size={compact ? 76 : 184}
            accessory={settings.accessory}
            progress={primarySnap?.progress ?? 0}
            onClick={onPoke}
          />
          {line && !compact && (
            <div className="absolute left-full top-2 z-10 ml-1 w-max max-w-[170px] max-sm:left-[62%] max-sm:top-[54%] max-sm:ml-0 max-sm:max-w-[132px]">
              <div className="rounded-note border border-rule bg-sheet px-3 py-2 font-hand text-[22px] leading-tight shadow-note animate-pop max-sm:text-[18px]">{line}</div>
            </div>
          )}
        </div>
        {primary && primarySnap ? <RunningPanel t={primary} snap={primarySnap} compact={compact} ringing={ringing} /> : <StartPanel compact={compact} />}
      </div>
    </div>
  );
}

function PhaseRow({ t, compact }: { t: TimerState; compact: boolean }) {
  const settings = useSettings();
  const preset = useLiveQuery(() => (t.presetId ? db.presets.get(t.presetId) : undefined), [t.presetId]);
  const board = useLiveQuery(() => (t.boardId ? db.boards.get(t.boardId) : undefined), [t.boardId]);
  const focus = t.phase === 'focus';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className={cx('pill px-3 py-1.5 text-[13px] text-white', focus ? 'bg-tomato' : 'bg-leaf')}>
        {focus ? '● ' : '☕ '}
        {phaseLabel(t.phase)}
        {focus && preset && t.round ? ` · round ${t.round} of ${preset.rounds}` : ''}
      </span>
      {board && !compact && (
        <span className="pill border border-rule bg-sheet px-3 py-1.5 text-[13px]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: board.color }} />
          {board.name}
        </span>
      )}
      {t.label && t.label !== board?.name && !compact && <span className="font-hand text-2xl">{t.label}</span>}
      {t.auto && !compact && settings.autoAdvance && <span className="text-xs text-ink/50">auto-started</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RunningPanel({ t, snap, compact, ringing }: { t: TimerState; snap: TimerSnapshot; compact: boolean; ringing: boolean }) {
  const [more, setMore] = useState(false);
  const [goal, setGoal] = useState(false);
  const paused = t.status === 'paused';
  const brk = isBreak(t.phase);
  const hasTarget = snap.targetMs > 0;
  const reached = hasTarget && snap.totalMs >= snap.targetMs;

  const big = hasTarget ? (snap.inOvertime ? `+${formatClock(snap.overtimeMs)}` : formatClock(snap.remainingMs, { ceil: true })) : formatClock(snap.totalMs);
  const alarmAt = nextAlarmAt(t);

  let sub: string;
  if (snap.inOvertime) sub = `${formatClock(snap.targetMs)} planned + ${formatClock(snap.overtimeMs)} overtime`;
  else if (!hasTarget) sub = `counting up since ${formatTimeOfDay(t.createdAt)}`;
  else if (paused) sub = `paused · ${formatDuration(snap.totalMs)} so far`;
  else if (alarmAt) sub = `rings around ${formatTimeOfDay(alarmAt)}${t.overtime ? ', then I keep counting' : ''}`;
  else sub = `${formatDuration(snap.totalMs)} of ${formatDuration(snap.targetMs)}`;
  if (t.mode === 'countup' && hasTarget && !snap.inOvertime) sub = `${formatClock(snap.totalMs)} · goal ${formatDuration(snap.targetMs)}`;
  const recovered = snap.recoveredMs > 0 ? `incl. ${formatDuration(snap.recoveredMs)} recovered` : null;

  const onOvertime = () => {
    if (t.mode === 'countdown') void engine.overtime(t.id, !t.overtime);
    else if (t.overtime) void engine.overtime(t.id, false);
    else setGoal(true);
  };

  return (
    <>
      <div className={cx('relative text-center', snap.inOvertime && 'rounded-card bg-halo/50 px-4')}>
        <div
          className={cx('font-display font-semibold leading-none tabular', compact ? 'text-5xl' : 'text-[clamp(64px,17vw,104px)]', paused && 'opacity-60')}
          aria-live="off"
        >
          {big}
        </div>
        <div className={cx('font-hand text-ink/70', compact ? 'text-lg' : 'mt-1 text-[24px]')}>{sub}</div>
        {recovered && !compact && <div className="text-xs text-ink/50">{recovered}</div>}
      </div>

      {hasTarget && !compact && <InkProgress value={snap.progress} overtime={snap.inOvertime} rest={brk} />}

      {ringing && (
        <button className="btn-soft animate-wiggle" onClick={() => engine.silence()}>
          <Volume2 size={16} /> Silence alarm
        </button>
      )}

      {!compact && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button className="chip" onClick={() => engine.nudge(t.id, 1)} disabled={!hasTarget && t.mode === 'countdown'}>
            +1 min
          </button>
          <button className="chip" onClick={() => engine.nudge(t.id, 5)} disabled={!hasTarget && t.mode === 'countdown'}>
            +5 min
          </button>
          <button className={cx('chip', t.overtime && 'chip-on')} onClick={onOvertime} title={t.mode === 'countdown' ? "Don't stop at zero" : 'Set a soft goal; time past it is overtime'}>
            <Flame size={14} /> {t.mode === 'countdown' ? (t.overtime ? 'Overtime on' : 'Overtime') : t.overtime ? `Goal ${formatDuration(snap.targetMs)}` : 'Overtime goal'}
          </button>
          <button className="chip" onClick={() => setMore(true)} aria-label="More">
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        {(reached || snap.inOvertime) && t.phase === 'focus' ? (
          <button className="btn-rest" onClick={() => void engine.done(t.id)}>
            <Coffee size={18} /> Take a break
          </button>
        ) : (
          <button className={brk ? 'btn-rest' : 'btn-primary'} onClick={() => (paused ? engine.resume(t.id) : engine.pause(t.id))}>
            {paused ? <Play size={18} /> : <Pause size={18} />} {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button className="btn-soft" onClick={() => void engine.done(t.id)}>
          <Check size={18} /> {brk ? 'Skip break' : 'Done'}
        </button>
      </div>

      <MoreSheet t={t} open={more} onClose={() => setMore(false)} />
      <GoalSheet t={t} snap={snap} open={goal} onClose={() => setGoal(false)} />
    </>
  );
}

/** A hand-inked progress line: tomato while focusing, leaf while resting, halo in overtime. */
function InkProgress({ value, overtime, rest }: { value: number; overtime: boolean; rest: boolean }) {
  const color = overtime ? '#E9C85C' : rest ? 'rgb(var(--pm-leaf))' : 'rgb(var(--pm-tomato))';
  return (
    <svg viewBox="0 0 300 14" className="h-3.5 w-full max-w-[360px]" preserveAspectRatio="none" aria-hidden>
      <path d="M4 7 Q 40 3 75 7 T 150 7 T 225 7 T 296 7" fill="none" stroke="rgb(var(--pm-rule))" strokeWidth={6} strokeLinecap="round" />
      <path
        d="M4 7 Q 40 3 75 7 T 150 7 T 225 7 T 296 7"
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${Math.max(0.001, value)} 1`}
        style={{ transition: 'stroke-dasharray 900ms linear' }}
      />
    </svg>
  );
}

function MoreSheet({ t, open, onClose }: { t: TimerState; open: boolean; onClose: () => void }) {
  const [custom, setCustom] = useState(15);
  const [confirm, setConfirm] = useState(false);
  const forward = (m: number) => {
    void engine.backfill(t.id, m);
    void award('found-time');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="This session">
      <div className="space-y-5">
        <div>
          <p className="label flex items-center gap-1.5">
            <FastForward size={13} /> Turn the clock forward
          </p>
          <p className="mb-2 text-sm text-ink/65">Worked before you hit start? Add it here. It's saved as recovered time, never hidden.</p>
          <div className="flex flex-wrap items-center gap-2">
            {[5, 10, 20, 30].map((m) => (
              <button key={m} className="chip" onClick={() => forward(m)}>
                +{m} min
              </button>
            ))}
            <Stepper value={custom} onChange={setCustom} step={5} suffix="m" />
            <button className="btn-soft !py-2" onClick={() => forward(custom)}>
              Add
            </button>
          </div>
        </div>
        <p className="text-sm text-ink/60">
          Rings with <b>{soundName(t.soundId)}</b>. Change it per subject in Settings → Subjects, or the default in Settings → Sounds.
        </p>
        <div className="border-t border-rule pt-4">
          {confirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">Throw this one away? (It stays in the log.)</span>
              <button
                className="btn-soft !border-tomato !text-tomato"
                onClick={() => {
                  void engine.discard(t.id);
                  onClose();
                }}
              >
                Discard
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(false)}>
                Keep it
              </button>
            </div>
          ) : (
            <button className="btn-ghost !text-ink/60" onClick={() => setConfirm(true)}>
              <Trash2 size={15} /> Discard session
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function GoalSheet({ t, snap, open, onClose }: { t: TimerState; snap: TimerSnapshot; open: boolean; onClose: () => void }) {
  const elapsedMin = Math.floor(snap.totalMs / MINUTE);
  const goals = [25, 30, 45, 60, 90, 120].filter((g) => g > elapsedMin).slice(0, 4);
  const pick = (min?: number) => {
    void engine.overtime(t.id, true, min);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Set a soft goal">
      <p className="mb-3 text-sm text-ink/65">I'll chime gently when you reach it and highlight everything after as overtime. Nothing stops.</p>
      <div className="flex flex-wrap gap-2">
        {goals.map((g) => (
          <button key={g} className="chip" onClick={() => pick(g)}>
            {g} min
          </button>
        ))}
        <button className="chip chip-on" onClick={() => pick()}>
          From now on
        </button>
      </div>
    </Sheet>
  );
}

export function SoundSelect({ value, onChange, disabled, allowDefault }: { value?: string; onChange: (v: string | undefined) => void; disabled?: boolean; allowDefault?: boolean }) {
  return (
    <div className="relative">
      <select className="field appearance-none pr-8" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || undefined)}>
        {allowDefault && <option value="">App default</option>}
        {SOUNDS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.hint}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3 text-ink/50" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StartPanel({ compact }: { compact: boolean }) {
  const settings = useSettings();
  const presets = useLiveQuery(() => db.presets.orderBy('order').toArray(), [], []);
  const boards = useLiveQuery(() => db.boards.orderBy('order').filter((b) => !b.archived).toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.filter((t) => !t.done).toArray(), [], []);
  const preset = presets.find((p) => p.id === settings.presetId) ?? presets[0];
  const [minutes, setMinutes] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<string | undefined>();
  const mins = minutes ?? preset?.focusMin ?? 25;
  const mode = settings.defaultMode;

  const start = (backdateMin?: number) => {
    unlockAudio();
    void engine.startFocus({ minutes: mins, mode, backdateMin, taskId, label: tasks.find((x) => x.id === taskId)?.title });
    setMinutes(null);
    setTaskId(undefined);
    if (backdateMin) void award('found-time');
  };

  if (compact)
    return (
      <button className="btn-primary" onClick={() => start()}>
        <Play size={16} /> Focus {mode === 'countup' ? '' : `${mins}m`}
      </button>
    );

  return (
    <>
      <Segmented value={mode} options={MODE_OPTIONS} onChange={(v) => void updateSettings({ defaultMode: v })} size="sm" />

      <div className="flex items-center gap-4">
        {mode !== 'countup' && (
          <button className="pill h-11 w-11 border border-rule bg-sheet text-xl" onClick={() => setMinutes(Math.max(1, mins - 5))} aria-label="5 minutes less">
            −
          </button>
        )}
        <div className="text-center">
          <div className="font-display text-[clamp(64px,17vw,104px)] font-semibold leading-none tabular">{mode === 'countup' ? '00:00' : formatClock(mins * MINUTE)}</div>
          <div className="font-hand text-[22px] text-ink/60">
            {mode === 'countup' ? 'open-ended: stop whenever' : mode === 'overtime' ? 'chimes at zero, keeps counting your flow' : 'stops at zero'}
          </div>
        </div>
        {mode !== 'countup' && (
          <button className="pill h-11 w-11 border border-rule bg-sheet text-xl" onClick={() => setMinutes(Math.min(600, mins + 5))} aria-label="5 minutes more">
            +
          </button>
        )}
      </div>

      <div className="no-scrollbar -mx-2 flex max-w-full gap-2 overflow-x-auto px-2 pb-1">
        {presets.map((p) => (
          <button
            key={p.id}
            className={cx('chip shrink-0', p.id === settings.presetId && minutes === null && 'chip-on')}
            onClick={() => {
              setMinutes(null);
              void updateSettings({ presetId: p.id, round: 1 });
            }}
          >
            {p.focusMin}/{p.shortMin}
            <span className="text-ink/50">· {p.name.replace(/\s*\d+\s*\/\s*\d+$/, '')}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button className={cx('chip', !settings.boardId && 'chip-on')} onClick={() => void updateSettings({ boardId: null })}>
          No subject
        </button>
        {boards.map((b) => (
          <button key={b.id} className={cx('chip', settings.boardId === b.id && 'chip-on')} onClick={() => void updateSettings({ boardId: b.id })}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
            {b.name}
          </button>
        ))}
      </div>

      {tasks.length > 0 && (
        <div className="relative w-full max-w-xs">
          <select className="field appearance-none pr-8 font-hand !text-[22px] !leading-6" value={taskId ?? ''} onChange={(e) => setTaskId(e.target.value || undefined)}>
            <option value="">✎ link a task (optional)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-ink/50" />
        </div>
      )}

      <button className="btn-primary !px-8 !py-4 !text-lg" onClick={() => start()}>
        <Play size={20} fill="currentColor" /> Start focus{mode === 'countup' ? '' : ` (${mins}m)`}
      </button>

      <ForgotChips onPick={start} />
    </>
  );
}

/** "Forgot to start?" — one tap backdates the start. The fastest recovery there is. */
function ForgotChips({ onPick }: { onPick: (min: number) => void }) {
  const last = useLiveQuery(async () => lastSessionEnd(await db.sessions.where('end').above(Date.now() - 6 * 3600_000).toArray()), []);
  const sinceMin = useMemo(() => (last ? Math.round((Date.now() - last.end) / MINUTE) : 0), [last]);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex items-center gap-1 font-hand text-[21px] text-ink/55">
        <History size={14} /> forgot to start? I started…
      </span>
      <div className="flex flex-wrap justify-center gap-2">
        {[10, 20, 30].map((m) => (
          <button key={m} className="chip" onClick={() => onPick(m)}>
            {m} min ago
          </button>
        ))}
        {last && sinceMin >= 3 && sinceMin <= 180 && (
          <button className="chip" onClick={() => onPick(sinceMin)} title="Backdate to the end of your last session">
            when my last session ended ({formatTimeOfDay(last.end)})
          </button>
        )}
      </div>
    </div>
  );
}
