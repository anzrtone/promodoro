import { useSyncExternalStore } from 'react';

export type Tab = 'focus' | 'subjects' | 'timeline' | 'stats' | 'stickers' | 'settings';

let state: { tab: Tab; day?: string; settingsSection?: string } = { tab: 'focus' };
const subs = new Set<() => void>();

export function navigate(tab: Tab, extra: { day?: string; settingsSection?: string } = {}) {
  state = { tab, ...extra };
  subs.forEach((f) => f());
}

export function useNav() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => state,
  );
}
