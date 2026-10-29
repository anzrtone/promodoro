import { useLiveQuery } from 'dexie-react-hooks';

/** Last result per key, most recently written last. Small: it only has to cover the screens you flick between. */
const cache = new Map<string, unknown>();
const MAX = 80;

function remember(key: string, value: unknown) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX) cache.delete(cache.keys().next().value!);
}

/**
 * `useLiveQuery` that remembers its last result under `key`. Screens remount on every tab
 * switch, so without this each query first renders its empty default and the screen fills
 * in one query at a time. With it, the first frame already has the last known data and the
 * live query refreshes it quietly.
 *
 * `key` must name everything the query reads: the database and every dep.
 */
export function useCachedLiveQuery<T>(key: string, querier: () => Promise<T> | T, deps: unknown[], fallback: T): T {
  const seed = (cache.has(key) ? cache.get(key) : fallback) as T;
  return useLiveQuery(
    async () => {
      const value = await querier();
      remember(key, value);
      return value;
    },
    [key, ...deps],
    seed,
  );
}
