import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module, deployed as-is
import worker from '../worker/index.js';

/** Just enough of D1 and R2 to run the real Worker and the real schema.sql against SQLite / a Map. */
function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('worker/schema.sql', 'utf8'));
  const objects = new Map<string, { body: ArrayBuffer; uploaded: Date }>();
  const DB = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({ run: async () => void sqlite.prepare(sql).run(...(args as never[])) }),
      };
    },
  };
  const SYNC = {
    get: async (k: string) => (objects.has(k) ? { body: objects.get(k)!.body, uploaded: objects.get(k)!.uploaded } : null),
    put: async (k: string, body: ArrayBuffer) => void objects.set(k, { body, uploaded: new Date() }),
    delete: async (k: string) => void objects.delete(k),
  };
  return { env: { DB, SYNC }, sqlite, objects };
}

const call = (env: unknown, path: string, init?: RequestInit) => worker.fetch(new Request(`https://api.test${path}`, init), env) as Promise<Response>;
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
const ID = '123e4567-e89b-12d3-a456-426614174000';

let t: ReturnType<typeof makeEnv>;
beforeEach(() => void (t = makeEnv()));

describe('worker: /ping', () => {
  it('counts one install once per day and bumps days_seen on a new day', async () => {
    expect((await call(t.env, '/ping', json({ v: 1, id: ID, platform: 'android', appVersion: '1.2.0' }))).status).toBe(204);
    await call(t.env, '/ping', json({ v: 1, id: ID, platform: 'android', appVersion: '1.2.0' }));
    let row = t.sqlite.prepare('SELECT * FROM installs').all() as Array<Record<string, unknown>>;
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ platform: 'android', app_version: '1.2.0', days_seen: 1 });

    t.sqlite.prepare("UPDATE installs SET last_seen = '2020-01-01'").run();
    await call(t.env, '/ping', json({ v: 1, id: ID, platform: 'android', appVersion: '1.3.0' }));
    row = t.sqlite.prepare('SELECT * FROM installs').all() as Array<Record<string, unknown>>;
    expect(row[0]).toMatchObject({ app_version: '1.3.0', days_seen: 2 });
  });

  it('deletes on withdraw, rejects junk, and stores nothing else', async () => {
    await call(t.env, '/ping', json({ v: 1, id: ID, platform: 'desktop', appVersion: '1', extra: 'ignored' }));
    await call(t.env, '/ping', json({ v: 1, id: ID, withdraw: true }));
    expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM installs').get()).toEqual({ n: 0 });
    expect((await call(t.env, '/ping', json({ v: 1, id: 'nope' }))).status).toBe(400);
    expect((await call(t.env, '/ping', { method: 'GET' })).status).toBe(405);
  });
});

describe('worker: /survey', () => {
  const answers = { v: 1, installId: ID, uses: ['study', 'bogus', 'study'], heardFrom: 'reddit', platform: 'desktop', appVersion: '1.0', answeredOn: '2026-10-21' };

  it('upserts by install id and filters unknown options', async () => {
    expect((await call(t.env, '/survey', json(answers))).status).toBe(204);
    await call(t.env, '/survey', json({ ...answers, uses: ['code'], heardFrom: 'friend' }));
    const rows = t.sqlite.prepare('SELECT * FROM survey').all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ uses: 'code', heard_from: 'friend', platform: 'desktop' });
  });

  it('withdraws', async () => {
    await call(t.env, '/survey', json(answers));
    await call(t.env, '/survey', json({ v: 1, installId: ID, withdraw: true }));
    expect(t.sqlite.prepare('SELECT COUNT(*) AS n FROM survey').get()).toEqual({ n: 0 });
  });
});

describe('worker: /sync', () => {
  const id = 'a'.repeat(32);
  const blob = new Uint8Array(40).fill(7);

  it('stores, returns and deletes an opaque blob', async () => {
    expect((await call(t.env, `/sync/${id}`)).status).toBe(404);
    expect((await call(t.env, `/sync/${id}`, { method: 'PUT', body: blob })).status).toBe(204);
    const got = await call(t.env, `/sync/${id}`);
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(blob);
    expect(got.headers.get('access-control-allow-origin')).toBe('*');
    await call(t.env, `/sync/${id}`, { method: 'DELETE' });
    expect((await call(t.env, `/sync/${id}`)).status).toBe(404);
  });

  it('rejects bad ids, tiny bodies and answers CORS preflight', async () => {
    expect((await call(t.env, '/sync/short', { method: 'PUT', body: blob })).status).toBe(404);
    expect((await call(t.env, `/sync/${id}`, { method: 'PUT', body: new Uint8Array(3) })).status).toBe(400);
    const pre = await call(t.env, `/sync/${id}`, { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('treats a snapshot older than 60 days as gone', async () => {
    await call(t.env, `/sync/${id}`, { method: 'PUT', body: blob });
    t.objects.get(`s/${id}`)!.uploaded = new Date(Date.now() - 61 * 24 * 3600 * 1000);
    expect((await call(t.env, `/sync/${id}`)).status).toBe(404);
    expect(t.objects.size).toBe(0);
  });
});
