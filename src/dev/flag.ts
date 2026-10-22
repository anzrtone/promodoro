/**
 * Dev-only switch for the preview account. It decides which IndexedDB the whole app opens, so it
 * is read once at load (before `db` exists) and flipping it reloads the page. In production builds
 * `import.meta.env.DEV` is false, so none of this is ever reachable.
 */
const KEY = 'promodoro-dev-preview';

export const PREVIEW_DB = 'promodoro-dev-preview';
/** B-roll clips get their own throwaway notebook, re-seeded on every load so each take starts identical. */
export const BROLL_DB = 'promodoro-dev-broll';

/** `?broll=<clip>` runs a scripted screen-recording clip (see src/dev/broll). */
export function brollClip(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    return new URLSearchParams(location.search).get('broll');
  } catch {
    return null;
  }
}

export function previewOn(): boolean {
  if (!import.meta.env.DEV) return false;
  if (brollClip()) return true;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreview(on: boolean): void {
  if (!import.meta.env.DEV) return;
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to switch */
  }
}
