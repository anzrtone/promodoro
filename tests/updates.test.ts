import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/schema';
import { ensureSeeded, getSettings, updateSettings } from '@/db/settings';
import { compareVersions, isNewerVersion, parseVersion } from '@/engine/semver';
import { parseInline, parseNotes } from '@/features/releaseNotes';
import { checkForUpdates, currentVersion, dismissUpdate, newerRelease, parseRelease } from '@/features/updates';
import { DEVLOG } from '@/content/devlog';
import pkg from '../package.json';

const API = 'https://api.github.com/repos/o/r/releases/latest';
const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v9.9.9',
  name: 'Big one',
  html_url: 'https://github.com/o/r/releases/tag/v9.9.9',
  body: '- shiny',
  published_at: '2026-10-22T00:00:00Z',
  ...over,
});
const ok = (json: unknown) => vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => new Response(JSON.stringify(json), { status: 200 }));

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureSeeded();
});

describe('versions', () => {
  it('parses tags with or without v', () => {
    expect(parseVersion('v1.2.3')?.parts).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')?.parts).toEqual([1, 2, 0]);
    expect(parseVersion('nightly')).toBeNull();
  });
  it('orders them numerically, not as text', () => {
    expect(isNewerVersion('0.10.0', '0.9.5')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(isNewerVersion('garbage', '1.0.0')).toBe(false);
  });
});

describe('parseRelease', () => {
  it('keeps a normal release', () => {
    expect(parseRelease(release())).toMatchObject({ version: '9.9.9', name: 'Big one' });
  });
  it('ignores drafts, prereleases and off-site links', () => {
    expect(parseRelease(release({ draft: true }))).toBeNull();
    expect(parseRelease(release({ prerelease: true }))).toBeNull();
    expect(parseRelease(release({ html_url: 'https://evil.example/x' }))).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('checkForUpdates', () => {
  it('stores a newer release and reports it', async () => {
    const f = ok(release());
    expect(await checkForUpdates({ fetchImpl: f, api: API })).toBe('update');
    const s = await getSettings();
    expect(newerRelease(s)?.version).toBe('9.9.9');
    expect(f.mock.calls[0][1]!.credentials).toBe('omit');
  });
  it('reports current when the release is not newer', async () => {
    const f = ok(release({ tag_name: `v${currentVersion()}` }));
    expect(await checkForUpdates({ fetchImpl: f, api: API })).toBe('current');
    expect(newerRelease(await getSettings())).toBeNull();
  });
  it('checks at most once a day, unless forced', async () => {
    const f = ok(release());
    await checkForUpdates({ fetchImpl: f, api: API, now: 1_000_000_000 });
    expect(await checkForUpdates({ fetchImpl: f, api: API, now: 1_000_000_000 + 3600_000 })).toBe('skipped');
    expect(f).toHaveBeenCalledTimes(1);
    await checkForUpdates({ fetchImpl: f, api: API, now: 1_000_000_000 + 3600_000, force: true });
    expect(f).toHaveBeenCalledTimes(2);
    await checkForUpdates({ fetchImpl: f, api: API, now: 1_000_000_000 + 25 * 3600_000 });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('sends nothing when switched off or when no repo is configured', async () => {
    const f = ok(release());
    await updateSettings({ updateCheck: false });
    expect(await checkForUpdates({ fetchImpl: f, api: API })).toBe('skipped');
    await updateSettings({ updateCheck: true });
    expect(await checkForUpdates({ fetchImpl: f, api: null })).toBe('skipped');
    expect(f).not.toHaveBeenCalled();
  });
  it('fails quietly and retries next launch', async () => {
    const down = vi.fn(async () => Promise.reject(new Error('offline')));
    expect(await checkForUpdates({ fetchImpl: down as unknown as typeof fetch, api: API })).toBe('failed');
    const limited = vi.fn(async () => new Response('', { status: 403 }));
    expect(await checkForUpdates({ fetchImpl: limited, api: API })).toBe('failed');
    expect((await getSettings()).updateCheckedAt).toBe(0);
  });
  it('remembers a dismissal per version', async () => {
    await checkForUpdates({ fetchImpl: ok(release()), api: API });
    await dismissUpdate('9.9.9');
    expect((await getSettings()).dismissedUpdate).toBe('9.9.9');
  });
});

describe('release notes', () => {
  it('reads headings, bullets and paragraphs', () => {
    expect(parseNotes('## New\n- one\n* two\n\nhello\nworld')).toEqual([
      { type: 'h', text: 'New' },
      { type: 'li', text: 'one' },
      { type: 'li', text: 'two' },
      { type: 'p', text: 'hello world' },
    ]);
  });
  it('never produces markup or links', () => {
    expect(parseInline('a **b** `c` [d](https://x.example) <img src=x onerror=1>')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', code: true },
      { text: ' d <img src=x onerror=1>' },
    ]);
  });
});

describe('dev log content', () => {
  it('has a page for the version in package.json, newest first', () => {
    expect(DEVLOG[0].version).toBe(pkg.version);
    for (let i = 1; i < DEVLOG.length; i++) expect(isNewerVersion(DEVLOG[i - 1].version, DEVLOG[i].version)).toBe(true);
  });
});
