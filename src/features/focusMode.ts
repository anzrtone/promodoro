/**
 * Focus mode: the running timer, full screen, with everything else out of the way.
 * A tiny shared store so the timer card, keyboard shortcuts and auto-open can all reach it.
 */
import { useSyncExternalStore } from 'react';
import { navigate } from './nav';

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setFocusMode(on: boolean): void {
  if (open === on) return;
  open = on;
  // The overlay lives on the Focus screen (with the session-complete sheet), so go there first.
  if (on) navigate('focus');
  emit();
}

export const isFocusMode = () => open;

export function useFocusMode(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => open,
  );
}

/** Keep the screen on while focus mode is open (phones dim otherwise). Best effort. */
export function holdWakeLock(): () => void {
  let lock: { release(): Promise<void> } | null = null;
  let gone = false;
  const take = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (!wl || document.hidden) return;
      lock = await wl.request('screen');
      if (gone) void lock.release();
    } catch {
      /* not supported, or the system said no: the timer works regardless */
    }
  };
  // The system drops the lock when the app is hidden; take it again on return.
  const vis = () => !document.hidden && void take();
  void take();
  document.addEventListener('visibilitychange', vis);
  return () => {
    gone = true;
    document.removeEventListener('visibilitychange', vis);
    void lock?.release().catch(() => {});
  };
}
