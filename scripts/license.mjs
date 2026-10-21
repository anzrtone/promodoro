#!/usr/bin/env node
/**
 * Offline supporter keys.
 *   npm run license:init                      create a key pair (once)
 *   npm run license:sign -- "Ada Lovelace"    issue a key for someone
 * The private key lives in .license/private.key — keep it secret and backed up.
 */
import nacl from 'tweetnacl';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = '.license';
const PRIV = `${DIR}/private.key`;
const b64url = (u8) => Buffer.from(u8).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') {
  if (existsSync(PRIV)) {
    console.error(`${PRIV} already exists — refusing to overwrite (existing keys would stop working).`);
    process.exit(1);
  }
  const kp = nacl.sign.keyPair();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(PRIV, b64url(kp.secretKey), { mode: 0o600 });
  const file = 'src/config/license.ts';
  const src = readFileSync(file, 'utf8').replace(/export const LICENSE_PUBLIC_KEY[^\n]*/, `export const LICENSE_PUBLIC_KEY: string | null = '${b64url(kp.publicKey)}';`);
  writeFileSync(file, src);
  console.log(`Key pair created.\n  private: ${PRIV} (git-ignored, BACK IT UP)\n  public:  written to ${file}`);
} else if (cmd === 'sign') {
  const name = rest.join(' ').trim();
  if (!name) {
    console.error('Usage: npm run license:sign -- "Name or email"');
    process.exit(1);
  }
  const sk = Buffer.from(readFileSync(PRIV, 'utf8').trim().replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const payload = Buffer.from(JSON.stringify({ n: name, t: 'supporter', d: new Date().toISOString().slice(0, 10) }));
  const sig = nacl.sign.detached(payload, new Uint8Array(sk));
  console.log(`PROMO-${b64url(payload)}.${b64url(sig)}`);
} else {
  console.log('Usage: license.mjs init | sign "Name"');
}
