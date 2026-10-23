/**
 * Runtime integration: the "phone slept through it all" scenario. With auto-advance on,
 * a focus session, its break and the next focus must chain at their true instants.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { ensureSeeded, updateSettings } from '@/db/settings';
import { MINUTE } from '@/engine/time';
import { __setPlatform } from '@/platform';
import type { AlarmSpec, Platform } from '@/platform/types';

const synced: AlarmSpec[][] = [];
const buzzes: string[] = [];
const fake: Platform = {
  kind: 'dev',
  nativeAlarmSound: () => false,
  backupFolderPickable: false,
  init: async () => undefined,
  syncAlarms: async (a) => void synced.push(a),
  setStatus: async () => undefined,
  requestNotificationPermission: async () => true,
  saveExport: async () => null,
  saveBinary: async () => null,
  vibrate: (k) => void buzzes.push(k),
  pickBackupFolder: async () => null,
  defaultBackupFolder: async () => null,
  writeBackup: async () => ({ path: '', pruned: 0 }),
  readSyncFiles: async () => [],
  writeSyncFile: async () => '',
};

beforeAll(() => {
  Object.assign(globalThis, { document: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  __setPlatform(fake);
});

describe('engine runtime', () => {
  it('chains focus → break → focus at the exact instants while asleep', async () => {
    const { engine } = await import('@/hooks/usePromodoroEngine');
    await ensureSeeded();
    await updateSettings({ autoAdvance: true, silent: true, breakMode: 'countdown' });
    await engine.start();
    const t0 = Date.now() - 40 * MINUTE;
    await engine.startTimer({ phase: 'focus', mode: 'countdown', minutes: 25, at: t0, round: 1, presetId: 'p-25-5' });
    await engine.settle();

    const sessions = await db.sessions.orderBy('start').toArray();
    expect(sessions.map((s) => s.phase)).toEqual(['focus', 'short']);
    expect(sessions[0].end).toBe(t0 + 25 * MINUTE);
    expect(sessions[1].start).toBe(t0 + 25 * MINUTE);
    expect(sessions[1].end).toBe(t0 + 30 * MINUTE);

    const live = engine.getState().timers;
    expect(live).toHaveLength(1);
    expect(live[0].phase).toBe('focus');
    expect(live[0].createdAt).toBe(t0 + 30 * MINUTE);
    expect(live[0].round).toBe(2);
    // The finished-while-away focus is surfaced gently, not rung.
    expect(engine.getState().notices.length).toBeGreaterThan(0);
    // The new focus' alarm was handed to the native scheduler.
    expect(synced.at(-1)?.[0]?.at).toBe(t0 + 55 * MINUTE);
  });

  it('drops a "kept counting" notice once its timer is done', async () => {
    const { engine } = await import('@/hooks/usePromodoroEngine');
    for (const t of engine.getState().timers) await engine.discard(t.id);
    engine.getState().notices.forEach((n) => engine.dismissNotice(n.id));
    await updateSettings({ autoAdvance: false });
    const id = await engine.startTimer({ phase: 'focus', mode: 'overtime', minutes: 25, at: Date.now() - 40 * MINUTE });
    await engine.settle();
    expect(engine.getState().notices.filter((n) => n.timerId === id && !n.stopped)).toHaveLength(1);
    await engine.done(id);
    expect(engine.getState().notices.filter((n) => n.timerId === id)).toHaveLength(0);
  });

  it('follows the overtime alert setting for timers that keep counting', async () => {
    const { engine } = await import('@/hooks/usePromodoroEngine');
    await updateSettings({ silent: false, vibrate: true, overtimeAlert: 'vibrate' });
    // Let the settings live query catch up.
    await new Promise((r) => setTimeout(r, 20));
    const flow = await engine.startTimer({ phase: 'focus', mode: 'overtime', minutes: 25 });
    let spec = synced.at(-1)!.find((a) => a.id === flow)!;
    expect(spec).toMatchObject({ silent: true, vibrate: true, quiet: false });

    // An on-time crossing buzzes but never queues a sound.
    buzzes.length = 0;
    await engine.adjust(flow, 25 * MINUTE);
    expect(buzzes).toContain('alarm');
    expect(engine.getState().ringing).toBe(false);
    await engine.done(flow);

    await updateSettings({ overtimeAlert: 'none' });
    await new Promise((r) => setTimeout(r, 20));
    const quiet = await engine.startTimer({ phase: 'focus', mode: 'overtime', minutes: 25 });
    spec = synced.at(-1)!.find((a) => a.id === quiet)!;
    expect(spec).toMatchObject({ silent: true, vibrate: false, quiet: true });
    await engine.done(quiet);

    // A plain countdown still rings.
    const strict = await engine.startTimer({ phase: 'focus', mode: 'countdown', minutes: 25 });
    spec = synced.at(-1)!.find((a) => a.id === strict)!;
    expect(spec).toMatchObject({ silent: false, quiet: false });
    await engine.discard(strict);
  });

  it('moves a running session, and its subject-less task, to another subject', async () => {
    const { engine } = await import('@/hooks/usePromodoroEngine');
    const { addTask } = await import('@/db/folders');
    await new Promise((r) => setTimeout(r, 20));
    const taskId = await addTask('Loose one', null);
    const id = await engine.startTimer({ phase: 'focus', mode: 'countdown', minutes: 25 });
    await engine.resubject(id, 'b-code', taskId);
    const t = engine.getState().timers.find((x) => x.id === id)!;
    expect(t).toMatchObject({ boardId: 'b-code', label: 'Coding', taskId });
    expect(await db.tasks.get(taskId)).toMatchObject({ boardId: 'b-code', today: true });
    await engine.discard(id);
  });
});
