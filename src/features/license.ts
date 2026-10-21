/**
 * Offline supporter keys — monetisation without a server.
 *
 * Sell keys anywhere (Ko-fi, Gumroad, Lemon Squeezy…). Each key is a small JSON payload
 * signed with YOUR Ed25519 private key (scripts/license.mjs); the app verifies it with
 * the public key below. No network call, no account, no database to host.
 * Keys only unlock cosmetic extras — the core app is free forever.
 */
import nacl from 'tweetnacl';
import { LICENSE_PUBLIC_KEY } from '@/config/license';

export interface LicensePayload {
  /** Name or email the key was issued to. */
  n: string;
  /** Tier, e.g. "supporter". */
  t: string;
  /** Issue date, YYYY-MM-DD. */
  d: string;
}

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export function verifyLicense(key: string | null | undefined): LicensePayload | null {
  if (!key || !LICENSE_PUBLIC_KEY) return null;
  try {
    const [payload, sig] = key.trim().replace(/^PROMO-/, '').split('.');
    if (!payload || !sig) return null;
    const msg = b64urlToBytes(payload);
    const ok = nacl.sign.detached.verify(msg, b64urlToBytes(sig), b64urlToBytes(LICENSE_PUBLIC_KEY));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(msg)) as LicensePayload;
  } catch {
    return null;
  }
}

/** Dev builds unlock everything so cosmetics can be tested. */
export function isSupporter(key: string | null | undefined): boolean {
  return import.meta.env.DEV || verifyLicense(key) !== null;
}
