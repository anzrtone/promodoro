/**
 * Where the app looks for new releases, and how to reach the developer from the dev log.
 *
 * Like the Worker (config/api.ts), the release check runs only in official release builds (tagged builds of
 * the upstream repo). Dev runs, tests and forks never touch the network for it unless you build with
 * VITE_UPDATE_REPO=<owner/name>. VITE_UPDATE_REPO=off, or VITE_API_URL=off, forces a build that never checks.
 * The check is one unauthenticated GET to api.github.com; desktop builds need that origin in `connect-src`
 * (src-tauri/tauri.conf.json).
 */
export const UPSTREAM_REPO = 'anzrtone/promodoro';

const env = (import.meta.env.VITE_UPDATE_REPO as string | undefined)?.trim();
const official = import.meta.env.VITE_OFFICIAL_BUILD === 'true' && import.meta.env.MODE !== 'test';
const offSwitch = env?.toLowerCase() === 'off' || (import.meta.env.VITE_API_URL as string | undefined)?.trim().toLowerCase() === 'off';

/** `owner/name`, or null when this build never checks. */
export const UPDATE_REPO: string | null = offSwitch ? null : env ? env : official ? UPSTREAM_REPO : null;

export const RELEASES_API = UPDATE_REPO ? `https://api.github.com/repos/${UPDATE_REPO}/releases/latest` : null;
export const RELEASES_URL = `https://github.com/${UPDATE_REPO ?? UPSTREAM_REPO}/releases/latest`;
export const ISSUES_URL = `https://github.com/${UPSTREAM_REPO}/issues`;
export const CONTACT_EMAIL = 'ranzarsharif@gmail.com';
export const DISCORD_HANDLE = '@arvenine';
export const DISCORD_INVITE = 'https://discord.gg/k8pcRZkeEp';
export const SUPPORT_URL = 'https://www.supportkori.com/anzar';
