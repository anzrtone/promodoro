import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/api', () => ({ API_BASE: 'https://api.test' }));

import { buildBackup } from '@/db/backup';
import { db, flushTombstones } from '@/db/schema';
import { getSettings, updateSettings } from '@/db/settings';
import { addManualSession } from '@/db/repo';
import { MINUTE } from '@/engine/time';
import { buildPing, sendPing, setPingEnabled } from '@/features/ping';
import { decryptSnapshot, deriveKeys, encryptSnapshot, formatSyncCode, newSyncCode, normalizeSyncCode, WrongCodeError } from '@/sync/crypto';
import { syncNow } from '@/sync';

const T0 = Date.UTC(2026, 9, 21, 13, 0);

async function wipe() {
  await Promise.all(db.tables.filter((t) => t.name !== 'tombstones').map((t) => t.clear()));
  await flushTombstones();
  await db.tombstones.clear();
}

/** A stand-in for the Worker: blobs by id, plus a request log. */
function fakeServer() {
  const store = new Map<string, Uint8Array>();
  const log: string[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    log.push(`${method} ${u.pathname}`);
    const m = u.pathname.match(/^\/sync\/([0-9a-f]{32})$/);
    if (!m) return u.pathname === '/ping' ? new Response(null, { status: 204 }) : new Response('', { status: 404 });
    if (method === 'GET') return store.has(m[1]) ? new Response(store.get(m[1])! as BodyInit) : new Response('', { status: 404 });
    if (method === 'PUT') {
      store.set(m[1], new Uint8Array(await new Response(init!.body as BodyInit).arrayBuffer()));
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  });
  return { store, log, impl };
}

let server: ReturnType<typeof fakeServer>;
beforeEach(async () => {
  await wipe();
  server = fakeServer();
  vi.stubGlobal('fetch', server.impl);
});
afterEach(() => vi.unstubAllGlobals());

describe('sync codes & encryption', () => {
  it('makes 100-bit codes that survive typos in case, spacing and look-alike letters', () => {
    const code = newSyncCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    const norm = normalizeSyncCode(code)!;
    expect(formatSyncCode(norm)).toBe(code);
    expect(normalizeSyncCode(code.toLowerCase().replace(/-/g, ' '))).toBe(norm);
    expect(normalizeSyncCode('0000O-0000I-0000L-00000')).toBe('00000000010000100000'.slice(0, 20));
    expect(normalizeSyncCode('too short')).toBeNull();
  });

  it('round-trips a snapshot and refuses the wrong code', async () => {
    const a = await deriveKeys(newSyncCode());
    const b = await deriveKeys(newSyncCode());
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.id).not.toBe(b.id);
    const blob = await encryptSnapshot('{"hello":"wörld"}', a.key);
    expect(new TextDecoder().decode(blob)).not.toContain('hello');
    expect(await decryptSnapshot(blob, a.key)).toBe('{"hello":"wörld"}');
    await expect(decryptSnapshot(blob, b.key)).rejects.toBeInstanceOf(WrongCodeError);
  });
});

