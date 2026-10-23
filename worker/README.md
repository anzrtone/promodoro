# Promodoro API (Cloudflare Worker)

One small Worker does three things. It is optional: without it the app still works fully, minus
the survey upload, the anonymous user count and device sync over the internet (shared-folder and
file sync need no server at all).

| Route | What | Stored in |
|---|---|---|
| `POST /survey` | opt-in welcome-survey answers | D1 table `survey` |
| `POST /ping` | the user count: random id, platform, version, once a day, on by default with an off switch in Settings (which sends `withdraw` to delete the row) | D1 table `installs` |
| `GET/PUT/DELETE /sync/:id` | encrypted device-sync snapshot, opaque to the server | R2 bucket `promodoro-sync` |

Everything fits in Cloudflare's free tier. No IPs or user agents are stored.

## One-time setup

From this folder (`worker/`), signed in with `npx wrangler login`:

```bash
npx wrangler d1 create promodoro
```

Copy the `database_id` it prints into `wrangler.toml`, then:

```bash
npx wrangler d1 execute promodoro --remote --file=schema.sql
npx wrangler r2 bucket create promodoro-sync
npx wrangler r2 bucket lifecycle add promodoro-sync expire-60d --expire-days 60
npx wrangler deploy
```

`deploy` prints the Worker's URL (`https://promodoro-api.<you>.workers.dev`). The app's built-in default is in `src/config/api.ts` (currently `https://promodoro-api.promodoro.workers.dev`).
Change it there if you deploy under another name. The default is used only by official release builds
(CI sets `VITE_OFFICIAL_BUILD=true` for tagged builds of the upstream repo). Dev runs, tests, forks and
other source builds send nothing unless you build with `VITE_API_URL=<your worker url>`
(`VITE_API_URL=off` forces a build that never uses the network).

The 60-day lifecycle rule means a pair's snapshot disappears if no device syncs for 60 days. Every sync
rewrites it, so active pairs never expire.

## Reading your numbers

```bash
# Users who opened the app in the last 30 days, and all-time
npx wrangler d1 execute promodoro --remote --command "SELECT COUNT(*) AS active_30d FROM installs WHERE last_seen >= date('now','-30 day')"
npx wrangler d1 execute promodoro --remote --command "SELECT COUNT(*) AS all_time FROM installs"

# By platform and version
npx wrangler d1 execute promodoro --remote --command "SELECT platform, app_version, COUNT(*) FROM installs GROUP BY 1,2 ORDER BY 3 DESC"

# New installs per day
npx wrangler d1 execute promodoro --remote --command "SELECT first_seen, COUNT(*) FROM installs GROUP BY 1 ORDER BY 1 DESC LIMIT 30"

# Survey: what people use it for / how they heard
npx wrangler d1 execute promodoro --remote --command "SELECT heard_from, COUNT(*) FROM survey GROUP BY 1 ORDER BY 2 DESC"
npx wrangler d1 execute promodoro --remote --command "SELECT uses, COUNT(*) FROM survey GROUP BY 1 ORDER BY 2 DESC"
```

Every install counts, because the daily ping can't be switched off (it's anonymous: a random id, platform and
version). Reinstalling or clearing app data makes a new id, so the count is slightly high. If someone asks you
to delete their data, the ping id lives in their app only; a `POST /ping` with `{"v":1,"id":"<id>","withdraw":true}`
removes the row.

## Notes

- Desktop builds can reach `*.workers.dev` already (`connect-src` in `src-tauri/tauri.conf.json`). If you
  put the Worker on a custom domain, add that origin there too.
- **Write token.** The app derives a 64-hex token from the pairing code (separately from the encryption key) and
  sends it as `x-sync-token` on `PUT`/`DELETE`. The first write claims the id; the Worker stores only the token's
  SHA-256 in the object's metadata and answers 403 to anyone else. Snapshots written by older app versions have no
  token and stay writable until a newer app claims them. Reads stay open (the blob is ciphertext).
- **Rate limit.** `wrangler.toml` binds the Workers Rate Limiting API as `LIMITER`: 20 writes a minute per address
  (the address goes to the limiter in memory and is never stored). Over the limit gets a 429. If your wrangler
  version or plan rejects the `[[ratelimits]]` block, delete it; the Worker skips the check when it isn't bound.
  Dashboard WAF rate-limiting rules are a separate, plan-dependent feature. The free plan's daily request cap is the
  last backstop: abuse can at worst pause the API until the next day, not run up a bill.
