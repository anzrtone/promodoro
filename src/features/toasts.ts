import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'success' | 'sticker';
  stickerId?: string;
  action?: { label: string; run: () => void };
  ttl?: number;
  /** Set to true while the exit animation plays; the toast is removed from state after it completes. */
  exiting?: boolean;
}

let toasts: Toast[] = [];
let seq = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(t: Omit<Toast, 'id'>): number {
  const id = seq++;
  toasts = [...toasts.slice(-3), { ...t, id }];
  emit();
  setTimeout(() => dismissToast(id), t.ttl ?? (t.action ? 7000 : 4200));
  return id;
}

export function dismissToast(id: number) {
  const target = toasts.find((t) => t.id === id);
  if (!target || target.exiting) return; // already gone or already animating out
  toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t));
  emit();
  // Remove from state once the CSS exit animation (300 ms) has finished.
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 300);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => toasts,
  );
}
