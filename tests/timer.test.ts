import { describe, expect, it } from 'vitest';
import { applyEvent, crossingAt, dueEvents, foldTimers, snapshot, startTimer, toSession } from '@/engine/timer';
import { MINUTE } from '@/engine/time';
import type { AnyEvent, StartPayload, TimerState } from '@/engine/types';

const T0 = Date.UTC(2026, 9, 21, 13, 0, 0);
const ev = (type: AnyEvent['type'], ts: number, data: unknown = {}): AnyEvent => ({ type, ts, tz: 0, timerId: 't1', data }) as AnyEvent;
const start = (p: Partial<StartPayload> = {}, ts = T0): TimerState =>
  startTimer(ev('timer.start', ts, { mode: 'countdown', overtime: false, phase: 'focus', plannedMs: 25 * MINUTE, ...p }) as never);
const apply = (s: TimerState, ...events: AnyEvent[]) => events.reduce<TimerState>((acc, e) => applyEvent(acc, e)!, s);
/** Apply whatever the engine says is due at `now` (what the settle loop does). */
const settle = (s: TimerState, now: number) => apply(s, ...(dueEvents(s, now).map((e) => ({ ...e, tz: 0 })) as AnyEvent[]));

describe('countdown', () => {
  it('computes remaining time from timestamps, not ticks', () => {
    const s = start();
    expect(snapshot(s, T0 + 10 * MINUTE).remainingMs).toBe(15 * MINUTE);
    expect(crossingAt(s)).toBe(T0 + 25 * MINUTE);
  });

  it('pauses and resumes without losing or gaining time', () => {
    let s = start();
    s = apply(s, ev('timer.pause', T0 + 10 * MINUTE), ev('timer.resume', T0 + 30 * MINUTE));
    const snap = snapshot(s, T0 + 35 * MINUTE);
    expect(snap.timedMs).toBe(15 * MINUTE);
    expect(snap.pausedMs).toBe(20 * MINUTE);
    expect(crossingAt(s)).toBe(T0 + 45 * MINUTE);
  });

  it('completes at the exact crossing even if noticed hours later (phone asleep)', () => {
    const s = settle(start(), T0 + 3 * 60 * MINUTE);
    expect(s.status).toBe('done');
    expect(s.endedAt).toBe(T0 + 25 * MINUTE);
    expect(s.alarmLate).toBe(true);
    expect(toSession(s)!.actualMs).toBe(25 * MINUTE);
  });

  it('on-time alarm is not late', () => {
    const s = settle(start(), T0 + 25 * MINUTE + 2000);
    expect(s.alarmLate).toBe(false);
  });

  it('+1 / +5 nudges extend the plan', () => {
    const s = apply(start(), ev('timer.nudge', T0 + MINUTE, { ms: 5 * MINUTE }), ev('timer.nudge', T0 + 2 * MINUTE, { ms: MINUTE }));
    expect(snapshot(s, T0).targetMs).toBe(31 * MINUTE);
    expect(crossingAt(s)).toBe(T0 + 31 * MINUTE);
  });

  it('finishing early records exact elapsed time and an "early" reason', () => {
    const s = apply(start(), ev('timer.done', T0 + 18 * MINUTE, { reason: 'early' }));
    const session = toSession(s)!;
    expect(session.actualMs).toBe(18 * MINUTE);
    expect(session.endReason).toBe('early');
    expect(session.source).toBe('timed');
  });
});

describe('overtime (Gentle Flow)', () => {
  it('rings at the goal and keeps counting', () => {
    let s = start({ overtime: true });
    s = settle(s, T0 + 25 * MINUTE + 500);
    expect(s.status).toBe('running');
    expect(s.alarmAt).toBe(T0 + 25 * MINUTE);
    const snap = snapshot(s, T0 + 32 * MINUTE + 12_000);
    expect(snap.inOvertime).toBe(true);
    expect(snap.overtimeMs).toBe(7 * MINUTE + 12_000);
    s = apply(s, ev('timer.done', T0 + 32 * MINUTE + 12_000, { reason: 'complete' }));
    const session = toSession(s)!;
    expect(session.plannedMs).toBe(25 * MINUTE);
    expect(session.overtimeMs).toBe(7 * MINUTE + 12_000);
    expect(session.actualMs).toBe(32 * MINUTE + 12_000);
  });

  it('a +5 nudge during overtime re-arms the alarm', () => {
    let s = settle(start({ overtime: true }), T0 + 27 * MINUTE);
    expect(s.alarmAt).not.toBeNull();
    s = apply(s, ev('timer.nudge', T0 + 27 * MINUTE, { ms: 5 * MINUTE }));
    expect(s.alarmAt).toBeNull();
    expect(crossingAt(s)).toBe(T0 + 30 * MINUTE);
  });

  it('countdown overtime toggle keeps a strict countdown from stopping', () => {
    let s = apply(start(), ev('timer.overtime', T0 + MINUTE, { on: true }));
    s = settle(s, T0 + 26 * MINUTE);
    expect(s.status).toBe('running');
  });
});

