import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'success' | 'sticker';
  stickerId?: string;
  action?: { label: string; run: () => void };
  ttl?: number;
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
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
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
