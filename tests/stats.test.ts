import { describe, expect, it } from 'vitest';
import { bucketDays, bySubject, focusPeriods, goalDays, hourBySource, sessionShape, subjectTree, tasksDone, weekHourGrid } from '@/engine/stats';
import { HOUR, MINUTE } from '@/engine/time';
import type { Board, Folder, Session, Task } from '@/engine/types';

const MON = Date.UTC(2026, 9, 19); // Monday 2026-10-19, tz 0
const S = (o: Partial<Session> & { start: number; actualMs: number }): Session => ({
  id: Math.random().toString(36),
  end: o.start + o.actualMs,
  tz: 0,
  day: new Date(o.start).toISOString().slice(0, 10),
  phase: 'focus',
  plannedMs: 25 * MINUTE,
  timedMs: o.actualMs,
  recoveredMs: 0,
  pausedMs: 0,
  overtimeMs: 0,
  source: 'timed',
  endReason: 'complete',
  createdAt: 0,
  ...o,
});
const ALL = ['timed', 'adjusted', 'manual', 'imported'] as const;

describe('weekHourGrid', () => {
  it('splits sessions across hour and weekday boundaries', () => {
    const g = weekHourGrid(
      [
        S({ start: MON + 9.5 * HOUR, actualMs: HOUR }), // Mon 9:30–10:30
        S({ start: MON + 23.5 * HOUR, actualMs: HOUR }), // Mon 23:30 → Tue 00:30
        S({ start: MON + 9 * HOUR, actualMs: HOUR, bulk: true }),
      ],
      [...ALL],
    );
    expect(g[0][9]).toBe(30 * MINUTE);
    expect(g[0][10]).toBe(30 * MINUTE);
    expect(g[0][23]).toBe(30 * MINUTE);
    expect(g[1][0]).toBe(30 * MINUTE);
    expect(g.flat().reduce((a, b) => a + b)).toBe(2 * HOUR);
  });
});

describe('bucketDays', () => {
  it('groups by Monday weeks and by month', () => {
    const days = ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-31', '2026-11-01'];
    expect(bucketDays(days, 'week').map((b) => [b.key, b.days.length])).toEqual([
      ['2026-10-12', 2],
      ['2026-10-19', 1],
      ['2026-10-26', 2],
    ]);
    expect(bucketDays(days, 'month').map((b) => b.key)).toEqual(['2026-10', '2026-11']);
  });
});

describe('sessionShape', () => {
  it('counts full vs early, medians, pauses and breaks', () => {
    const shape = sessionShape(
      [
        S({ start: MON, actualMs: 25 * MINUTE }),
        S({ start: MON + HOUR, actualMs: 15 * MINUTE, endReason: 'early', pausedMs: 6 * MINUTE }),
        S({ start: MON + 2 * HOUR, actualMs: 20 * MINUTE, endReason: 'early' }),
        S({ start: MON + 3 * HOUR, actualMs: 80 * MINUTE, mode: 'countup', plannedMs: 0 }),
        S({ start: MON + 5 * HOUR, actualMs: 5 * MINUTE, phase: 'short' }),
        S({ start: MON, actualMs: 300 * HOUR, bulk: true }),
      ],
      [...ALL],
    );
    expect(shape.count).toBe(4);
    expect(shape.targeted).toBe(3);
    expect(shape.ranFull).toBe(1);
    expect(shape.wrappedEarly).toBe(2);
    expect(shape.medianActualMs).toBe(20 * MINUTE);
    expect(shape.medianPlannedMs).toBe(25 * MINUTE);
    expect(shape.longestMs).toBe(80 * MINUTE);
    expect(shape.breakMs).toBe(5 * MINUTE);
    expect(shape.pausedPerHourMs).toBeCloseTo((6 / 140) * HOUR); // 6 min over 140 min of focus
  });
});

