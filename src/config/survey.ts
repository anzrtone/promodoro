/**
 * Where opted-in welcome-survey answers go. Set VITE_SURVEY_ENDPOINT at build time
 * (e.g. the Cloudflare Worker from scripts/survey-worker.js). Unset means nothing is ever sent:
 * answers still personalise the app, and consent is remembered for when an endpoint exists.
 *
 * Desktop builds also need the endpoint's origin in `connect-src` (src-tauri/tauri.conf.json).
 */
export const SURVEY_ENDPOINT: string | null = (import.meta.env.VITE_SURVEY_ENDPOINT as string | undefined)?.trim() || null;
