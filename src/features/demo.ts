/**
 * Sample data for Pomo's tour, so Timeline and Stats always have something to explain, on the
 * first run and on every replay. It lives in its own throwaway database: the user's own notebook
 * is only hidden behind it, never changed. It's deleted when the tour ends, or on the next launch
 * if the app closed mid-tour. Nothing here is ever synced, backed up or exported.
 */
import { useSyncExternalStore } from 'react';
import Dexie from 'dexie';
import { db, PromodoroDB } from '@/db/schema';
import { summarizeDay } from '@/engine/stats';
import { addDays, dayStart, DAY, HOUR, localDay, MINUTE, today, tzNow } from '@/engine/time';
import type { AnyEvent, Board, Phase, Session, Sticker, Task, TimeSource } from '@/engine/types';

const DEMO_DB = 'promodoro-tour-demo';
/** How far back the sample history goes. */
const DAYS_BACK = 56;

let active: PromodoroDB | null = null;
let starting: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** The database screens should read from: the sample one during the tour, else the real one. */
export const viewDb = (): PromodoroDB => active ?? db;

export function useViewDb(): PromodoroDB {
  return useSyncExternalStore((f) => {
    subs.add(f);
    return () => void subs.delete(f);
  }, viewDb);
}

/** The day the Timeline opens on during the tour: yesterday, a full sample day. */
export const demoDay = () => addDays(today(), -1);

/** Fill the sample database (with the user's own subjects and folders) and switch screens over to it. */
export function startDemo(): Promise<void> {
  if (active) return Promise.resolve();
  starting ??= (async () => {
    await Dexie.delete(DEMO_DB);
    const demo = new PromodoroDB(DEMO_DB);
    const folders = (await db.folders.toArray()).filter((f) => !f.archived);
    const boards = withSampleBoards((await db.boards.toArray()).filter((b) => !b.archived));
    const data = buildDemo(today(), boards);
    await demo.transaction('rw', [demo.boards, demo.folders, demo.sessions, demo.daily, demo.tasks, demo.events, demo.stickers], async () => {
      await demo.folders.bulkPut(folders);
      await demo.boards.bulkPut(boards);
      await demo.sessions.bulkPut(data.sessions);
      await demo.daily.bulkPut(data.daily);
      await demo.tasks.bulkPut(data.tasks);
      await demo.events.bulkAdd(data.events);
      await demo.stickers.bulkPut(data.stickers);
    });
    active = demo;
    emit();
  })().finally(() => (starting = null));
  return starting;
}

/** Back to the real notebook, and throw the sample away. */
export async function stopDemo(): Promise<void> {
  await starting?.catch(() => undefined);
  const demo = active;
  active = null;
  emit();
  // Give screens a moment to re-query the real database before this one goes away.
  if (demo) setTimeout(() => void demo.delete().catch(() => undefined), 1000);
}

/** On launch: remove a sample database left behind by a tour that never finished. */
export function clearLeftoverDemo(): Promise<void> {
  return Dexie.delete(DEMO_DB).catch(() => undefined);
}

const SAMPLE_BOARDS: Array<Pick<Board, 'name' | 'color'>> = [
  { name: 'Reading', color: '#9B8FE8' },
  { name: 'Study', color: '#EE6B6E' },
  { name: 'Writing', color: '#E9B949' },
];

/** At least three subjects, so "where the time went" has something to compare. */
function withSampleBoards(boards: Board[]): Board[] {
  const out = [...boards];
  for (const s of SAMPLE_BOARDS) {
    if (out.length >= 3) break;
    if (!out.some((b) => b.name.toLowerCase() === s.name.toLowerCase())) out.push({ id: `demo-b-${s.name.toLowerCase()}`, ...s, order: out.length });
  }
  return out;
}

