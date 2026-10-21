/**
 * Encryption for the relay. The pairing code is the secret: a relay id and an AES-256-GCM key are both
 * derived from it, so the server only ever sees an opaque id and ciphertext. Whoever has the code can
 * read and write the shared snapshot; nobody else, including whoever runs the server, can.
 *
 * Wire format: [version byte][12-byte IV][ciphertext]. Version 2 gzips the JSON before encrypting.
 */

// Crockford base32 (no I, L, O, U), so a code read aloud or typed by hand is hard to get wrong.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 20; // 20 × 5 bits = 100 bits of entropy
const enc = new TextEncoder();
const dec = new TextDecoder();

export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]);
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-');
}

/** Upper-case, drop separators, fix look-alikes. Returns null unless it is a full valid code. */
export function normalizeSyncCode(input: string): string | null {
  const c = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (c.length !== CODE_LEN || [...c].some((ch) => !ALPHABET.includes(ch))) return null;
  return c;
}

export const formatSyncCode = (normalized: string) => normalized.match(/.{1,5}/g)!.join('-');

export interface SyncKeys {
  /** Opaque 32-hex id the server stores the snapshot under. */
  id: string;
  key: CryptoKey;
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const norm = normalizeSyncCode(code);
  if (!norm) throw new Error("That doesn't look like a sync code.");
  const base = await crypto.subtle.importKey('raw', enc.encode(norm), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('promodoro-sync-v1'), info: enc.encode(info) });
  const idBits = await crypto.subtle.deriveBits(params('id'), base, 128);
  const key = await crypto.subtle.deriveKey(params('key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id: toHex(new Uint8Array(idBits)), key };
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encryptSnapshot(json: string, key: CryptoKey): Promise<Uint8Array> {
  let body: Uint8Array = enc.encode(json);
  let version = 1;
  if (typeof CompressionStream !== 'undefined') {
    body = await pipe(body, new CompressionStream('gzip'));
    version = 2;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body as BufferSource));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = version;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

export class WrongCodeError extends Error {}

export async function decryptSnapshot(blob: Uint8Array, key: CryptoKey): Promise<string> {
  const version = blob[0];
  if ((version !== 1 && version !== 2) || blob.length < 14) throw new WrongCodeError('That sync data is not readable (is it from a newer Promodoro?).');
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(1, 13) }, key, blob.slice(13) as BufferSource));
  } catch {
    throw new WrongCodeError("Couldn't unlock the synced data. Double-check the sync code.");
  }
  if (version === 2) body = await pipe(body, new DecompressionStream('gzip'));
  return dec.decode(body);
}
