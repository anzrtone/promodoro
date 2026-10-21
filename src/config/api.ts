/**
 * The one small server Promodoro can talk to (a Cloudflare Worker, see worker/). Only the official release
 * builds use the built-in address: CI sets VITE_OFFICIAL_BUILD=true for tagged builds in the upstream repo.
 * Dev, test and every fork or source build send nothing unless you point them at your own Worker with
 * VITE_API_URL at build time. VITE_API_URL=off forces a build that never touches the network.
 * The address is public: it ships inside the app.
 *
 * Desktop builds also need the origin in `connect-src` (src-tauri/tauri.conf.json); *.workers.dev is already there.
 * VITE_SURVEY_ENDPOINT is the old name and still works.
 */
const DEFAULT_API = 'https://promodoro-api.promodoro.workers.dev';

const env = ((import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.VITE_SURVEY_ENDPOINT as string | undefined))?.trim();
const official = import.meta.env.VITE_OFFICIAL_BUILD === 'true';
const raw = env !== undefined && env !== '' ? env : official ? DEFAULT_API : '';
export const API_BASE: string | null = raw === '' || raw.toLowerCase() === 'off' ? null : raw.replace(/\/+$/, '');
