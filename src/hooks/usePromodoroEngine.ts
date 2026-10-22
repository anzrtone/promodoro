/**
 * usePromodoroEngine — the runtime that drives the pure engine.
 *
 *  • Timestamp-based: displayed time is always computed from stored timestamps
 *    (`snapshot(timer, Date.now())`). The 1 s ticker only repaints and "settles";
 *    if it's throttled, suspended or killed, nothing is lost.
 *  • Settle: on every tick, focus/resume, native alarm and app launch we ask the pure
 *    engine which events are due (alarm, completion) and append them with their true
 *    timestamps. A timer that finished while the phone slept is recorded at the moment
 *    it actually finished, and the alarm is marked "late" instead of blaring on wake.
 *  • Native alarms: after every change the crossing moments of all running timers are
 *    handed to the platform (Rust scheduler on desktop, AlarmManager on Android).
 *  • Clock guard: if the wall clock jumps backwards while running (user/NTP changed
 *    it), the open run segments are shifted so measured time is preserved.
 *  • Auto-advance: strict countdowns can roll into the next phase at the exact
 *    completion instant, even if that instant passed while the app was asleep.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { alarms as alarmQueue } from '@/audio/engine';
import { isSoundId } from '@/audio/catalog';
import { db } from '@/db/schema';
import { append, getActiveTimers, logAppEvent } from '@/db/repo';
import { DEFAULT_SETTINGS, getSettings, updateSettings, type AppSettings } from '@/db/settings';
import { breakAfter, phaseLabel, roundAfterBreak, suggestBreakMs, isBreak } from '@/engine/cycle';
import { dueEvents, nextAlarmAt, snapshot, type PendingEvent } from '@/engine/timer';
import { formatClock, formatDuration, formatTimeOfDay, MINUTE, uid } from '@/engine/time';
import type { Board, ModeChoice, Mood, Phase, Preset, Session, TimerState } from '@/engine/types';
import { evaluateSession } from '@/features/stickers';
import { platform } from '@/platform';
import type { AlarmSpec, NativeAction, StatusSpec } from '@/platform/types';

export interface StartOptions {
  phase: Phase;
  mode: ModeChoice;
  minutes: number;
  label?: string;
  boardId?: string | null;
  taskId?: string;
  soundId?: string;
  /** "I started X min ago". */
  backdateMin?: number;
  presetId?: string;
  round?: number;
  auto?: boolean;
  /** Start instant (defaults to now). Used by auto-advance to chain at the exact crossing. */
  at?: number;
}

/** Shown after a focus/break ends: summary, suggested break, margin note. */
export interface Wrap {
  session: Session;
  /** Suggested next break (ms) when a focus session ended. */
  suggestedBreakMs: number;
  nextBreak: 'short' | 'long' | null;
  /** Was this completion noticed late (while you were away)? */
  late: boolean;
}

export interface Notice {
  id: string;
  kind: 'missed';
  timerId: string;
  phase: Phase;
  label?: string;
  /** When the alarm should have rung. */
  at: number;
  /** Whether the timer kept running (overtime) or stopped at the goal. */
  stopped: boolean;
}

export interface EngineState {
  ready: boolean;
  timers: TimerState[];
  wrap: Wrap | null;
  notices: Notice[];
  ringing: boolean;
  /** Bumped on every alarm so Pomo can cheer. */
  cheerAt: number;
}

type Listener = () => void;

const describe = (t: TimerState) => t.label || (t.phase === 'side' ? 'Timer' : phaseLabel(t.phase));

class Engine {
  private timers = new Map<string, TimerState>();
  private settings: AppSettings = DEFAULT_SETTINGS;
  private boards: Board[] = [];
  private presets: Preset[] = [];
  private listeners = new Set<Listener>();
  private state: EngineState = { ready: false, timers: [], wrap: null, notices: [], ringing: false, cheerAt: 0 };
  private settling: Promise<void> | null = null;
  private lastWall = Date.now();
  private lastPerf = performance.now();
  private started = false;
  private backHandler: (() => boolean) | null = null;

