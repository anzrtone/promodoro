# Promodoro B-roll: shot list & recording specs

Screen-recording overlays for the "Promodoro: everyone gets pro" talking-head video. Every clip runs the
**real app** in dev mode on the pre-filled preview notebook (profile name **Anzar**), scripted by
`src/dev/broll/clips.ts`. Taps, flicks, typing and drags go through real DOM events, so what you see is
the actual UI doing its actual thing.

## Step 1: Shot list

| # | Script cue / feature | Visual action on the phone | Interaction trigger | Clip | Length |
|---|---|---|---|---|---|
| 1 | "So I have built Promodoro… everyone gets pro… get out of here with your paywalls." | Focus tab. Pomo says "Good morning, Anzar!". A flick down shows today's tasks, then back up. **Start focus** opens full-screen focus mode with the ring ticking. | Flick, flick, tap | `intro` | ~13 s |
| 2 | "View all the graphs and analytics: bar graphs, pie charts, heat maps, useful insights… all for free." | Stats tab, switch to **30 days**. The page glides through the bar chart, the "Where the time went" donut, the "When you focus" heat map and "How sessions go". | Tab tap, chip tap, 4 timed scrolls | `stats` | ~15 s |
| 3 | "All of the data lives on your device, so you can export it out with a click of a button…" | Settings → fling down to **Export & restore** ("Everything lives only on this device"). Tap **Export backup (JSON)**, then **Export sessions (CSV)**. Two "Exported ✓" toasts. | Tab tap, flings, 2 taps | `export` | ~12 s |
| 4 | "Bring in any of the past data… your past sessions… hours you've tracked on a different app…" | Timeline → **Import history…** → **Import CSV (Forest, Flow, spreadsheets)**. A Forest export opens in the wizard with its columns guessed and a preview. Scroll to "220 new sessions (138h)", tap **Import 220 sessions**: toast "Welcome home!" plus the "Moving in" sticker. Then Stats → **Year**, where the imported months fill the chart. | Taps, sheet scroll, tab, chip, scroll | `import` | ~24 s |
| 5 | "Synchronize your data across all devices with the click of a button. So simple to set up." | Settings → **Sync** → **Cloud folder** → **Use Google Drive** → **Sync now**. The spinner turns, then "Brought in 5 new sessions." | 5 taps | `sync` | ~9 s |
| 6 | "Never worry about forgetting… retroactively add any session manually… through the timeline mode." | Timeline day strip. The finger drags across a dashed "unlogged" gap while a time bubble shows the range. The **Claim this time** sheet opens; type "Lecture review", pick **Calculus**, tap **Add 50m**. The claimed block appears, with toast and sticker. | Drag, type, 2 taps | `timeline` | ~13 s |
| 7 | "Pomodoros are just so outdated… Gentle Flow mode… keep the timer running in overtime… won't miss a single second." | Focus: **forgot to start? → custom… → 24 min ago → Go** gives a 25-min session with 1:00 left. The clock speeds to **0:00**, then flips to the yellow **+00:20 · "25:00 planned + 00:20 overtime"** and Pomo says "Ooh, flow state! I'll keep counting." It keeps climbing to **+07:10**. | Taps, typing, clock warp | `flow` | ~23 s |
| 8 | "A bunch of other nifty features, like a task system, folder management…" | Subjects tab: the University ▸ Biology folder tree. Tap **Anatomy** to open its sheet, type the task "Flashcards: muscles of the arm" + Enter, then tick it off. | Tab, tap, type, tap | `subjects` | ~10 s |
| 9 | "Stop giving your money over… all of this can be free… my GitHub, or send me a DM." | Fast tour: Stats (scroll), Subjects, Timeline, back to Focus, then **Start focus**. Ends on the ticking card. | Tab taps, scroll, tap | `outro` | ~20 s |
| ★ | Whole script | All of the above back to back in one take. | — | `reel` | ~2 min |

Lengths are at `pace=1`. Use `--pace 1.15` (or `&pace=1.15`) to stretch every beat to a slower read.

## Step 2: Implementation & recording

### Where the code lives

| File | What it does |
|---|---|
| `src/dev/broll/director.ts` | The "thumb": touch indicator (dot, press, ripple), `tap`, momentum `scroll`/`reveal`, `drag`, human-paced `type`, and `warpClock` (runs the app clock fast so the bell arrives without a minute of dead air). |
| `src/dev/broll/clips.ts` | One async script per shot above, with its beats timed to the narration. |
| `src/dev/broll/index.ts` | Boot hook: a fresh copy of the preview notebook for every take (`promodoro-dev-broll` IndexedDB), clip settings (silent, focus mode only for `intro`), and stand-ins for native pieces: no download dialog on export, a Google Drive folder and "phone" data for sync, and a Forest CSV for the file picker. |
| `src/dev/flag.ts`, `src/db/schema.ts`, `src/main.tsx` | `?broll=<clip>` switches it on. **The DEV · preview pill is never mounted** in B-roll mode. |
| `scripts/record-broll.mjs` | Headless recorder: CDP screencast (JPEG q95) encoded with real frame timestamps to H.264 MP4. |
| `broll/index.html` | Control room: phone frame plus clip buttons for live capture with OBS, with a "Clean" green-screen mode. |

All of it is dev-only. `brollClip()` returns `null` unless `import.meta.env.DEV`, so production builds never touch it.

### Clean production UI
- **DEV pill:** not mounted when `?broll` is set (`main.tsx`). The recorder also injects CSS that hides it.
- **No scrollbars, no cursor:** injected by `installStage()`.
- **No onboarding, sync tour, update pill or ping:** already off in the preview seed.
- **Silent:** alarms are muted. The voice-over carries the audio.

### Record
```bash
npm run dev                                   # terminal 1 (port 1420)
npm run broll:record                          # all clips → broll/out/<clip>.mp4 (1080×1920, 9:16, 60 fps)
npm run broll:record -- flow timeline --pace 1.1
npm run broll:record -- --size 2160x3840      # 4K 9:16
npm run broll:record -- --tz Europe/London    # pin the phone's timezone
```
This needs Playwright (`npm i -D playwright`, or a global install) and `ffmpeg` on PATH.

### Record live instead (OBS / QuickTime)
Open `broll/index.html` and click a clip. Capture the 414×736 (9:16) screen, or tick **Clean** for a borderless
screen on green. You can also open `http://localhost:1420/?broll=stats` directly in a 414×736 (9:16) device-mode window.

### Notes for the edit
- Clips are 9:16 (a 414×736 phone screen rendered at 1080×1920), so they fill a vertical timeline with no bars.
- Data is relative to "now": today's sessions sit 3 h and 90 min before the phone's clock. The recorder automatically runs the phone in a timezone where it's early afternoon, so the timeline always has gaps to claim, whatever time you record. For live capture, record during the day.
- Each take re-seeds its own notebook. Re-running a clip gives the same result, and your real or preview notebook is never touched.
- Toasts and sticker pop-ups ("Welcome home!", "Moving in") are real app feedback. They make good punch-in points.
