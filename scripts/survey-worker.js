/**
 * Cloudflare Worker that receives opted-in welcome-survey answers from Promodoro.
 *
 * Deploy:
 *   npx wrangler kv namespace create SURVEY
 *   # wrangler.toml: name = "promodoro-survey", main = "scripts/survey-worker.js",
 *   #                [[kv_namespaces]] binding = "SURVEY", id = "<id from above>"
 *   npx wrangler deploy
 * Then build the app with VITE_SURVEY_ENDPOINT=https://promodoro-survey.<you>.workers.dev
 * and add that origin to connect-src in src-tauri/tauri.conf.json.
 *
 * Read the answers:  npx wrangler kv key list --binding SURVEY
 *                    npx wrangler kv key get --binding SURVEY "r:<installId>"
 *
 * Stores one row per install id (a retake overwrites it, a withdrawal deletes it).
 * No IPs, user agents or other request metadata are stored.
 */
const USES = ['study', 'code', 'write', 'work', 'create', 'bodydouble', 'admin', 'other'];
const HEARD = ['friend', 'social', 'reddit', 'youtube', 'search', 'store', 'shared-page', 'other'];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

const reply = (status, body = '') => new Response(body, { status, headers: CORS });
const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 80) : undefined);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return reply(204);
    if (req.method !== 'POST') return reply(405);
    const raw = await req.text();
    if (raw.length > 4096) return reply(413);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      return reply(400);
    }
    if (b?.v !== 1 || typeof b.installId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.installId)) return reply(400);
    const key = `r:${b.installId}`;

    if (b.withdraw === true) {
      await env.SURVEY.delete(key);
      return reply(204);
    }

    const uses = Array.isArray(b.uses) ? [...new Set(b.uses.filter((u) => USES.includes(u)))] : [];
    const heardFrom = HEARD.includes(b.heardFrom) ? b.heardFrom : null;
    const row = {
      uses,
      usesOther: uses.includes('other') ? text(b.usesOther) : undefined,
      heardFrom,
      heardOther: heardFrom === 'other' ? text(b.heardOther) : undefined,
      platform: ['desktop', 'android', 'dev'].includes(b.platform) ? b.platform : 'unknown',
      appVersion: text(b.appVersion),
      answeredOn: /^\d{4}-\d{2}-\d{2}$/.test(b.answeredOn) ? b.answeredOn : undefined,
      receivedOn: new Date().toISOString().slice(0, 10),
    };
    await env.SURVEY.put(key, JSON.stringify(row));
    return reply(204);
  },
};