describe('relay sync between two devices', () => {
  const pair = async (code: string) => updateSettings({ sync: { ...(await getSettings()).sync, method: 'relay', code } });

  it('carries sessions, edits and deletes both ways, and skips needless uploads', async () => {
    const code = newSyncCode();

    // Device A: a session and a subject, then sync.
    await pair(code);
    await addManualSession({ start: T0, end: T0 + 25 * MINUTE, durationMs: 25 * MINUTE, phase: 'focus', kind: 'entry' });
    await db.boards.put({ id: 'b-read', name: 'Reading', color: '#123', order: 5 });
    const first = await syncNow();
    expect(first).toMatchObject({ status: 'ok', pushed: true });
    expect(server.store.size).toBe(1);
    const aState = await buildBackup();

    // Nothing changed: the second sync doesn't upload again.
    const puts = () => server.log.filter((l) => l.startsWith('PUT')).length;
    const before = puts();
    expect(await syncNow()).toMatchObject({ status: 'ok', pushed: false });
    expect(puts()).toBe(before);

    // Device B: fresh install, enters the code, syncs, and gets everything.
    await wipe();
    await pair(code);
    const onB = await syncNow();
    expect(onB).toMatchObject({ status: 'ok' });
    expect(await db.sessions.count()).toBe(1);
    expect((await db.boards.get('b-read'))?.name).toBe('Reading');
    expect((await db.daily.toArray())[0].focusMs).toBe(25 * MINUTE);

    // B renames the subject and deletes it from the notes; A syncs and sees B's change.
    await db.boards.update('b-read', { name: 'Reading list' });
    await syncNow();
    await wipe();
    await db.sessions.bulkPut(aState.sessions);
    await db.boards.bulkPut(aState.boards);
    await pair(code);
    await syncNow();
    expect((await db.boards.get('b-read'))?.name).toBe('Reading list');

    // A deletes the subject; B syncs twice and it stays gone.
    await db.boards.delete('b-read');
    await syncNow();
    await wipe();
    await pair(code);
    await db.boards.put({ id: 'b-read', name: 'Reading list', color: '#123', order: 5, updatedAt: 1 });
    await syncNow();
    await syncNow();
    expect(await db.boards.get('b-read')).toBeUndefined();
  });

  it('the server only ever sees ciphertext', async () => {
    await pair(newSyncCode());
    await db.boards.put({ id: 'b1', name: 'TopSecretSubject', color: '#123', order: 0 });
    await syncNow();
    const blob = [...server.store.values()][0];
    expect(new TextDecoder().decode(blob)).not.toContain('TopSecretSubject');
    expect(JSON.stringify(server.log)).not.toContain('TopSecret');
  });

  it('reports a wrong code instead of overwriting the other devices', async () => {
    await pair(newSyncCode());
    await syncNow();
    const stored = [...server.store.entries()][0];
    // Another pair's blob under this pair's id (e.g. a corrupted or foreign upload).
    const stranger = await deriveKeys(newSyncCode());
    const foreign = await encryptSnapshot('{}', stranger.key);
    server.store.set(stored[0], foreign);
    const res = await syncNow();
    expect(res.status).toBe('failed');
    expect((await getSettings()).sync.lastError).toMatch(/sync code/i);
    expect(server.store.get(stored[0])).toBe(foreign); // not overwritten
  });

  it('does nothing when sync is off', async () => {
    expect(await syncNow()).toEqual({ status: 'skipped', reason: 'off' });
    expect(server.impl).not.toHaveBeenCalled();
  });
});

describe('anonymous user count ping', () => {
  it('sends once a day with only an id, platform and version', async () => {
    await sendPing();
    await sendPing();
    const pings = server.impl.mock.calls.filter(([u]) => String(u).endsWith('/ping'));
    expect(pings).toHaveLength(1);
    const body = JSON.parse(String(pings[0][1]!.body));
    expect(Object.keys(body).sort()).toEqual(['appVersion', 'id', 'platform', 'v']);
    expect(body.id).toBe((await getSettings()).pingId);
  });

  it('keeps the same id across days and is idempotent within a day', async () => {
    await sendPing();
    const id = (await getSettings()).pingId!;
    await updateSettings({ pingSentOn: '2020-01-01' });
    await sendPing();
    expect((await getSettings()).pingId).toBe(id);
    expect(server.impl.mock.calls.filter(([u]) => String(u).endsWith('/ping'))).toHaveLength(2);
    expect(buildPing('x').v).toBe(1);
  });

  it('stops when switched off and asks the server to forget the install', async () => {
    await sendPing();
    const id = (await getSettings()).pingId!;
    server.impl.mockClear();
    await setPingEnabled(false);
    const calls = server.impl.mock.calls.filter(([u]) => String(u).endsWith('/ping'));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]!.body))).toEqual({ v: 1, id, withdraw: true });
    await sendPing();
    expect(server.impl.mock.calls.filter(([u]) => String(u).endsWith('/ping'))).toHaveLength(1);
  });
});
