import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { ensureSeeded, getSettings, updateSettings } from '@/db/settings';
import { exportJSON } from '@/db/backup';
import { applyUseSubjects, completeOnboarding, greeting, setSurveySharing } from '@/features/onboarding';
import { buildSurveyPayload, syncSurvey } from '@/features/survey';
import type { Session } from '@/engine/types';

const URL = 'https://survey.example.workers.dev';
const tick = () => new Promise((r) => setTimeout(r, 0));
const okFetch = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
const bodyOf = (f: ReturnType<typeof okFetch>, n = 0) => JSON.parse(f.mock.calls[n][1]!.body as string);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeeded();
});

const answers = { uses: ['code' as const, 'work' as const], usesOther: '', heardFrom: 'reddit' as const, heardOther: '' };

describe('starting subjects', () => {
  it('swaps the sample subjects for the ones you picked', async () => {
    const first = await applyUseSubjects(['code', 'admin']);
    const boards = await db.boards.orderBy('order').toArray();
    expect(boards.map((b) => b.name)).toEqual(['Coding', 'Life admin']);
    expect(first).toBe('b-code');
  });

  it('keeps a sample subject that already has sessions', async () => {
    await db.sessions.put({ id: 's1', boardId: 'b-study', start: 0, end: 1, day: '2026-01-01' } as Session);
    await applyUseSubjects(['write']);
    const names = (await db.boards.orderBy('order').toArray()).map((b) => b.name);
    expect(names).toEqual(['Writing', 'Study']);
  });

  it('turns "something else" into a subject', async () => {
    await applyUseSubjects(['other'], '  Knitting  ');
    expect((await db.boards.toArray()).map((b) => b.name)).toEqual(['Knitting']);
  });

  it('leaves everything alone when nothing was picked', async () => {
    expect(await applyUseSubjects([])).toBeNull();
    expect(await db.boards.count()).toBe(3);
  });
});

describe('completing the welcome notebook', () => {
  it('remembers the name and answers, and picks a subject', async () => {
    await completeOnboarding('full', { name: ' Ana ', ...answers, share: false, presetId: 'p-50-10' }, { tour: false });
    const s = await getSettings();
    expect(s.onboarded).toBe(true);
    expect(s.profile.name).toBe('Ana');
    expect(s.survey?.uses).toEqual(['code', 'work']);
    expect(s.presetId).toBe('p-50-10');
    expect(s.boardId).toBe('b-code');
    expect(s.installId).toBeNull(); // no id unless you opt in
  });

  it("doesn't touch subjects for people who already have sessions", async () => {
    await db.sessions.put({ id: 's1', start: 0, end: 1, day: '2026-01-01' } as Session);
    await completeOnboarding('returning', { name: 'Bo', ...answers, share: false });
    expect(await db.boards.count()).toBe(3);
  });
});

describe('survey sharing', () => {
  it('never includes the name', async () => {
    await completeOnboarding('full', { name: 'Ana', ...answers, share: true }, { tour: false });
    const payload = buildSurveyPayload(await getSettings(), 'desktop');
    expect(JSON.stringify(payload)).not.toContain('Ana');
    expect(payload).toMatchObject({ uses: ['code', 'work'], heardFrom: 'reddit', platform: 'desktop' });
  });

  it('sends nothing without consent', async () => {
    await completeOnboarding('full', { name: 'Ana', ...answers, share: false }, { tour: false });
    await tick();
    const f = okFetch();
    await syncSurvey(f as unknown as typeof fetch, URL);
    expect(f).not.toHaveBeenCalled();
  });

  it('sends once when opted in, then withdraws when turned off', async () => {
    await completeOnboarding('full', { name: 'Ana', ...answers, share: true }, { tour: false });
    await tick();
    const f = okFetch();
    await syncSurvey(f as unknown as typeof fetch, URL);
    await syncSurvey(f as unknown as typeof fetch, URL);
    expect(f).toHaveBeenCalledTimes(1);
    const sent = bodyOf(f);
    expect(sent.installId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await getSettings()).surveySentAt).not.toBeNull();

    await setSurveySharing(false);
    await tick();
    await syncSurvey(f as unknown as typeof fetch, URL);
    expect(bodyOf(f, 1)).toEqual({ v: 1, installId: sent.installId, withdraw: true });
    expect((await getSettings()).surveySentAt).toBeNull();
  });

  it('retries after a failed send', async () => {
    await completeOnboarding('full', { name: 'Ana', ...answers, share: true }, { tour: false });
    await tick();
    const down = vi.fn(async () => {
      throw new TypeError('offline');
    });
    await syncSurvey(down as unknown as typeof fetch, URL);
    expect((await getSettings()).surveySentAt).toBeNull();
    const f = okFetch();
    await syncSurvey(f as unknown as typeof fetch, URL);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('resends changed answers under the same id', async () => {
    await completeOnboarding('full', { name: 'Ana', ...answers, share: true }, { tour: false });
    await tick();
    const f = okFetch();
    await syncSurvey(f as unknown as typeof fetch, URL);
    await completeOnboarding('survey', { ...answers, uses: ['study'], share: true });
    await tick();
    await syncSurvey(f as unknown as typeof fetch, URL);
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 1).uses).toEqual(['study']);
    expect(bodyOf(f, 1).installId).toBe(bodyOf(f, 0).installId);
  });

  it('keeps the install id out of backups', async () => {
    await updateSettings({ installId: '00000000-0000-0000-0000-000000000000', surveySentAt: 1 });
    expect(await exportJSON()).not.toContain('00000000-0000-0000-0000-000000000000');
  });
});

