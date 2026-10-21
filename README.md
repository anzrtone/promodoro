# 🍅 Promodoro

**Focus at your own pace.** A cozy, local-first focus timer for **Windows (desktop .exe)** and **Android (.apk)**, with an angelic tomato named Pomo.

> Your progress counts, even when your day isn't perfect.

Promodoro is the focus timer for people who want structure without pressure. It bends to how you actually work: it keeps counting when you're in the flow, recovers the time you forgot to track, and keeps an honest, judgment-free history that never leaves your device.

---

## What makes it different

| | |
|---|---|
| **Gentle Flow** | The timer chimes at zero and keeps counting, so flow time is never lost. It's recorded as `25:00 planned + 07:12 overtime`. |
| **Never lose worked time** | The **"I started 10 / 20 / 30 min ago"** chips (and *"…when my last session ended"*) backdate a start in one tap. **Turn the clock forward** adds time worked before you hit start. On the timeline, **drag across a dashed "unlogged" gap** to claim it. |
| **Honest labels** | Every minute is tagged *timed*, *adjusted*, *added by hand* or *imported*. Charts can filter by tag, so a 300 h import doesn't skew your daily average. Labels describe what happened and never judge. |
| **Memory joggers** | Gaps show hints like *"You opened Promodoro at 2:58"*, taken from the append-only event log. |
| **Truthful while asleep** | Timers are computed from timestamps and never "ticked". A countdown that finished while your phone slept is recorded at the exact second it ended, and Pomo gently says so instead of blaring. |
| **No streaks, ever** | A **Sticker Book** celebrates coming back after time away, resting, finishing early, and recovering time. Nothing can be "broken". |
| **Share my page** | Turn any day into a handwritten notebook-page PNG to post. It includes a small *"made with Promodoro"* footer, which works as word-of-mouth without a server. |
| **Desktop superpowers** | Tray icon with a live timer, close-to-tray, global **Ctrl+Alt+P**, a **sticky-note mode** (tiny always-on-top window), and Rust-side alarms that ring even when the window is hidden. |
| **Android done right** | Exact alarms through AlarmManager, a notification channel per alarm sound (WAVs rendered from the same synth), a quiet ongoing "running timer" notification with Pause/Done actions, and haptics. |
| **Your data, your device** | No account and no server (the only network call is an opt-in, anonymous welcome survey). Data lives in IndexedDB inside the app, with **automatic backups to a folder you own**, JSON/CSV export/import, and CSV import from Forest, Flow or spreadsheets with duplicate detection. |
| **Free core, cosmetic extras** | Timer, history, recovery, export and dark mode are free forever. Supporter keys (verified **offline** with Ed25519) unlock extra notebook themes and Pomo outfits. |

---

## Tech stack

- **React 18 + TypeScript + Vite**, **Tailwind CSS** with `@promodoro` design tokens as CSS variables (theme-swappable), and **lucide-react** icons
- **Dexie.js** (IndexedDB): an append-only event log plus projections
- **Web Audio**: procedural alarm sounds and ambient beds, with no sample files (`src/audio/synth.ts`)
- **Tauri 2** (Rust) for the desktop `.exe`
- **Capacitor 8** for the Android `.apk`
- Fonts (**Fredoka**, **Nunito**, **Caveat**) bundled via Fontsource, so the app works fully offline

## Project layout

```
src/
  engine/        Pure, platform-free TypeScript (fully unit-tested)
    types.ts       Domain + event types
    timer.ts       Event-sourced timer: fold, snapshot, crossing time, due events, session projection
    cycle.ts       Presets, rounds, suggested break (work ÷ ratio)
    timeline.ts    Lanes, gaps, memory anchors
    stats.ts csv.ts time.ts
  db/            Dexie schema, event store (atomic append + projections), settings, backup/import
  hooks/
    usePromodoroEngine.ts   Runtime: settle loop, auto-advance, clock guard, native alarm sync
  audio/         Synth (shared with the Android WAV renderer), alarm queue, ambient
  platform/      Native bridges: desktop.ts (Tauri), android.ts (Capacitor), dev.ts (browser dev only)
  features/      Auto-backup, stickers, license, toasts, navigation
  components/    PromodoroCard, Pomo (SVG), sheets, timeline pieces, share page
  screens/       Focus, Timeline, Stats, Stickers, Settings
src-tauri/       Rust shell: alarms.rs (scheduler), files.rs (atomic writes/backups), lib.rs (tray, mini mode, shortcut)
android/         Capacitor Android project (manifest, icons, res/raw alarm WAVs, signing config)
scripts/         render-sounds.ts, android-icons.py, license.mjs
tests/           Vitest: engine, CSV, timeline, DB projections, backups
```

### Database (IndexedDB via Dexie)

| Table | Key / indexes | Purpose |
|---|---|---|
| `events` | `++id, ts, type, timerId` | Append-only log of every action (start, pause, nudge, backfill, overtime, alarm, done, app open/resume, imports…). Never updated or deleted. |
| `timers` | `id, status` | Live projection of running/paused timers (rebuildable from `events`) |
| `sessions` | `id, start, end, day, phase, source, boardId, importKey, timerId` | Finished sessions: planned / actual / timed / recovered / paused / overtime kept separately, plus `source` |
| `daily` | `day` | Pre-computed per-day summaries for fast month/year views |
| `presets`, `boards`, `tasks`, `stickers`, `settings` | | Configuration and the light task layer |