describe('count up', () => {
  it('runs without a target and never auto-stops', () => {
    const s = start({ mode: 'countup', plannedMs: 0 });
    expect(dueEvents(s, T0 + 10 * 60 * MINUTE)).toEqual([]);
    expect(snapshot(s, T0 + 90 * MINUTE).totalMs).toBe(90 * MINUTE);
  });

  it('Overtime sets a soft goal; time past it is overtime', () => {
    let s = start({ mode: 'countup', plannedMs: 0 });
    s = apply(s, ev('timer.overtime', T0 + 10 * MINUTE, { on: true, softTargetMs: 45 * MINUTE }));
    s = settle(s, T0 + 45 * MINUTE);
    expect(s.alarmAt).toBe(T0 + 45 * MINUTE);
    expect(snapshot(s, T0 + 50 * MINUTE).overtimeMs).toBe(5 * MINUTE);
  });

  it('"flag from now" marks overtime immediately without ringing', () => {
    let s = start({ mode: 'countup', plannedMs: 0 });
    s = apply(s, ev('timer.overtime', T0 + 20 * MINUTE, { on: true }));
    expect(s.alarmAt).toBe(T0 + 20 * MINUTE);
    expect(dueEvents(s, T0 + 21 * MINUTE)).toEqual([]);
    expect(snapshot(s, T0 + 30 * MINUTE).overtimeMs).toBe(10 * MINUTE);
  });
});

describe('recovering missed time', () => {
  it('"I started 20 min ago" backdates and labels the time', () => {
    const s = start({ backdateMs: 20 * MINUTE });
    expect(snapshot(s, T0).remainingMs).toBe(5 * MINUTE);
    const done = settle(s, T0 + 6 * MINUTE);
    const session = toSession(done)!;
    expect(session.start).toBe(T0 - 20 * MINUTE);
    expect(session.recoveredMs).toBe(20 * MINUTE);
    expect(session.timedMs).toBe(5 * MINUTE);
    expect(session.source).toBe('adjusted');
  });

  it('turning the clock forward past the goal completes at that moment', () => {
    let s = start();
    s = apply(s, ev('timer.backfill', T0 + 10 * MINUTE, { ms: 20 * MINUTE }));
    s = settle(s, T0 + 10 * MINUTE + 1000);
    expect(s.status).toBe('done');
    expect(s.endedAt).toBe(T0 + 10 * MINUTE);
    // 10 timed + 20 turned forward: everything worked is kept, honestly labelled.
    expect(toSession(s)!.actualMs).toBe(30 * MINUTE);
    expect(toSession(s)!.recoveredMs).toBe(20 * MINUTE);
  });
});

describe('robustness', () => {
  it('clock jumps backwards do not erase measured time', () => {
    let s = start();
    // At real T0+10m the clock is set back one hour; wall now reads T0-50m.
    s = apply(s, ev('clock.jump', T0 - 50 * MINUTE, { deltaMs: -60 * MINUTE }));
    expect(snapshot(s, T0 - 50 * MINUTE).timedMs).toBe(10 * MINUTE);
  });

  it('ignores events for finished timers and duplicate starts', () => {
    let s = apply(start(), ev('timer.done', T0 + MINUTE, { reason: 'early' }));
    const again = apply(s, ev('timer.resume', T0 + 2 * MINUTE), ev('timer.start', T0 + 3 * MINUTE, {}));
    expect(again).toBe(s);
    s = apply(s, ev('timer.note', T0 + 5 * MINUTE, { note: 'chapter 3', mood: 'good' }));
    expect(s.note).toBe('chapter 3');
  });

  it('folding the log in any order gives the same result', () => {
    const events = [
      ev('timer.start', T0, { mode: 'countdown', overtime: true, phase: 'focus', plannedMs: 25 * MINUTE }),
      ev('timer.pause', T0 + 5 * MINUTE),
      ev('timer.resume', T0 + 7 * MINUTE),
      ev('timer.done', T0 + 40 * MINUTE, { reason: 'complete' }),
    ].map((e, i) => ({ ...e, id: i + 1 }));
    const a = foldTimers(events).get('t1')!;
    const b = foldTimers([...events].reverse()).get('t1')!;
    expect(toSession(a)).toEqual(toSession(b));
    expect(toSession(a)!.timedMs).toBe(38 * MINUTE);
  });

  it('discarded timers produce no session', () => {
    const s = apply(start(), ev('timer.discard', T0 + MINUTE));
    expect(toSession(s)).toBeNull();
  });
});
