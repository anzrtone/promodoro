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

export const PROMO_DB = 'promodoro-promo';

/**
 * `?promo=1`: the filming mode for the trailer. A fresh, pre-filled notebook in its own database on
 * every load, with the dev panel and every network call left out so recordings come out clean.
 */
export function promoOn(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(location.search).get('promo') === '1';
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
