/**
 * "A new release is out" — once a day (at most) the app asks GitHub for the latest published release and
 * remembers it. Nothing is sent but the request itself (GitHub sees an IP address, like any web request;
 * the Promodoro Worker never sees it). There is no auto-install: the pill links to the release page.
 * With no repo configured (see config/updates.ts) or the switch off in About, nothing is ever requested.
 */
import { RELEASES_API } from '@/config/updates';
import { getSettings, updateSettings, useSettings, type AppSettings, type ReleaseInfo } from '@/db/settings';
import { cleanVersion, isNewerVersion } from '@/engine/semver';
import { DAY } from '@/engine/time';

export const currentVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0');

/** Turn GitHub's release JSON into what we keep. Drafts, prereleases and anything unreadable are ignored. */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) return null;
  if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null;
  if (!r.html_url.startsWith('https://github.com/')) return null;
  return {
    version: cleanVersion(r.tag_name),
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 120) : cleanVersion(r.tag_name),
    url: r.html_url,
    body: typeof r.body === 'string' ? r.body.slice(0, 8000) : '',
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
  };
}

/** The cached release, if it is newer than the running build. */
export function newerRelease(s: Pick<AppSettings, 'latestRelease'>, current = currentVersion()): ReleaseInfo | null {
  const r = s.latestRelease;
  return r && isNewerVersion(r.version, current) ? r : null;
}

export type CheckResult = 'update' | 'current' | 'skipped' | 'failed';

/**
 * Ask GitHub for the latest release. Without `force` it respects the Settings switch and the once-a-day limit.
 * A failed check (offline, rate limit) is quietly tried again next launch.
 */
export async function checkForUpdates(opts: { force?: boolean; fetchImpl?: typeof fetch; api?: string | null; now?: number } = {}): Promise<CheckResult> {
  const api = opts.api === undefined ? RELEASES_API : opts.api;
  if (!api) return 'skipped';
  const now = opts.now ?? Date.now();
  const s = await getSettings();
  if (!opts.force && (!s.updateCheck || now - s.updateCheckedAt < DAY)) return 'skipped';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(api, {
      headers: { accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return 'failed';
    const release = parseRelease(await res.json());
    await updateSettings({ updateCheckedAt: now, ...(release ? { latestRelease: release } : {}) });
    return release && isNewerVersion(release.version, currentVersion()) ? 'update' : 'current';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export const dismissUpdate = (version: string) => updateSettings({ dismissedUpdate: version });

/** What the pill and banners read: the newer release, plus whether the user already waved it away. */
export function useUpdate(): { release: ReleaseInfo | null; visible: boolean } {
  const s = useSettings();
  const release = newerRelease(s);
  return { release, visible: !!release && s.dismissedUpdate !== release.version };
}