/** Small seeded PRNG, so the sample looks the same every time for a given day. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Draft {
  at: number;
  phase: Phase;
  plannedMin: number;
  actualMin: number;
  overtimeMin?: number;
  pausedMin?: number;
  recoveredMin?: number;
  source?: TimeSource;
  early?: boolean;
  board?: number;
  mood?: Session['mood'];
  note?: string;
}

export interface DemoData {
  sessions: Session[];
  daily: ReturnType<typeof summarizeDay>[];
  tasks: Task[];
  events: AnyEvent[];
  stickers: Sticker[];
}

/** The whole sample history, ending yesterday. Pure, so it can be tested. */
export function buildDemo(todayStr: string, boards: Pick<Board, 'id'>[]): DemoData {
  const rand = rng(todayStr);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const sessions: Session[] = [];
  let n = 0;

  const add = (d: Draft) => {
    const actual = d.actualMin * MINUTE;
    const paused = (d.pausedMin ?? 0) * MINUTE;
    const recovered = (d.recoveredMin ?? 0) * MINUTE;
    const source = d.source ?? (recovered ? 'adjusted' : 'timed');
    const focus = d.phase === 'focus';
    sessions.push({
      id: `demo-s${n++}`,
      start: d.at,
      end: d.at + actual + paused,
      tz: tzNow(d.at),
      day: localDay(d.at),
      phase: d.phase,
      mode: source === 'manual' || source === 'imported' ? undefined : 'countdown',
      boardId: focus && boards.length ? boards[(d.board ?? 0) % boards.length].id : undefined,
      plannedMs: source === 'manual' ? 0 : d.plannedMin * MINUTE,
      actualMs: actual,
      timedMs: source === 'timed' || source === 'adjusted' ? actual - recovered : 0,
      recoveredMs: recovered,
      pausedMs: paused,
      overtimeMs: (d.overtimeMin ?? 0) * MINUTE,
      source,
      endReason: source === 'manual' || source === 'imported' ? undefined : d.early ? 'early' : 'complete',
      mood: d.mood,
      note: d.note,
      createdAt: d.at,
    });
  };

  // A typical day: a few focus blocks at the person's usual times, each followed by a short break.
  for (let back = DAYS_BACK; back >= 2; back--) {
    const day = addDays(todayStr, -back);
    const weekday = new Date(dayStart(day)).getDay();
    const weekend = weekday === 0 || weekday === 6;
    if (rand() > (weekend ? 0.45 : 0.82)) continue;
    const slots = [9, 10.5, 14, 16, 20].filter(() => rand() < 0.6);
    if (!slots.length) slots.push(pick([9, 14, 20]));
    for (const slot of slots) {
      const planned = rand() < 0.65 ? 25 : 50;
      const r = rand();
      const overtime = r < 0.25 ? 2 + Math.round(rand() * 16) : 0;
      const early = r > 0.82;
      const actual = early ? Math.round(planned * (0.55 + rand() * 0.35)) : planned + overtime;
      const s = rand();
      const source: TimeSource = back > 18 && back < 30 && s < 0.25 ? 'imported' : s < 0.1 ? 'manual' : 'timed';
      const at = dayStart(day) + slot * HOUR + Math.round(rand() * 25) * MINUTE;
      add({
        at,
        phase: 'focus',
        plannedMin: planned,
        actualMin: actual,
        overtimeMin: early ? 0 : overtime,
        early,
        source,
        recoveredMin: source === 'timed' && rand() < 0.12 ? 10 : 0,
        pausedMin: rand() < 0.3 ? 1 + Math.round(rand() * 4) : 0,
        board: Math.floor(rand() * 3),
      });
      if (source !== 'imported') add({ at: at + actual * MINUTE + 2 * MINUTE, phase: planned === 50 ? 'long' : 'short', plannedMin: planned === 50 ? 10 : 5, actualMin: planned === 50 ? 10 : 5 });
    }
  }

  // Yesterday is a hand-made "show and tell" day for the Timeline: every kind of block, plus a gap to claim.
  const y = dayStart(addDays(todayStr, -1));
  const t = (h: number, m = 0) => y + h * HOUR + m * MINUTE;
  add({ at: t(8, 50), phase: 'focus', plannedMin: 25, actualMin: 25, board: 0, mood: 'good' });
  add({ at: t(9, 15), phase: 'short', plannedMin: 5, actualMin: 5 });
  add({ at: t(9, 22), phase: 'focus', plannedMin: 50, actualMin: 58, overtimeMin: 8, recoveredMin: 10, board: 1, note: 'got into the zone' });
  add({ at: t(10, 20), phase: 'short', plannedMin: 5, actualMin: 6 });
  add({ at: t(13, 30), phase: 'focus', plannedMin: 45, actualMin: 45, source: 'manual', board: 2, note: 'library, no phone' });
  add({ at: t(14, 40), phase: 'focus', plannedMin: 25, actualMin: 18, early: true, board: 0 });
  add({ at: t(16, 0), phase: 'focus', plannedMin: 50, actualMin: 62, overtimeMin: 12, pausedMin: 3, board: 1, mood: 'great' });
  add({ at: t(17, 5), phase: 'long', plannedMin: 15, actualMin: 15 });
  add({ at: t(20, 10), phase: 'focus', plannedMin: 25, actualMin: 25, board: 2, mood: 'good' });

  const days = [...new Set(sessions.map((s) => s.day))];
  const daily = days.map((d) => summarizeDay(d, sessions));

  // Memory joggers inside yesterday's unlogged gap.
  const events = [
    { type: 'app.open', ts: t(11, 42), data: {} },
    { type: 'app.background', ts: t(12, 5), data: {} },
    { type: 'app.open', ts: t(12, 58), data: {} },
  ] as AnyEvent[];

  const TASKS = ['Read chapter 3', 'Outline the essay', 'Fix that bug', 'Flashcards', 'Plan the week', 'Draft the intro', 'Reply to emails', 'Tidy the desk'];
  const tasks: Task[] = TASKS.map((title, i) => {
    const doneAt = i < 6 ? dayStart(addDays(todayStr, -1 - i)) + 15 * HOUR : undefined;
    return { id: `demo-t${i}`, title, done: !!doneAt, doneAt, createdAt: (doneAt ?? Date.now()) - 2 * DAY, boardId: boards.length ? boards[i % boards.length].id : undefined };
  });

  const stickers: Sticker[] = [
    { id: 'first-page', earnedAt: y - 6 * DAY },
    { id: 'in-the-flow', earnedAt: y - 3 * DAY },
    { id: 'found-time', earnedAt: t(9, 22) },
  ];

  return { sessions, daily, tasks, events, stickers };
}