Every write goes through `append()` in one transaction. If anything ever looks wrong, **Settings → Advanced → Rebuild from log** regenerates the sessions from the log.

---

## Develop

```bash
npm install
npm run dev            # UI in a browser at http://localhost:1420 (dev only; not a shipped target)
npm test               # unit tests
npm run typecheck
```

In the dev browser console, `await promodoroSeed()` fills the app with three weeks of demo history.

## Build the Windows .exe (Tauri)

Prerequisites (on Windows): [Rust](https://rustup.rs), Node 22, and the *Desktop development with C++* workload from Visual Studio Build Tools. WebView2 ships with Windows 10/11.

```bash
npm install
npm run desktop:dev        # run the desktop app with hot reload
npm run desktop:build      # = tauri build
```

Outputs:
- `src-tauri/target/release/bundle/nsis/Promodoro_<ver>_x64-setup.exe` (installer, per-user, no admin rights needed)
- `src-tauri/target/release/bundle/msi/Promodoro_<ver>_x64_en-US.msi`
- `src-tauri/target/release/promodoro.exe` (portable; runs directly)

To regenerate icons after changing the art: `npx tauri icon assets/icon-1024.png -o src-tauri/icons`.

## Build the Android .apk (Capacitor)

Prerequisites: Android Studio (or the command-line SDK), JDK 21, Node 22.

```bash
npm install
npm run android:sync       # build web assets + copy into android/
cd android
./gradlew assembleDebug    # → app/build/outputs/apk/debug/app-debug.apk (sideload this)
```

### Signed release APK

```bash
keytool -genkey -v -keystore promodoro.jks -alias promodoro -keyalg RSA -keysize 2048 -validity 10000
```

Create `android/keystore.properties` (git-ignored):

```properties
storeFile=/absolute/path/to/promodoro.jks
storePassword=…
keyAlias=promodoro
keyPassword=…
```

Then run `cd android && ./gradlew assembleRelease`, which produces `app/build/outputs/apk/release/app-release.apk`.

> **Keep the keystore safe and backed up.** Android only installs updates signed with the same key.

Other helpers: `npm run sounds` re-renders the alarm WAVs into `res/raw`, and `python3 scripts/android-icons.py` regenerates launcher icons and splash screens.

## CI: download builds without a local toolchain

`.github/workflows/build.yml` runs the tests, then builds:
- **promodoro-windows**: the setup `.exe`, `.msi` and portable `.exe`
- **promodoro-android**: the `.apk`. It's release-signed if these repository secrets are set: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 promodoro.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Otherwise it's a debug-signed APK.

Push a tag such as `v0.1.0` to attach both builds to a GitHub Release.

---

## Your data: zero hosting, user-owned

There is **no server and no database to host**, so it costs nothing to run. Each install keeps its own data in the app's private IndexedDB.

- **Automatic backups** (Settings → Your data):
  - **Desktop**: a dated `promodoro-backup-YYYY-MM-DD.json` goes into any folder you pick, and the newest N are kept. Pick a folder inside Dropbox, OneDrive or Google Drive and the user's own cloud keeps an off-device copy for free.
  - **Android**: backups go to `Documents/Promodoro`, which **survives uninstalling the app**. Google Drive, Syncthing or FolderSync can copy it elsewhere.
- **Restore** any backup on any device, either merged into the existing data or replacing it.
- **Uninstalling the Android app deletes its internal data**, and only backups survive. The app says this plainly and turning on auto-backup earns a sticker.
- Data doesn't sync between devices. Move it by exporting on one device and importing on the other.

## Welcome notebook & opt-in survey

On first launch Pomo walks through a short welcome notebook: your name (kept on the device, only Pomo uses it), **what you'll use Promodoro for** (this picks your starting subjects), **where you heard about it**, a starting rhythm with a live Gentle Flow demo, and then a quick tour of the Focus screen. People who already have sessions see a shorter version. All of it can be skipped, and Settings → **You & Pomo** lets people retake it.

Sharing the two survey answers is **opt-in, off by default, and anonymous**. The app sends only those answers plus a random install id, the platform and the app version, and shows the exact JSON before anyone opts in. It never sends the name, sessions, notes or subjects. Turning sharing off asks the endpoint to delete the row. Failed sends retry on the next launch.

To collect answers, deploy the tiny Cloudflare Worker in `scripts/survey-worker.js` (deploy steps are in its header) and build with:

```bash
VITE_SURVEY_ENDPOINT=https://promodoro-survey.<you>.workers.dev npm run build
```

The desktop CSP already allows `https://*.workers.dev`. If you host the endpoint anywhere else, add that origin to `connect-src` in `src-tauri/tauri.conf.json`. Without an endpoint nothing is sent: consent is remembered, and the answers still personalise the app.

## Supporter keys (monetisation without a server)

```bash
npm run license:init                     # once: creates .license/private.key (git-ignored) + writes the public key into src/config/license.ts
npm run license:sign -- "ada@example.com"  # prints PROMO-xxxx.yyyy, send it to the supporter
```

Sell or tip through Ko-fi, Gumroad or Lemon Squeezy and email the key. Set `SUPPORT_URL` in `src/screens/SettingsScreen.tsx`. Keys only unlock cosmetics; the core app is free forever.

## Principles

1. **One-tap usefulness**: no account, no setup wizard, no mandatory tasks.
2. **Honest data**: planned, actual, paused, recovered and imported time are always distinguishable.
3. **Gentle by default**: nothing turns a missed session into a failure state. Promodoro makes no medical claims.
