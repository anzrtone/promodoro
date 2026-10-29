/**
 * Promodoro's one tiny server, as a Cloudflare Worker. It never sees a name, a session, a note or a
 * subject. Three jobs, each on its own route:
 *
 *   POST   /survey      opt-in welcome-survey answers, one row per random install id (D1)
 *   POST   /ping        the user count: random id + platform + version, once a day (D1)
 *   GET    /sync/:id    the encrypted device-sync snapshot for a pairing id (R2) — ciphertext only
 *   PUT    /sync/:id    always needs the write token (x-sync-token)
 *   DELETE /sync/:id
 *
 * Setup is in worker/README.md. No IPs, user agents or other request metadata are stored.
 */
const USES = ['study', 'code', 'write', 'work', 'create', 'bodydouble', 'admin', 'other'];
const HEARD = ['friend', 'social', 'reddit', 'youtube', 'search', 'store', 'shared-page', 'other'];
const PLATFORMS = ['desktop', 'android', 'dev'];

/** Biggest sync snapshot accepted (bytes). A few years of daily use is well under 5 MB. */
const MAX_SYNC_BYTES = 20 * 1024 * 1024;
/** A snapshot nobody has touched for this long is treated as gone (also set an R2 lifecycle rule; see README). */
const SYNC_TTL_MS = 60 * 24 * 60 * 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-token',
  'access-control-max-age': '86400',
};

const reply = (status, body = null, headers = {}) => new Response(body, { status, headers: { ...CORS, ...headers } });
const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : null);
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const today = () => new Date().toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return reply(204);
    const { pathname } = new URL(req.url);
    try {
      // Writes only. The address is handed to the limiter and never stored. No limiter bound (tests, local) = no limit.
      if (req.method !== 'GET' && env.LIMITER) {
        const { success } = await env.LIMITER.limit({ key: req.headers.get('cf-connecting-ip') ?? 'unknown' });
        if (!success) return reply(429, null, { 'retry-after': '60' });
      }
      if (pathname === '/survey') return await survey(req, env);
      if (pathname === '/ping') return await ping(req, env);
      const m = pathname.match(/^\/sync\/([0-9a-f]{32})$/);
      if (m) return await sync(req, env, m[1]);
      if (pathname === '/') return reply(200, 'promodoro api');
      return reply(404);
    } catch (err) {
      console.error(err);
      return reply(500);
    }
  },
};

async function readJson(req, limit = 4096) {
  if (req.method !== 'POST') return null;
  const raw = await req.text();
  if (raw.length > limit) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function survey(req, env) {
  if (req.method !== 'POST') return reply(405);
  const b = await readJson(req);
  if (!b || b.v !== 1 || !isUuid(b.installId)) return reply(400);

  if (b.withdraw === true) {
    await env.DB.prepare('DELETE FROM survey WHERE install_id = ?').bind(b.installId).run();
    return reply(204);
  }
  const uses = Array.isArray(b.uses) ? [...new Set(b.uses.filter((u) => USES.includes(u)))] : [];
  const heardFrom = HEARD.includes(b.heardFrom) ? b.heardFrom : null;
  await env.DB.prepare(
    `INSERT INTO survey (install_id, uses, uses_other, heard_from, heard_other, platform, app_version, answered_on, received_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(install_id) DO UPDATE SET uses = excluded.uses, uses_other = excluded.uses_other,
       heard_from = excluded.heard_from, heard_other = excluded.heard_other, platform = excluded.platform,
       app_version = excluded.app_version, answered_on = excluded.answered_on, received_on = excluded.received_on`,
  )
    .bind(
      b.installId,
      uses.join(','),
      uses.includes('other') ? text(b.usesOther) : null,
      heardFrom,
      heardFrom === 'other' ? text(b.heardOther) : null,
      PLATFORMS.includes(b.platform) ? b.platform : 'unknown',
      text(b.appVersion),
      /^\d{4}-\d{2}-\d{2}$/.test(b.answeredOn) ? b.answeredOn : null,
      today(),
    )
    .run();
  return reply(204);
}

async function ping(req, env) {
  if (req.method !== 'POST') return reply(405);
  const b = await readJson(req, 1024);
  if (!b || b.v !== 1 || !isUuid(b.id)) return reply(400);

  if (b.withdraw === true) {
    await env.DB.prepare('DELETE FROM installs WHERE id = ?').bind(b.id).run();
    return reply(204);
  }
  const day = today();
  await env.DB.prepare(
    `INSERT INTO installs (id, platform, app_version, first_seen, last_seen, days_seen)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET platform = excluded.platform, app_version = excluded.app_version,
       days_seen = days_seen + (CASE WHEN last_seen <> excluded.last_seen THEN 1 ELSE 0 END),
       last_seen = excluded.last_seen`,
  )
    .bind(b.id, PLATFORMS.includes(b.platform) ? b.platform : 'unknown', text(b.appVersion), day, day)
    .run();
  return reply(204);
}

const sha256Hex = async (s) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Every write and delete needs the write token. The first write claims the id; after that only the same
 * token is accepted. Only the token's hash is stored, in the object's metadata. A snapshot with no stored
 * hash (written before tokens existed) can be claimed by the first token that arrives.
 * Returns the hash to store when allowed, or null when refused.
 */
async function authorizeWrite(req, env, key) {
  const token = req.headers.get('x-sync-token');
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return null;
  const given = await sha256Hex(token.toLowerCase());
  const head = await env.SYNC.head(key);
  const owner = head?.customMetadata?.tokenHash ?? null;
  return owner && owner !== given ? null : given;
}

async function sync(req, env, id) {
  const key = `s/${id}`;
  if (req.method === 'GET') {
    const obj = await env.SYNC.get(key);
    if (!obj) return reply(404);
    if (Date.now() - obj.uploaded.getTime() > SYNC_TTL_MS) {
      await env.SYNC.delete(key);
      return reply(404);
    }
    return reply(200, obj.body, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
  }
  if (req.method === 'PUT') {
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_SYNC_BYTES) return reply(413);
    const body = await req.arrayBuffer();
    if (body.byteLength > MAX_SYNC_BYTES) return reply(413);
    if (body.byteLength < 14) return reply(400);
    const hash = await authorizeWrite(req, env, key);
    if (!hash) return reply(403);
    await env.SYNC.put(key, body, { customMetadata: { tokenHash: hash } });
    return reply(204);
  }
  if (req.method === 'DELETE') {
    if (!(await authorizeWrite(req, env, key))) return reply(403);
    await env.SYNC.delete(key);
    return reply(204);
  }
  return reply(405);
}
