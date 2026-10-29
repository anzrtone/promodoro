/**
 * Dev-only stand-in for Android's notification shade: the dev platform drops what it would have
 * handed to the phone here, and NotificationShade.tsx draws it. Not part of any production path.
 */
import type { PlatformHandlers, ReportSpec, StatusSpec } from '@/platform/types';

export interface ShadeState {
  status: StatusSpec | null;
  /** When the status was last replaced (a native countdown restarts then, so the preview does too). */
  statusAt: number;
  report: ReportSpec | null;
  handlers: PlatformHandlers | null;
}

let state: ShadeState = { status: null, statusAt: 0, report: null, handlers: null };
const subs = new Set<() => void>();

export const getShade = () => state;

export function setShade(patch: Partial<ShadeState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function subscribeShade(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}
