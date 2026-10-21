/**
 * Promodoro domain types.
 *
 * The engine is event-sourced: every user/system action is appended to an immutable
 * log (`LogEvent`), and timer state is a pure fold over that log. Sessions are a
 * projection written when a timer ends, and can always be rebuilt from the log.
 *
 * All timestamps are UTC epoch milliseconds. Every event also carries `tz`, the
 * device's UTC offset in minutes *east* of UTC at the time it was written, so day
 * boundaries stay correct across DST changes and travel.
 */

export type TimerMode = 'countdown' | 'countup';
/** UI-level mode. "overtime" is a countdown that keeps counting past zero. */
export type ModeChoice = 'countdown' | 'countup' | 'overtime';
export type Phase = 'focus' | 'short' | 'long' | 'side';
export type TimerStatus = 'running' | 'paused' | 'done';
export type EndReason = 'complete' | 'early' | 'stopped' | 'discarded';

/** How a piece of time entered the record. Labels describe; they never judge. */
export type TimeSource = 'timed' | 'adjusted' | 'manual' | 'imported';

export interface StartPayload {
  mode: TimerMode;
  overtime: boolean;
  phase: Phase;
  /** Countdown length, or the soft goal on a count-up (0 = none). */
  plannedMs: number;
  /** "I started X min ago": time worked before tapping start. */
  backdateMs?: number;
  label?: string;
  boardId?: string;
  taskId?: string;
  soundId?: string;
  presetId?: string;
  /** 1-based focus round inside the current preset cycle. */
  round?: number;
  /** Set when the phase was started automatically (auto-advance). */
  auto?: boolean;
}

export type EventMap = {
  'timer.start': StartPayload;
  'timer.pause': Record<string, never>;
  'timer.resume': Record<string, never>;
  /** +1 / +5 nudges: extend the plan. */
  'timer.nudge': { ms: number };
  /** Turn the clock forward: record time worked while the timer was not running. */
  'timer.backfill': { ms: number };
  'timer.overtime': { on: boolean; softTargetMs?: number };
  'timer.alarm': { late?: boolean };
  'timer.done': { reason: Exclude<EndReason, 'discarded'> };
  'timer.discard': Record<string, never>;
  'timer.note': { note?: string; mood?: Mood };
  'session.manual': ManualSessionPayload;
  'session.edit': { sessionId: string; patch: Partial<Pick<Session, 'label' | 'boardId' | 'note' | 'mood'>> };
  'session.delete': { sessionId: string };
  'session.restore': { sessionId: string };
  'import.batch': { count: number; format: 'csv' | 'json'; file?: string };
  'app.open': Record<string, never>;
  'app.resume': { awayMs?: number };
  'app.background': Record<string, never>;
  'clock.jump': { deltaMs: number };
  'task.done': { taskId: string; done: boolean };
};

export type EventType = keyof EventMap;

export interface LogEvent<T extends EventType = EventType> {
  id?: number;
  ts: number;
  tz: number;
  type: T;
  timerId?: string;
  data: EventMap[T];
}

export type AnyEvent = { [K in EventType]: LogEvent<K> }[EventType];

export type Mood = 'great' | 'good' | 'meh' | 'tough';

export interface ManualSessionPayload {
  sessionId: string;
  start: number;
  end: number;
  durationMs: number;
  phase: Phase;
  label?: string;
  boardId?: string;
  note?: string;
  /** Drag-to-claim from a timeline gap vs typed in / bulk. */
  kind: 'claim' | 'entry' | 'bulk';
}

/** Live (or finished) timer state: a pure fold over a timer's events. */
export interface TimerState {
  id: string;
  mode: TimerMode;
  overtime: boolean;
  phase: Phase;
  plannedMs: number;
  nudgedMs: number;
  backfillMs: number;
  backdatedMs: number;
  /** Wall time the start button was pressed. */
  createdAt: number;
  createdTz: number;
  /** Run segments [start, end|null] of real, timer-measured time. */
  runs: Array<[number, number | null]>;
  status: TimerStatus;
  alarmAt: number | null;
  alarmLate: boolean;
  endedAt: number | null;
  endReason: EndReason | null;
  label?: string;
  boardId?: string;
  taskId?: string;
  soundId?: string;
  presetId?: string;
  round?: number;
  auto?: boolean;
  note?: string;
  mood?: Mood;
  /** Last event time folded in. */
  updatedAt: number;
}

/** Derived numbers for display at a moment in time. */
export interface TimerSnapshot {
  /** Real measured time (runs). */
  timedMs: number;
  /** backdated + backfill. */
  recoveredMs: number;
  /** timed + recovered. */
  totalMs: number;
  /** planned + nudges (0 when no target). */
  targetMs: number;
  /** target - total (may be negative in overtime). */
  remainingMs: number;
  overtimeMs: number;
  inOvertime: boolean;
  pausedMs: number;
  /** 0..1 progress to target (1 when no target). */
  progress: number;
}

export interface Session {
  id: string;
  timerId?: string;
  start: number;
  end: number;
  tz: number;
  /** Local calendar day of `start`, YYYY-MM-DD. */
  day: string;
  phase: Phase;
  mode?: TimerMode;
  label?: string;
  boardId?: string;
  taskId?: string;
  presetId?: string;
  /** Planned target incl. nudges. 0 for open count-ups. */
  plannedMs: number;
  actualMs: number;
  timedMs: number;
  recoveredMs: number;
  pausedMs: number;
  overtimeMs: number;
  source: TimeSource;
  endReason?: EndReason;
  note?: string;
  mood?: Mood;
  /** Bulk lump (e.g. "300 hours"): counted in totals, hidden from the day strip. */
  bulk?: boolean;
  /** Dedupe fingerprint for imports. */
  importKey?: string;
  importFrom?: string;
  deleted?: boolean;
  createdAt: number;
}

export interface Preset {
  id: string;
  name: string;
  focusMin: number;
  shortMin: number;
  longMin: number;
  rounds: number;
  builtin?: boolean;
  order: number;
}

export interface Board {
  id: string;
  name: string;
  color: string;
  soundId?: string;
  archived?: boolean;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  boardId?: string;
  createdAt: number;
  doneAt?: number;
}

export interface Sticker {
  id: string;
  earnedAt: number;
  seen?: boolean;
}

export interface DailySummary {
  day: string;
  focusMs: number;
  breakMs: number;
  overtimeMs: number;
  sessions: number;
  bySource: Record<TimeSource, number>;
}
