/**
 * Focus mode: just the session. Big time inside an inked ring,
 * what you're working on, and Pause / Done. Controls fade after a few quiet seconds and come
 * back on any touch. Breaks get the leaf palette; Flow (overtime) fills the
 * ring green and keeps counting. Leaving is always one tap and never punished.
 */
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, Coffee, Lock, LockOpen, Minimize2, Pause, Play, Volume2 } from 'lucide-react';
import { db } from '@/db/schema';
import { append } from '@/db/repo';
import { useSettings } from '@/db/settings';
import { isBreak, phaseLabel } from '@/engine/cycle';
import { formatClock, formatDuration, formatTimeOfDay, uid, DAY, MINUTE } from '@/engine/time';
import { nextAlarmAt, snapshot, type PendingEvent } from '@/engine/timer';
import type { Task, TimerSnapshot, TimerState } from '@/engine/types';
import { engine, usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { holdWakeLock, setFocusMode, useFocusMode } from '@/features/focusMode';
import { Pomo, POMO_LINES } from './Pomo';
import { cx } from './ui';

const IDLE_MS = 5000;
const LOCK_KEY = 'promodoro.ringLocked';

function useRingLock(idle: boolean): [boolean, () => void] {
  const [manual, setManual] = useState(() => {
    try {
      return localStorage.getItem(LOCK_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setManual((m) => {
      const next = !m;
      try {
        localStorage.setItem(LOCK_KEY, next ? '1' : '0');
      } catch {
        /* remembering the lock is a convenience */
      }
      return next;
    });
  // Auto-lock whenever the UI goes idle; stays locked until the user explicitly unlocks.
  return [manual || idle, toggle];
}

export function FocusMode() {
  const open = useFocusMode();
  const { primary, primarySnap, wrap, ringing } = usePromodoroEngine();

  // Nothing left to show (session over and its sheet closed): step back to the notebook. A short
  // grace period, because "Start break" clears the sheet a beat before the break timer exists.
  useEffect(() => {
    if (!open || primary || wrap) return;
    const id = setTimeout(() => setFocusMode(false), 800);
    return () => clearTimeout(id);
  }, [open, primary, wrap]);

  useEffect(() => (open ? holdWakeLock() : undefined), [open]);

  // Esc / Android back leave focus mode, unless a sheet on top is handling it.
  useEffect(() => {
    if (!open) return;
    const dialog = () => !!document.querySelector('[role="dialog"]');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !dialog() && setFocusMode(false);
    const onBack = (e: Event) => {
      if (dialog()) return;
      e.preventDefault();
      setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('promodoro:back', onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('promodoro:back', onBack);
    };
  }, [open]);

  if (!open) return null;
  // Between sessions the "session complete" sheet sits on a quiet backdrop, so starting the break flows straight back in.
  if (!primary || !primarySnap)
    return (
      <div className="fixed inset-0 z-[35] flex flex-col items-center justify-center gap-3 bg-creme" role={wrap ? undefined : 'status'} aria-hidden={wrap ? true : undefined}>
        {!wrap && (
          <>
            <Pomo mood="happy" size={88} />
            <p className="flex items-baseline gap-1 font-hand text-[22px] text-ink/60">
              wrapping up
              <span className="inline-flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="animate-bounce" style={{ animationDelay: `${i * 150}ms` }}>.</span>
                ))}
              </span>
            </p>
          </>
        )}
      </div>
    );
  return <FocusView t={primary} snap={primarySnap} ringing={ringing} />;
}

function useIdle(active: boolean): [boolean, () => void] {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const wake = () => {
    setIdle(false);
    clearTimeout(timer.current);
    if (active) timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return [idle && active, wake];
}

function FocusView({ t, snap, ringing }: { t: TimerState; snap: TimerSnapshot; ringing: boolean }) {
  const paused = t.status === 'paused';
  const brk = isBreak(t.phase);
  const hasTarget = snap.targetMs > 0;
  // idle must be computed before locked so auto-lock can read it.
  const [idle, wake] = useIdle(!paused && !ringing);
  const [locked, toggleLock] = useRingLock(idle);
  const scrub = useRingScrub(t, snap, hasTarget && !locked);
  const scrubbing = scrub.remaining !== null;
  const flow = snap.inOvertime && !scrubbing;
  const [line] = useState(() => {
    const lines = POMO_LINES[brk ? 'sleepy' : 'focused'];
    return lines[Math.floor(Math.random() * lines.length)];
  });

  const remainingMs = scrub.remaining ?? snap.remainingMs;
  const big = hasTarget ? (flow ? `+${formatClock(snap.overtimeMs)}` : formatClock(remainingMs, { ceil: true })) : formatClock(snap.totalMs);
  const alarmAt = nextAlarmAt(t);
  let sub: string;
  if (scrubbing) sub = paused ? 'release to set' : `until ${formatTimeOfDay(Date.now() + remainingMs)}`;
  else if (paused) sub = `paused · ${formatDuration(snap.totalMs)} so far`;
  else if (flow) sub = `in flow ✦ ${formatDuration(snap.targetMs)} planned`;
  else if (!hasTarget) sub = `counting up since ${formatTimeOfDay(t.createdAt)}`;
  else if (brk) sub = line;
  else if (alarmAt) sub = `until ${formatTimeOfDay(alarmAt)}`;
  else sub = `${formatDuration(snap.totalMs)} of ${formatDuration(snap.targetMs)}`;

  // Ring: tomato while focusing, leaf on breaks, and a full leaf ring once you're in Flow.
  const color = brk || flow ? 'rgb(var(--pm-leaf))' : 'rgb(var(--pm-tomato))';
  const value = scrubbing ? Math.max(0, 1 - remainingMs / snap.targetMs) : flow || !hasTarget ? 1 : Math.min(1, snap.progress);
  const R = 88;
  const C = 2 * Math.PI * R;
  const fade = cx('transition-opacity duration-700', idle && 'pointer-events-none opacity-0');

  return (
    <div
      className={cx('fixed inset-0 z-[35] flex flex-col items-center bg-creme safe-pt safe-pb', idle && 'cursor-none')}
      onPointerMove={wake}
      onPointerDown={wake}
      onKeyDown={wake}
      role="region"
      aria-label="Focus mode"
    >
      {/* soft wash in the phase colour so a glance tells focus from rest */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 42%, ${brk || flow ? 'rgb(var(--pm-leaf) / 0.10)' : 'rgb(var(--pm-tomato) / 0.08)'}, transparent 65%)` }} />

      <header className={cx('relative flex w-full max-w-3xl items-center justify-between px-4 pt-3', fade)}>
        <button className="btn-ghost !p-2" onClick={() => setFocusMode(false)} aria-label="Leave focus mode" title="Leave focus mode (Esc)">
          <Minimize2 size={20} />
        </button>
        <PhasePill t={t} />
        <span className="w-10" />
      </header>

      <main className="relative flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4">
        <div
          className="group relative outline-none"
          style={{ width: 'min(82vw, 52vh, 440px)', containerType: 'inline-size' }}
          onWheel={scrub.onWheel}
          onKeyDown={scrub.onKeyDown}
          tabIndex={scrub.enabled ? 0 : -1}
          role={scrub.enabled ? 'slider' : undefined}
          aria-label={scrub.enabled ? 'Time remaining: arrow keys or scroll to adjust' : undefined}
          aria-valuemin={scrub.enabled ? 0 : undefined}
          aria-valuemax={scrub.enabled ? Math.round(snap.targetMs / MINUTE) : undefined}
          aria-valuenow={scrub.enabled ? Math.round(remainingMs / MINUTE) : undefined}
          aria-valuetext={scrub.enabled ? `${formatDuration(remainingMs)} left` : undefined}
        >
          <svg ref={scrub.svg} viewBox="0 0 200 200" className="block w-full">
            {/* dial ticks, like a kitchen timer */}
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * Math.PI * 2;
              const r1 = 99;
              const r2 = i % 5 === 0 ? 94 : 96.5;
              return (
                <line
                  key={i}
                  x1={100 + r1 * Math.sin(a)}
                  y1={100 - r1 * Math.cos(a)}
                  x2={100 + r2 * Math.sin(a)}
                  y2={100 - r2 * Math.cos(a)}
                  stroke="rgb(var(--pm-ink) / 0.18)"
                  strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--pm-rule))" strokeWidth="9" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.001, value) * C} ${C}`}
              transform="rotate(-90 100 100)"
              opacity={paused ? 0.45 : 1}
              style={{ transition: scrubbing ? 'none' : 'stroke-dasharray 900ms linear, stroke 600ms' }}
            />
            {scrub.enabled && (
              <circle
                cx={100 + R * Math.sin(value * Math.PI * 2)}
                cy={100 - R * Math.cos(value * Math.PI * 2)}
                r="6.5"
                fill="rgb(var(--pm-creme))"
                stroke={color}
                strokeWidth="3"
                className="pointer-events-none"
              />
            )}
            {/* wide invisible band to grab: drag it round like a dial */}
            {scrub.enabled && (
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="transparent"
                strokeWidth="26"
                pointerEvents="stroke"
                className={scrubbing ? 'cursor-grabbing' : 'cursor-grab'}
                style={{ touchAction: 'none' }}
                onPointerDown={scrub.onPointerDown}
                onPointerMove={scrub.onPointerMove}
                onPointerUp={scrub.onPointerUp}
                onPointerCancel={scrub.onPointerUp}
              />
            )}
            {flow && <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--pm-leaf))" strokeWidth="18" opacity="0.14" />}
          </svg>


          {hasTarget && (
            <button
              className="btn-ghost absolute -right-2 -top-2 !p-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={toggleLock}
              aria-pressed={locked}
              aria-label={locked ? 'Unlock the ring so you can drag it' : 'Lock the ring so it cannot be dragged'}
              title={locked ? 'Unlock the ring (drag or scroll it to adjust the time)' : 'Lock the ring'}
            >
              {locked ? <Lock size={18} /> : <LockOpen size={18} />}
            </button>
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div
              className={cx('font-display font-semibold leading-none tabular', paused && 'opacity-50', flow && 'text-leaf')}
              // Sized to the ring, not the window, and smaller for longer strings ("+00:05", "1:05:09"), so it never touches the rim.
              style={{ fontSize: `${Math.min(24, 118 / big.length)}cqw` }}
              aria-live="off"
            >
              {big}
            </div>
            <div className="mt-2 max-w-[80%] font-hand text-[clamp(14px,5cqw,22px)] leading-tight text-ink/65">{sub}</div>
          </div>
        </div>

        <WorkingOn t={t} />
      </main>

      <footer className={cx('relative flex w-full flex-col items-center gap-3 px-4 pb-8 pt-2', fade)}>
        {ringing && (
          <button className="btn-soft animate-wiggle" onClick={() => engine.silence()}>
            <Volume2 size={16} /> Silence alarm
          </button>
        )}
        {hasTarget && !brk && (
          <div className="flex gap-2">
            <button className="chip" onClick={() => engine.nudge(t.id, 1)}>
              +1 min
            </button>
            <button className="chip" onClick={() => engine.nudge(t.id, 5)}>
              +5 min
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          {flow && t.phase === 'focus' ? (
            <button className="btn-rest !px-7 !py-3.5 !text-lg" onClick={() => void engine.done(t.id)}>
              <Coffee size={20} /> Take a break
            </button>
          ) : (
            <button className={cx(brk ? 'btn-rest' : 'btn-primary', '!px-7 !py-3.5 !text-lg')} onClick={() => (paused ? engine.resume(t.id) : engine.pause(t.id))}>
              {paused ? <Play size={20} /> : <Pause size={20} />} {paused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button className="btn-soft !px-6 !py-3.5 !text-lg" onClick={() => void engine.done(t.id)}>
            <Check size={20} /> {brk ? 'Skip break' : 'Done'}
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Dragging, scrolling or arrow-keying the ring moves elapsed time (a signed `timer.adjust`), which
 * is how "remaining" changes. While a gesture is in flight the number shown is a local preview; the
 * log is written once, when the gesture settles.
 */
function useRingScrub(t: TimerState, snap: TimerSnapshot, enabled: boolean) {
  const svg = useRef<SVGSVGElement>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const latest = useRef<number | null>(null);
  const frac = useRef(0);
  const dragging = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const target = snap.targetMs;
  // Whole minutes on a normal session, 5 s on a very short one; never all the way to zero (that would end it).
  const step = target >= 10 * MINUTE ? MINUTE : 5000;
  const clamp = (ms: number) => Math.min(target, Math.max(step, Math.round(ms / step) * step));

  const preview = (ms: number) => {
    latest.current = ms;
    setRemaining(ms);
  };
  const commit = () => {
    clearTimeout(settle.current);
    const ms = latest.current;
    latest.current = null;
    if (ms === null) return;
    const cur = engine.primary();
    const delta = cur && cur.id === t.id ? snapshot(cur, Date.now()).remainingMs - ms : 0;
    if (Math.abs(delta) < 1000) return setRemaining(null);
    void engine.adjust(t.id, delta).finally(() => setRemaining(null));
  };
  const commitSoon = () => {
    clearTimeout(settle.current);
    settle.current = setTimeout(commit, 450);
  };
  useEffect(() => () => clearTimeout(settle.current), []);

  const fracOf = (e: RPointerEvent<SVGCircleElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    return (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2);
  };
  const move = (f: number) => {
    // Crossing 12 o'clock pins to the end instead of wrapping round to the other side.
    if (Math.abs(f - frac.current) > 0.5) f = frac.current > 0.5 ? 1 : 0;
    frac.current = f;
    preview(clamp((1 - f) * target));
  };
  const base = () => latest.current ?? snap.remainingMs;

  return {
    svg,
    remaining,
    enabled,
    onPointerDown(e: RPointerEvent<SVGCircleElement>) {
      if (!enabled || e.button > 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = true;
      // Grabbing the knob itself must not jump: at 12 o'clock the angle reads 0 or 1 depending on rounding.
      const cur = 1 - base() / target;
      const f = fracOf(e);
      const gap = Math.abs(f - cur);
      frac.current = Math.min(gap, 1 - gap) < 0.04 ? cur : f;
      move(frac.current);
    },
    onPointerMove(e: RPointerEvent<SVGCircleElement>) {
      if (dragging.current) move(fracOf(e));
    },
    onPointerUp() {
      if (!dragging.current) return;
      dragging.current = false;
      commit();
    },
    onWheel(e: RWheelEvent) {
      if (!enabled) return;
      // Scroll down gives time back, scroll up spends it; 100 px of wheel is a minute.
      preview(Math.min(target, Math.max(step, base() + e.deltaY * (MINUTE / 100))));
      commitSoon();
    },
    onKeyDown(e: RKeyboardEvent) {
      if (!enabled) return;
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      preview(clamp(base() + dir * MINUTE));
      commitSoon();
    },
  };
}

function PhasePill({ t }: { t: TimerState }) {
  const preset = useLiveQuery(() => (t.presetId ? db.presets.get(t.presetId) : undefined), [t.presetId]);
  const focus = t.phase === 'focus';
  return (
    <span className={cx('pill px-3 py-1.5 text-[13px] text-white', focus ? 'bg-tomato' : 'bg-leaf')}>
      {focus ? '● ' : '☕ '}
      {phaseLabel(t.phase)}
      {focus && preset && t.round ? ` · round ${t.round} of ${preset.rounds}` : ''}
    </span>
  );
}

/**
 * The subject and the task in hand: the session's own task if it has one, otherwise the
 * subject's next open task. Ticking it off shows the next one. A small swap button lets
 * the user change which task they're working on even after the timer has started.
 */
function WorkingOn({ t }: { t: TimerState }) {
  const { showTasks } = useSettings();
  const [newTitle, setNewTitle] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('pm.focusTasksCollapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('pm.focusTasksCollapsed', c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  };
  // null = no subject; undefined = still loading (render nothing rather than flash "No subject").
  const board = useLiveQuery(async () => (t.boardId ? ((await db.boards.get(t.boardId)) ?? null) : null), [t.boardId]);
  const tasks = useLiveQuery(
    () =>
      db.tasks
        .orderBy('createdAt')
        .filter((x) => (t.boardId ? x.boardId === t.boardId : !x.boardId && !x.folderId) && (!x.done || (x.doneAt ?? 0) > Date.now() - DAY))
        .toArray(),
    [t.boardId],
  );
  if (board === undefined || tasks === undefined) return null;
  const own = t.taskId ? tasks.find((x) => x.id === t.taskId) : undefined;
  const current = own && !own.done ? own : tasks.find((x) => !x.done);
  const justDone = tasks.filter((x) => x.done && (x.doneAt ?? 0) > Date.now() - 10_000).pop();
  if (isBreak(t.phase) || (!board && !current && !t.label && !justDone && !showTasks)) return null;
  const toggle = (id: string, done: boolean) => append([{ type: 'task.done', ts: Date.now(), data: { taskId: id, done } } as PendingEvent]);
  // Stack: the task in hand first, then the rest of the open ones in creation order.
  const stack = current ? [current, ...tasks.filter((x) => !x.done && x.id !== current.id)] : [];
  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    void db.tasks.put({ id: uid('task'), title, done: false, createdAt: Date.now(), ...(board ? { boardId: board.id } : {}) });
    setNewTitle('');
  };

  return (
    <div className="w-full max-w-md rounded-card border border-rule bg-sheet/90 px-4 py-3 shadow-note">
      <div className="flex items-center gap-2 text-[13px] text-ink/60">
        {board && <span className="h-2.5 w-2.5 rounded-full" style={{ background: board.color }} />}
        <span className="truncate font-bold">{board?.name ?? 'No subject'}</span>
        {t.label && t.label !== board?.name && <span className="truncate font-hand text-[17px] text-ink/70">· {t.label}</span>}
        {showTasks && stack.length > 1 && (
          <button
            className="ml-auto flex shrink-0 items-center gap-1 text-ink/40 transition-colors hover:text-ink/70"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Show all tasks' : 'Show only the first task'}
            title={collapsed ? 'Show all tasks' : 'Show only the first task'}
          >
            {collapsed && <span className="text-xs font-bold">+{stack.length - 1}</span>}
            <ChevronDown size={16} className={cx('transition-transform', !collapsed && 'rotate-180')} />
          </button>
        )}
      </div>
      {showTasks && (
        <>
          {justDone && (
            <button className="mt-1 flex w-full items-center gap-3 text-left text-ink/45" onClick={() => void toggle(justDone.id, false)} title="Undo">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-leaf bg-leaf text-[13px] text-white">✓</span>
              <span className="truncate font-hand text-[20px] line-through decoration-tomato/70">{justDone.title}</span>
            </button>
          )}
          {stack.length > 0 && (
            <>
              <TaskRow task={stack[0]} first onDone={() => void toggle(stack[0].id, true)} />
              {/* Grid-rows trick: animates height 0 ↔ auto without measuring. */}
              <div
                className={cx('grid transition-[grid-template-rows,opacity] duration-300 ease-out', collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}
                aria-hidden={collapsed}
              >
                <div className="overflow-hidden">
                  <ul className="max-h-48 space-y-1 overflow-y-auto pt-1">
                    {stack.slice(1).map((x) => (
                      <TaskRow key={x.id} task={x} onDone={() => void toggle(x.id, true)} onPick={() => void engine.retask(t.id, x.id)} />
                    ))}
                  </ul>
                  <form className="mt-1 flex items-center gap-3" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
                    <span className="h-6 w-6 shrink-0 rounded-full border-2 border-dashed border-ink/25" />
                    <input
                      className="min-w-0 flex-1 bg-transparent font-hand text-[19px] leading-tight outline-none placeholder:text-ink/30"
                      placeholder="add a task…"
                      value={newTitle}
                      tabIndex={collapsed ? -1 : 0}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </form>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ task, first, onDone, onPick }: { task: Task; first?: boolean; onDone: () => void; onPick?: () => void }) {
  return (
    <li className={cx('flex list-none items-center gap-3', first && 'mt-1')}>
      <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink/40 hover:border-leaf" onClick={onDone} aria-label={`Mark "${task.title}" done`} />
      <button
        className={cx('flex-1 truncate text-left font-hand leading-tight', first ? 'text-[22px]' : 'text-[19px] text-ink/70 hover:text-ink')}
        onClick={onPick}
        title={onPick ? 'Work on this one now' : undefined}
      >
        {task.title}
      </button>
    </li>
  );
}
