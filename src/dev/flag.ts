/**
 * Dev-only switch for the preview account. It decides which IndexedDB the whole app opens, so it
 * is read once at load (before `db` exists) and flipping it reloads the page. In production builds
 * `import.meta.env.DEV` is false, so none of this is ever reachable.
 */
const KEY = 'promodoro-dev-preview';

export const PREVIEW_DB = 'promodoro-dev-preview';

export function previewOn(): boolean {
  if (!import.meta.env.DEV) return false;
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
