/** Open/close state for the dev log sheet, so the pill, sidebar, toast and Settings can all open it. */
import { useSyncExternalStore } from 'react';

let state: { open: boolean } = { open: false };
const subs = new Set<() => void>();
const set = (open: boolean) => {
  state = { open };
  subs.forEach((f) => f());
};

export const openDevLog = () => set(true);
export const closeDevLog = () => set(false);

export function useDevLogOpen(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => state.open,
  );
}
