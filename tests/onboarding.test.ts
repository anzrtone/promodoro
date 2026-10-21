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
