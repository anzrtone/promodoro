/**
 * The user count: how the developer knows roughly how many people use the app. Once a day (at most) the
 * app sends a random id, the platform and the app version, and nothing else: no survey answers, no name,
 * no sessions, and the server stores no IP address. It is on by default, with an off switch in Settings
 * (turning it off deletes this install's row), and it is not tied to the sync code.
 * With no server configured (see config/api.ts) nothing is ever sent.
 */
import { API_BASE } from '@/config/api';
import { getSettings, updateSettings } from '@/db/settings';
import { platform } from '@/platform';

export interface PingPayload {
  v: 1;
  id: string;
  platform: string;
  appVersion: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function kind(): string {
  try {
    return platform().kind;
  } catch {
    return 'unknown';
  }
}

export const buildPing = (id: string): PingPayload => ({
  v: 1,
  id,
  platform: kind(),
  appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
});

async function post(fetchImpl: typeof fetch, url: string, body: unknown): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    return res.ok;
  } catch {
    return false; // offline or blocked: tomorrow
  } finally {
    clearTimeout(timer);
  }
}

/** Call on launch. Cheap and idempotent: sends at most once per day. */
export async function sendPing(fetchImpl: typeof fetch = fetch, base = API_BASE): Promise<void> {
  if (!base) return;
  const s = await getSettings();
  if (!s.pingEnabled || s.pingSentOn === today()) return;
  const id = s.pingId ?? crypto.randomUUID();
  if (!s.pingId) await updateSettings({ pingId: id });
  if (await post(fetchImpl, `${base}/ping`, buildPing(id))) await updateSettings({ pingSentOn: today() });
}

/** The Settings switch. Turning it off asks the server to forget this install and stops all future pings. */
export async function setPingEnabled(on: boolean, fetchImpl: typeof fetch = fetch, base = API_BASE): Promise<void> {
  const s = await getSettings();
  await updateSettings({ pingEnabled: on, ...(on ? {} : { pingSentOn: null }) });
  if (!on && base && s.pingId) await post(fetchImpl, `${base}/ping`, { v: 1, id: s.pingId, withdraw: true });
}
