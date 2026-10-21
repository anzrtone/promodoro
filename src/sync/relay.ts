/** Thin client for the relay in worker/: one opaque, encrypted blob per pairing id. */
import { API_BASE } from '@/config/api';

export class RelayError extends Error {}

async function call(path: string, init: RequestInit, fetchImpl: typeof fetch, base: string | null): Promise<Response> {
  if (!base) throw new RelayError('Sync over the internet is not set up in this build.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    return await fetchImpl(`${base}${path}`, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new RelayError("Couldn't reach the sync server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

/** The stored blob, or null when this pair has nothing there yet (or it expired). */
export async function relayGet(id: string, fetchImpl: typeof fetch = fetch, base = API_BASE): Promise<Uint8Array | null> {
  const res = await call(`/sync/${id}`, { method: 'GET' }, fetchImpl, base);
  if (res.status === 404) return null;
  if (!res.ok) throw new RelayError(`The sync server said ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function relayPut(id: string, blob: Uint8Array, fetchImpl: typeof fetch = fetch, base = API_BASE): Promise<void> {
  const res = await call(`/sync/${id}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: blob as BodyInit }, fetchImpl, base);
  if (res.status === 413) throw new RelayError('Your data is too big for the sync server. Use a cloud folder instead.');
  if (!res.ok) throw new RelayError(`The sync server said ${res.status}.`);
}

export async function relayDelete(id: string, fetchImpl: typeof fetch = fetch, base = API_BASE): Promise<void> {
  const res = await call(`/sync/${id}`, { method: 'DELETE' }, fetchImpl, base);
  if (!res.ok && res.status !== 404) throw new RelayError(`The sync server said ${res.status}.`);
}