  /** Android hardware back: the shell asks the UI first, then minimises. */
  setBackHandler(fn: (() => boolean) | null) {
    this.backHandler = fn;
  }

  /* ---------- store plumbing ---------- */

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getState = () => this.state;

  private publish(patch: Partial<EngineState> = {}) {
    const timers = [...this.timers.values()].sort((a, b) => a.createdAt - b.createdAt);
    this.state = { ...this.state, ...patch, timers };
    for (const l of this.listeners) l();
  }

  get currentSettings() {
    return this.settings;
  }

  /* ---------- lifecycle ---------- */

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.settings = await getSettings();
    liveQuery(getSettings).subscribe((s) => {
      const closeChanged = s.closeToTray !== this.settings.closeToTray;
      this.settings = s;
      if (closeChanged) void platform().setCloseToTray?.(s.closeToTray);
    });
    liveQuery(() => db.boards.toArray()).subscribe((b) => (this.boards = b));
    liveQuery(() => db.presets.toArray()).subscribe((p) => (this.presets = p));
    for (const t of await getActiveTimers()) this.timers.set(t.id, t);
    alarmQueue.onChange((ringing) => this.publish({ ringing }));

    await platform().init({
      onAlarm: () => void this.settle(),
      onAction: (a) => void this.onNativeAction(a),
      onResume: (awayMs) => {
        if (awayMs > 2 * MINUTE) void logAppEvent('app.resume', { awayMs });
        void this.settle();
      },
      onBackground: () => {
        void this.syncNative();
      },
      onBack: () => this.backHandler?.() ?? false,
    });
    void platform().setCloseToTray?.(this.settings.closeToTray);
    await logAppEvent('app.open');
    await this.settle();
    this.publish({ ready: true });
    setInterval(() => this.tick(), 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.settle();
    });
  }

  private tick() {
    // Clock guard: detect the wall clock being set backwards while we're alive.
    const wall = Date.now();
    const perf = performance.now();
    const drift = wall - this.lastWall - (perf - this.lastPerf);
    this.lastWall = wall;
    this.lastPerf = perf;
    if (drift < -5000) void this.onClockJump(drift);
    void this.settle();
    void this.syncStatus();
  }

  private async onClockJump(deltaMs: number) {
    const running = [...this.timers.values()].filter((t) => t.status === 'running');
    if (!running.length) return;
    await this.commit(running.map((t) => ({ type: 'clock.jump', ts: Date.now(), timerId: t.id, data: { deltaMs } }) as PendingEvent));
  }

  /* ---------- the settle loop ---------- */

  settle(): Promise<void> {
    if (this.settling) return this.settling;
    const run = async () => {
      // Loop: completing a phase can auto-start another that is itself already due.
      for (let guard = 0; guard < 50; guard++) {
        const now = Date.now();
        const due = [...this.timers.values()].flatMap((t) => dueEvents(t, now));
        if (!due.length) break;
        await this.commit(due, { reachedZero: true });
      }
    };
    // Clear the guard asynchronously: if `run` finishes without awaiting anything, a
    // synchronous reset would happen before the assignment below and wedge the loop.
    const p: Promise<void> = run().finally(() => {
      if (this.settling === p) this.settling = null;
    });
    this.settling = p;
    return p;
  }

  /** Append events, fold results into memory, react to alarms and completions. */
  private async commit(pending: PendingEvent[], opts: { reachedZero?: boolean } = {}) {
    // Auto-advance only applies when a countdown reached zero by itself (settle), never
    // when the user tapped Done / Take a break.
    const auto = !!opts.reachedZero && this.settings.autoAdvance;
    const res = await append(pending);
    for (const t of res.timers) {
      if (t.status === 'done') this.timers.delete(t.id);
      else this.timers.set(t.id, t);
    }
    const notices = [...this.state.notices];
    let wrap = this.state.wrap;
    let cheerAt = this.state.cheerAt;

    for (const e of res.events) {
      if (e.type !== 'timer.alarm' || !e.timerId) continue;
      const t = res.timers.find((x) => x.id === e.timerId);
      if (!t) continue;
      const key = `${t.id}@${e.ts}`;
      if (e.data.late) {
        alarmQueue.markHandled(key);
        notices.push({ id: uid('n'), kind: 'missed', timerId: t.id, phase: t.phase, label: t.label, at: e.ts, stopped: !t.overtime });
      } else {
        cheerAt = Date.now();
        this.ring(t, key);
      }
    }

    for (const s of res.finished) {
      void evaluateSession(s);
      if (s.phase === 'side') continue;
      const timer = res.timers.find((t) => t.id === s.id);
      const late = notices.some((n) => n.timerId === s.id);
      if (s.phase === 'focus') {
        const round = timer?.round ?? this.settings.round;
        const preset = this.preset(timer?.presetId);
        const next = breakAfter(round, preset);
        const suggested = suggestBreakMs(s.actualMs, next, preset, this.settings.breakPolicy);
        wrap = { session: s, suggestedBreakMs: suggested, nextBreak: next, late };
        if (s.endReason === 'complete' && auto && !this.primary()) {
          await this.startTimer({ phase: next, mode: this.settings.breakMode, minutes: suggested / MINUTE, round, presetId: preset.id, auto: true, at: s.end });
          wrap = { ...wrap, nextBreak: null };
        }
      } else if (isBreak(s.phase)) {
        const preset = this.preset(timer?.presetId);
        const nextRound = roundAfterBreak(timer?.round ?? this.settings.round, s.phase as 'short' | 'long', preset);
        await updateSettings({ round: nextRound });
        wrap = { session: s, suggestedBreakMs: 0, nextBreak: null, late };
        if (s.endReason === 'complete' && auto && !this.primary()) {
          await this.startFocus({ auto: true, at: s.end, round: nextRound });
          wrap = null;
        }
      }
    }
    this.publish({ notices, wrap, cheerAt });
    await this.syncNative();
  }

  private ring(t: TimerState, key: string) {
    const s = this.settings;
    platform().vibrate('alarm');
    if (s.silent) return alarmQueue.markHandled(key);
    // On Android the notification channel plays the sound for on-time alarms (foreground
    // too), so the in-app queue stays quiet to avoid ringing twice.
    if (platform().nativeAlarmSound()) return alarmQueue.markHandled(key);
    const soundId = isSoundId(t.soundId) ? t.soundId : t.phase === 'focus' ? s.soundId : s.breakSoundId;
    alarmQueue.enqueue({ key, soundId: isSoundId(soundId) ? soundId : 'kitchen', volume: s.volume, repeats: s.alarmRepeat ? 8 : (t.phase === 'focus' ? 2 : 1) });
  }

  /* ---------- native sync ---------- */

  private async syncNative() {
    const s = this.settings;
    const specs: AlarmSpec[] = [];
    for (const t of this.timers.values()) {
      const at = nextAlarmAt(t);
      if (at === null) continue;
      const name = describe(t);
      const body =
        t.phase === 'focus'
          ? t.overtime
            ? "Goal reached! I'll keep counting while you're in the flow."
            : 'Focus session complete. Time for a little break?'
          : isBreak(t.phase)
            ? 'Break is over. Ready when you are.'
            : `${name} is done.`;
      specs.push({ id: t.id, at, title: `🍅 ${name}`, body, soundId: this.soundFor(t), silent: s.silent, vibrate: s.vibrate });
    }
    try {
      await platform().syncAlarms(specs);
    } catch (err) {
      console.warn('[engine] alarm sync failed', err);
    }
    await this.syncStatus(true);
  }

  private soundFor(t: TimerState): string {
    if (isSoundId(t.soundId)) return t.soundId;
    return t.phase === 'focus' ? this.settings.soundId : this.settings.breakSoundId;
  }

  private async syncStatus(force = false) {
    const p = this.primary() ?? [...this.timers.values()][0];
    let status: StatusSpec | null = null;
    if (p) {
      const snap = snapshot(p, Date.now());
      const name = describe(p);
      const clock = snap.targetMs > 0 ? (snap.inOvertime ? `+${formatClock(snap.overtimeMs)}` : formatClock(snap.remainingMs, { ceil: true })) : formatClock(snap.totalMs);
      const at = nextAlarmAt(p);
      const detail =
        p.status === 'paused'
          ? `Paused at ${formatDuration(snap.totalMs)}`
          : snap.inOvertime
            ? `Goal reached · counting overtime since ${formatTimeOfDay(Date.now() - snap.overtimeMs)}`
            : at
              ? `Rings around ${formatTimeOfDay(at)}${p.overtime ? " · I'll keep counting after" : ''}`
              : `Counting up since ${formatTimeOfDay(p.createdAt)}`;
      status = {
        text: `${name} · ${clock}${p.status === 'paused' ? ' (paused)' : ''}`,
        title: `${p.status === 'paused' ? 'Paused' : p.phase === 'focus' ? 'Focusing' : isBreak(p.phase) ? 'Resting' : 'Timer'}${p.label ? ` · ${p.label}` : ''}`,
        detail,
        running: p.status === 'running',
        key: `${p.id}|${p.status}|${at}|${snap.inOvertime}`,
      };
    }
    if (!force && platform().kind === 'android' && !status) return;
    try {
      await platform().setStatus(status);
    } catch {
      /* best effort */
    }
  }

  /* ---------- queries ---------- */

  primary(): TimerState | undefined {
    return [...this.timers.values()].find((t) => t.phase !== 'side');
  }

  preset(id?: string): Preset {
    return this.presets.find((p) => p.id === (id ?? this.settings.presetId)) ?? this.presets[0] ?? {
      id: 'p-25-5', name: 'Classic', focusMin: 25, shortMin: 5, longMin: 15, rounds: 4, order: 0,
    };
  }

  /* ---------- actions ---------- */

  async startTimer(o: StartOptions): Promise<string> {
    const id = uid(o.phase === 'side' ? 'side' : 't');
    const board = o.boardId ? this.boards.find((b) => b.id === o.boardId) : undefined;
    const soundId = o.soundId ?? board?.soundId ?? (o.phase === 'focus' ? this.settings.soundId : o.phase === 'side' ? 'bell' : this.settings.breakSoundId);
    const mode = o.mode === 'countup' ? 'countup' : 'countdown';
    const ts = o.at ?? Date.now();
    void platform().requestNotificationPermission().catch(() => false);
    platform().vibrate('tap');
    await this.commit([
      {
        type: 'timer.start',
        ts,
        timerId: id,
        data: {
          mode,
          overtime: o.mode === 'overtime',
          phase: o.phase,
          plannedMs: mode === 'countup' ? 0 : Math.round(o.minutes * MINUTE),
          backdateMs: o.backdateMin ? Math.round(o.backdateMin * MINUTE) : undefined,
          label: o.label || board?.name,
          boardId: o.boardId ?? undefined,
          taskId: o.taskId,
          soundId,
          presetId: o.presetId,
          round: o.round,
          auto: o.auto,
        },
      } as PendingEvent,
    ]);
    // Not awaited: startTimer may itself run inside a settle pass (auto-advance).
    void this.settle();
    return id;
  }

  /** Start the next focus session using the current preset/board/defaults. */
  startFocus(extra: Partial<StartOptions> = {}): Promise<string> {
    const preset = this.preset();
    return this.startTimer({
      phase: 'focus',
      mode: this.settings.defaultMode,
      minutes: preset.focusMin,
      boardId: this.settings.boardId,
      presetId: preset.id,
      round: this.settings.round,
      ...extra,
    });
  }

  startBreak(phase: 'short' | 'long', minutes: number, fromRound?: number) {
    this.publish({ wrap: null });
    return this.startTimer({ phase, mode: this.settings.breakMode, minutes, presetId: this.settings.presetId, round: fromRound ?? this.settings.round });
  }

  private ev(timerId: string, type: PendingEvent['type'], data: unknown = {}) {
    return this.commit([{ type, ts: Date.now(), timerId, data } as PendingEvent]).then(() => this.settle());
  }

  pause = (id: string) => this.ev(id, 'timer.pause');
  resume = (id: string) => this.ev(id, 'timer.resume');
  nudge = (id: string, minutes: number) => this.ev(id, 'timer.nudge', { ms: minutes * MINUTE });
  /** Turn the clock forward: log minutes worked before the timer was started. */
  backfill = (id: string, minutes: number) => this.ev(id, 'timer.backfill', { ms: minutes * MINUTE });
  /** Scrub the clock: move elapsed time by `ms` (negative winds it back). */
  adjust = (id: string, ms: number) => this.ev(id, 'timer.adjust', { ms });
  /** Change the task being worked on mid-session. Pass undefined to clear it. */
  retask = (id: string, taskId: string | undefined) => this.ev(id, 'timer.retask', { taskId });
  overtime = (id: string, on: boolean, softTargetMin?: number) =>
    this.ev(id, 'timer.overtime', { on, softTargetMs: softTargetMin !== undefined ? softTargetMin * MINUTE : undefined });

  async done(id: string, opts: { note?: string; mood?: Mood } = {}) {
    alarmQueue.stopAll();
    const t = this.timers.get(id);
    if (!t) return;
    const snap = snapshot(t, Date.now());
    const reason = snap.targetMs > 0 && snap.totalMs < snap.targetMs ? 'early' : 'complete';
    const events: PendingEvent[] = [];
    if (opts.note || opts.mood) events.push({ type: 'timer.note', ts: Date.now(), timerId: id, data: opts } as PendingEvent);
    events.push({ type: 'timer.done', ts: Date.now(), timerId: id, data: { reason } } as PendingEvent);
    platform().vibrate('success');
    await this.commit(events);
  }

  discard = async (id: string) => {
    alarmQueue.stopAll();
    await this.commit([{ type: 'timer.discard', ts: Date.now(), timerId: id, data: {} } as PendingEvent]);
  };

  async noteSession(sessionId: string, note?: string, mood?: Mood) {
    await this.commit([{ type: 'timer.note', ts: Date.now(), timerId: sessionId, data: { note, mood } } as PendingEvent]);
    if (this.state.wrap?.session.id === sessionId)
      this.publish({ wrap: { ...this.state.wrap, session: { ...this.state.wrap.session, note, mood } } });
  }

  /** Primary button: start / pause / resume. */
  async toggle() {
    const p = this.primary();
    if (!p) return void (await this.startFocus());
    if (p.status === 'running') await this.pause(p.id);
    else await this.resume(p.id);
  }

  dismissWrap = () => this.publish({ wrap: null });
  dismissNotice = (id: string) => this.publish({ notices: this.state.notices.filter((n) => n.id !== id) });
  silence = () => alarmQueue.stopAll();

  private async onNativeAction(a: NativeAction) {
    const p = this.primary();
    if (a === 'toggle') await this.toggle();
    else if (a === 'done' && p) await this.done(p.id);
    else if (a === 'start-focus' && !p) await this.startFocus();
    else if (a === 'start-break') {
      if (p?.phase === 'focus') await this.done(p.id);
      const w = this.state.wrap;
      if (w?.nextBreak) await this.startBreak(w.nextBreak, Math.round(w.suggestedBreakMs / MINUTE));
    }
    window.dispatchEvent(new CustomEvent('promodoro:native-action', { detail: a }));
  }
}

export const engine = new Engine();

/** Re-render every `ms` (aligned to wall-clock seconds) for display only. */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      setNow(Date.now());
      timer = setTimeout(loop, ms - (Date.now() % ms) + 5);
    };
    timer = setTimeout(loop, ms - (Date.now() % ms) + 5);
    const vis = () => !document.hidden && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms, active]);
  return now;
}

export function usePromodoroEngine() {
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  const anyRunning = state.timers.some((t) => t.status === 'running');
  // 1 s while a timer is shown; a slow 15 s refresh otherwise (for "ended X min ago").
  const now = useNow(anyRunning || state.timers.length > 0 ? 1000 : 15_000);
  const primary = state.timers.find((t) => t.phase !== 'side');
  const sides = state.timers.filter((t) => t.phase === 'side');
  return {
    ...state,
    now,
    primary,
    primarySnap: primary ? snapshot(primary, now) : null,
    sides,
    engine,
  };
}