describe('subjectTree', () => {
  const folders: Folder[] = [
    { id: 'school', name: 'School', color: '#111', order: 0 },
    { id: 'sem1', name: 'Sem 1', color: '#222', parentId: 'school', order: 0 },
  ];
  const boards: Board[] = [
    { id: 'math', name: 'Math', color: '#333', folderId: 'sem1', order: 0 },
    { id: 'art', name: 'Art', color: '#444', order: 1 },
  ];
  const tasks: Task[] = [
    { id: 'hw', title: 'Homework', done: false, boardId: 'math', createdAt: 0 },
    { id: 'read', title: 'Reading', done: false, folderId: 'school', createdAt: 0 },
  ];

  it('rolls time up folder → subject → task and drops empty branches', () => {
    const tree = subjectTree(
      [
        S({ start: MON, actualMs: HOUR, boardId: 'math', taskId: 'hw' }),
        S({ start: MON + 2 * HOUR, actualMs: 30 * MINUTE, taskId: 'hw' }), // subject inferred from task
        S({ start: MON + 86400000, actualMs: 20 * MINUTE, taskId: 'read' }), // folder-level task
        S({ start: MON, actualMs: 10 * MINUTE }), // nothing attached
      ],
      [...ALL],
      { boards, folders, tasks, bucketOf: (d) => (d === '2026-10-19' ? 0 : 1), buckets: 2 },
    );
    expect(tree.map((n) => [n.name, n.ms])).toEqual([
      ['School', 110 * MINUTE],
      ['No subject', 10 * MINUTE],
    ]);
    const school = tree[0];
    expect(school.trend).toEqual([90 * MINUTE, 20 * MINUTE]);
    expect(school.children.map((n) => n.name)).toEqual(['Sem 1', 'Reading']);
    const math = school.children[0].children[0];
    expect([math.name, math.ms, math.sessions]).toEqual(['Math', 90 * MINUTE, 2]);
    expect(math.children.map((n) => [n.name, n.ms])).toEqual([['Homework', 90 * MINUTE]]);
  });
});

describe('focusPeriods', () => {
  it('places blocks in minutes and splits at midnight', () => {
    const p = focusPeriods(
      [S({ start: MON + 9 * HOUR, actualMs: 30 * MINUTE, boardId: 'math' }), S({ start: MON + 23 * HOUR, actualMs: 2 * HOUR })],
      [...ALL],
    );
    expect(p.get('2026-10-19')).toEqual([
      { from: 540, to: 570, boardId: 'math' },
      { from: 1380, to: 1440, boardId: undefined },
    ]);
    expect(p.get('2026-10-20')).toEqual([{ from: 0, to: 60, boardId: undefined }]);
  });
});

describe('bySubject, tasksDone, goalDays', () => {
  it('aggregates', () => {
    expect(bySubject([S({ start: MON, actualMs: HOUR, boardId: 'a' }), S({ start: MON, actualMs: 2 * HOUR }), S({ start: MON, actualMs: HOUR, boardId: 'a' })], [...ALL])).toEqual([
      { boardId: 'a', ms: 2 * HOUR },
      { boardId: '', ms: 2 * HOUR },
    ]);
    const t = (doneAt?: number): Task => ({ id: String(doneAt), title: '', done: !!doneAt, doneAt, createdAt: 0 });
    expect(tasksDone([t(MON + 12 * HOUR), t(MON - 2 * 86400000), t()], '2026-10-19', '2026-10-25')).toBe(1);
    const sum = { day: '2026-10-19', focusMs: HOUR, breakMs: 0, overtimeMs: 0, sessions: 1, bySource: { timed: HOUR, adjusted: 0, manual: 0, imported: 0 } };
    expect(goalDays(['2026-10-19', '2026-10-20'], new Map([[sum.day, sum]]), [...ALL], 2 * HOUR).map((g) => g.ratio)).toEqual([0.5, 0]);
  });
});

describe('hourBySource', () => {
  it('spreads worked time over the wall-clock span so a paused session still adds up', () => {
    // 9:30–11:30 on the clock, 30 min of it paused → 90 min worked, spread over 3 hours.
    const s = S({ start: MON + 9.5 * HOUR, actualMs: 90 * MINUTE, end: MON + 11.5 * HOUR, pausedMs: 30 * MINUTE });
    const h = hourBySource([s, S({ start: MON + 14 * HOUR, actualMs: HOUR, source: 'manual' })], [...ALL]);
    expect(h[9].timed + h[10].timed + h[11].timed).toBeCloseTo(90 * MINUTE);
    expect(h[10].timed).toBeCloseTo(45 * MINUTE);
    expect(h[14].manual).toBe(HOUR);
    expect(hourBySource([s], ['manual']).every((x) => x.timed === 0)).toBe(true);
  });
});
