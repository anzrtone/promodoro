/**
 * The one thing Promodoro ever sends anywhere, and only if you opt in: your welcome-survey
 * answers, keyed by a random install id. Never your name, sessions, notes or subjects.
 *
 * Sync is idempotent and retried on every launch:
 *   sharing on  + answers not sent yet → send (the endpoint upserts by install id)
 *   sharing off + answers were sent    → ask the endpoint to delete them
 */
import { SURVEY_ENDPOINT } from '@/config/survey';
import { getSettings, updateSettings, type AppSettings, type HeardId, type UseId } from '@/db/settings';
import { platform } from '@/platform';

export interface SurveyPayload {
  v: 1;
  installId: string;
  uses: UseId[];
  usesOther?: string;
  heardFrom: HeardId | null;
  heardOther?: string;
  platform: string;
  appVersion: string;
  /** Day only (YYYY-MM-DD): no time of day, no timezone. */
  answeredOn: string;
}

const clip = (s: string) => s.trim().slice(0, 80);

/** Exactly what would be sent: also shown to the user before they opt in. */
export function buildSurveyPayload(s: Pick<AppSettings, 'survey' | 'installId'>, kind = safeKind()): SurveyPayload | null {
  if (!s.survey) return null;
  const { uses, usesOther, heardFrom, heardOther, answeredAt } = s.survey;
  return {
    v: 1,
    installId: s.installId ?? '(a random id, made when you opt in)',
    uses,
    ...(uses.includes('other') && clip(usesOther) ? { usesOther: clip(usesOther) } : {}),
    heardFrom,
    ...(heardFrom === 'other' && clip(heardOther) ? { heardOther: clip(heardOther) } : {}),
    platform: kind,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    answeredOn: new Date(answeredAt).toISOString().slice(0, 10),
  };
}

function safeKind(): string {
  try {
    return platform().kind;
  } catch {
    return 'unknown';
  }
}

export function newInstallId(): string {
  return crypto.randomUUID();
}

let inflight: Promise<void> | null = null;

/** Bring the endpoint in line with the user's choice. Safe to call any time; failures retry next launch. */
export function syncSurvey(fetchImpl: typeof fetch = fetch, endpoint = SURVEY_ENDPOINT): Promise<void> {
  inflight ??= run(fetchImpl, endpoint).finally(() => (inflight = null));
  return inflight;
}

async function run(fetchImpl: typeof fetch, endpoint: string | null): Promise<void> {
  if (!endpoint) return;
  const s = await getSettings();
  if (!s.installId) return;
  if (s.shareSurvey && s.survey && !s.surveySentAt) {
    const payload = buildSurveyPayload(s);
    if (payload && (await post(fetchImpl, endpoint, payload))) await updateSettings({ surveySentAt: Date.now() });
  } else if (!s.shareSurvey && s.surveySentAt) {
    if (await post(fetchImpl, endpoint, { v: 1, installId: s.installId, withdraw: true })) await updateSettings({ surveySentAt: null });
  }
}

async function post(fetchImpl: typeof fetch, endpoint: string, body: unknown): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    return res.ok;
  } catch {
    return false; // offline, blocked, or timed out: try again next launch
  } finally {
    clearTimeout(timer);
  }
}
