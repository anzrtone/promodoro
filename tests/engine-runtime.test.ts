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
  vibrate: () => undefined,
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
});