describe('greeting', () => {
  it('uses the name, or "friend"', () => {
    expect(greeting('Ana', 9)).toBe('Good morning, Ana!');
    expect(greeting('  ', 20)).toBe('Good evening, friend!');
  });
});

describe('tour', () => {
  it('skips steps that point at things that were never made', async () => {
    const { tourTarget, tourText } = await import('@/features/tour');
    expect(tourTarget('folder:{folder}', {})).toBe('');
    expect(tourTarget('folder:{folder}', { folderId: 'f1' })).toBe('folder:f1');
    expect(tourTarget('stats-tiles', {})).toBe('stats-tiles');
    expect(tourText('Inside “{folder}”, {name}!', { folderName: 'School' }, '')).toBe('Inside “School”, friend!');
  });

  it('makes a folder, then a subject inside it, and moves on', async () => {
    const { makeForTour, setTourStep, startTour, suggestName, TOUR } = await import('@/features/tour');
    await updateSettings({ survey: { uses: ['study'], usesOther: '', heardFrom: null, heardOther: '', answeredAt: 1 } });
    expect(await suggestName('folder')).toBe('School');
    startTour();
    const folderStep = TOUR.findIndex((s) => s.make === 'folder');
    setTourStep(folderStep);
    await makeForTour('folder', '  ');
    await makeForTour('subject', 'Chemistry');
    const folder = (await db.folders.toArray())[0];
    expect(folder.name).toBe('School');
    const subject = (await db.boards.toArray()).find((b) => b.name === 'Chemistry');
    expect(subject?.folderId).toBe(folder.id);
    setTourStep(null);
  });
});

describe('welcome-tour sample notebook', () => {
  it('builds a varied history ending yesterday, with a show-and-tell day', async () => {
    const { buildDemo } = await import('@/features/demo');
    const { addDays } = await import('@/engine/time');
    const d = buildDemo('2026-10-21', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const yesterday = d.sessions.filter((s) => s.day === '2026-10-20');
    expect(yesterday.length).toBeGreaterThan(5);
    expect(new Set(d.sessions.map((s) => s.source))).toEqual(new Set(['timed', 'adjusted', 'manual', 'imported']));
    expect(d.sessions.some((s) => s.overtimeMs > 0)).toBe(true);
    expect(d.sessions.some((s) => s.endReason === 'early')).toBe(true);
    expect(d.sessions.every((s) => s.day < '2026-10-21')).toBe(true);
    expect(d.daily.length).toBeGreaterThan(20);
    expect(d.tasks.filter((t) => t.done && t.doneAt! >= Date.parse(addDays('2026-10-21', -8)))).toHaveLength(6);
    // Deterministic for a given day.
    expect(buildDemo('2026-10-21', [{ id: 'a' }]).sessions.length).toBe(buildDemo('2026-10-21', [{ id: 'a' }]).sessions.length);
  });

  it('lives in its own database and goes away when the tour ends', async () => {
    const { startDemo, stopDemo, viewDb } = await import('@/features/demo');
    await startDemo();
    const demo = viewDb();
    expect(demo).not.toBe(db);
    expect(await demo.sessions.count()).toBeGreaterThan(20);
    expect(await db.sessions.count()).toBe(0); // the real notebook is untouched
    expect((await demo.boards.toArray()).length).toBeGreaterThanOrEqual(3);
    await stopDemo();
    expect(viewDb()).toBe(db);
  });
});

describe('tour back button', () => {
  it('goes back a step, and passes over a folder step that was already done', async () => {
    const { getTourStep, makeForTour, setTourStep, startTour, tourBack, TOUR } = await import('@/features/tour');
    startTour('main');
    const folderStep = TOUR.findIndex((s) => s.make === 'folder');
    setTourStep(folderStep);
    await makeForTour('folder', 'School');
    // Now on the "here's your folder" step; Back skips the finished make-folder step.
    expect(getTourStep()).toBe(folderStep + 1);
    tourBack();
    expect(getTourStep()).toBe(folderStep - 1);
    tourBack();
    expect(getTourStep()).toBe(folderStep - 2);
    setTourStep(null);
  });
});

describe('tour sample data on replay', () => {
  it('a replayed tour shows the sample, and the real notebook is unchanged afterwards', async () => {
    const { setTourStep, startTour, TOUR } = await import('@/features/tour');
    const { viewDb } = await import('@/features/demo');
    await db.sessions.put({ id: 'mine', start: 0, end: 1, day: '2026-01-01', phase: 'focus', actualMs: 1 } as Session);
    startTour('main'); // what "Replay Pomo's tour" calls
    setTourStep(TOUR.findIndex((s) => s.screen === 'stats'));
    await new Promise((r) => setTimeout(r, 300));
    expect(viewDb()).not.toBe(db);
    expect(await viewDb().sessions.get('mine')).toBeUndefined(); // own data hidden during the tour
    setTourStep(null);
    await new Promise((r) => setTimeout(r, 50));
    expect(viewDb()).toBe(db);
    expect(await db.sessions.get('mine')).toBeDefined(); // and still there afterwards
  });
});
