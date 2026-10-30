# Master prompt: Promodoro 30s trailer (cloud session)

> Paste everything below the line into the cloud Claude Code session. It must start from a branch
> that already has the `?promo=1` filming mode (src/dev/flag.ts `promoOn()`).

---

You're making a **30-second, 9:16 motion-graphics trailer** for Promodoro, the app in this repo: a cozy, local-first focus timer for Windows and Android (React 18 + TypeScript + Vite + Tailwind). Viewers should understand what the app is about in 30 seconds. **Pomo**, the angelic tomato mascot, takes them on a tour of the real app as it's being used.

Work on the branch `promo/trailer`. Put everything in a new top-level `promo/` folder with its own `package.json`, so the app's own dependencies stay untouched. Commit as you go and push the branch. Never commit to `main`.

## Hard rules (don't break these)

1. **Format:** 1080×1920, 60 fps, exactly 30.0 s. 9:16 only, with no other aspect ratios.
2. **Pomo is the SVG component `src/components/Pomo.tsx`**, imported directly. Never use the sticker art (`src/assets/stickers/*`, `assets/pomo-*.png|webp`) as the guide. The sticker images may only appear inside the app's own Sticker Book screen, since that's real app UI.
3. **Free messaging has to stay true.** Use exactly "Every feature. Free forever." Never write "nothing is paid", "no paywalls" or "100% free". The Graph Paper, Sakura and Kraft themes and the Pomo outfits/accessories are supporter-only cosmetics, so **never show them**. Only the **Classic** and **Midnight** themes appear, and Pomo wears no accessory.
4. **Show the real app.** Every app shot is a capture of the real app running in filming mode. Don't redraw or mock up app screens.
5. **No music in the repo.** The music is a Pixabay track and the repo is public, so it never gets committed. Render the video **without music**, but cut it to the music's grid (see "Music grid"). The music gets mixed in locally afterwards.
6. Brand and artwork (the Promodoro name, Pomo, icons) are © the owner. Using them in this trailer is the point, but don't publish anything anywhere.

## Brand system (all from the app)

- **Colours** (from `tailwind.config.js` and `src/styles/index.css`):
  - crème `#FDFBF7`, paper `#F5EFE0`, tomato `#EE6B6E`, leaf `#52B788`, halo `#FFE893`, margin pink `#F4A2A2`, rule sand `#E5DFD1`
  - ink `#2D312E`, never black
  - Shadows are soft and warm only, like the `lift` shadow `0 10px 30px -16px rgb(45 49 46 / .25)`.
- **Type** (Fontsource packages are already in node_modules):
  - **Fredoka 600** for 1–3 word headline punches
  - **Patrick Hand** for Pomo's handwritten captions
  - **Nunito** for small print
- **Background:** the notebook page, the same as `.bg-notebook` in `tailwind.config.js`: crème, a sand rule every 28 px and a pink margin rule. Add very light paper grain.
- **Motion:**
  - Springs on the app's `pop` curve `cubic-bezier(.2,.9,.3,1.3)`, with the `pageIn` drift (`translateX(18px) rotate(0.6deg)` → none).
  - Transitions between features are paper page-turns.
  - No hard cuts, whip pans or glitch effects.
  - Camera moves are slow push-ins on the part of the UI being shown.
- **Pomo moods** (`PomoMood`): happy, focused, flow, sleepy, cheering, puzzled, shy. Use them as the beat sheet says. The wings flap, the halo bobs and sparkles twinkle, all from the component itself.
- **Taps:** a soft halo-yellow ripple. The app is shown on a phone, so there's no mouse cursor.
- **Tone:** cozy, gentle, judgment-free. "Your progress counts, even when your day isn't perfect."

## Layout (9:16)

- The app plays inside a clean, minimal **Android phone frame** that's about 70% of the frame height. Draw it in CSS: a rounded body in ink at 90% and a thin bezel.
- **Captions** go in the top third.
- **Pomo** hovers along the edges of the phone and sometimes in front of it.
- **Safe zones:** nothing important in the bottom 20% (y > 1536) or the right 140 px. That's where TikTok, Reels and Shorts put their own UI.
- The desktop app appears once, as a small tilted window, in the "everywhere" beat. Capture it at a 1280×800 viewport.

## Music grid (the edit is cut to this)

The track is 87 BPM: a beat every 0.6897 s and a bar every 2.759 s. In the 30 s edit, bars start at 0.00, 2.76, 5.52, 8.28, 11.03, 13.79, 16.55, 19.31, 22.07, 24.83 and 27.59 s.

**Sync points** (land these on the frame):

| Time | What happens in the music | What must land on it |
|---|---|---|
| **5.52 s** | Drums kick in | The timer hits **00:00** and the chime plays |
| **13.79 s** | The hi-hats drop out; a quieter stretch until 22.07 | |
| **22.07 s** | Drums come back | **The $0 price tag flips** |
| **28.97 s** | Final hit; the tail rings out to 30 s | **The logo stamps down** |

So the previews have something to cut to, generate `promo/audio/guide-click.wav`: a soft click every beat and an accent every bar, with a bell at each sync point. It's for previews only and never goes in the final file.

## Beat sheet

The captions write on stroke by stroke in Patrick Hand. Each one is 5 words or fewer, except the two-line free-forever caption. Each stays on screen for at least 1.2 s.

| Time | Beat | App capture | Caption | Pomo |
|---|---|---|---|---|
| 0–5.52 | **Hello** | None at first. The phone slides up onto the page at about 3.5 s, showing the Focus screen | "Hi! I'm Pomo." | Flies in, the halo drops into place; happy |
| 5.52–8.28 | **Gentle Flow** | The timer counts down to 00:00 at **5.52** exactly, then keeps counting into overtime (+00:01, +00:02…) | "Keep going past zero." | focused → flow (glow and sparkles) |
| 8.28–11.03 | **Get time back** | Tap "forgot to start?", then tap the "I started 20 min ago" chip | "Forgot to start? Get it back." | puzzled → happy |
| 11.03–13.79 | **Honest history** | Timeline tab: scroll through a full day of sessions. If there's time, a drag across a dashed unlogged gap to claim it | "No judgment. Just your day." | happy |
| 13.79–16.55 | **Stats** | Stats tab: step through the ranges (week → month) and the tiles animate | "Watch your weeks take shape." | cheering |
| 16.55–19.31 | **No streaks** | Stickers tab: scroll the Sticker Book | "No streaks. Just stickers." | shy (hearts) |
| 19.31–22.07 | **Montage** | Quick page flips, one bar total: Focus Mode, Subjects folder tree, Share my page, Sync panel | Fredoka words drop in: *Focus · Tasks · Share · Sync* | Darts between them |
| **22.07–24.83** | **Free forever: reveal** | The phone dims a little. Pomo flies up holding a handwritten paper price tag and flips it on **22.07** to **$0**, with *forever* underlined in a halo-yellow marker swipe. A small doodled padlock on the page bursts into Pomo-style sparkles | **"Every feature. Free forever."** | cheering |
| 24.83–27.59 | **Free forever: why** | Same scene with a slight push-in | *"No account. No trial. Made for students on a budget."* | shy (hearts), warm and sincere, not salesy |
| 27.59–30.0 | **Everywhere and end card** | The phone and a small tilted desktop window (Midnight theme on one of them, to show the free dark mode) slide apart. Then the end card: the Promodoro wordmark in Fredoka, tomato colour, stamps down on **28.97** | **"Focus at your own pace."** and, smaller, *Every feature, free forever · Windows + Android* | cheering, centred above the wordmark |

The free-forever beat is the emotional peak of the trailer, so give it the most care.

## Pipeline

### 1. Capture the app (`promo/capture/`)
- Run `npm run dev` (port 1420) and open `http://localhost:1420/?promo=1`.
- **Filming mode:** every load starts a fresh notebook in its own IndexedDB `promodoro-promo`. It has 8 weeks of history, folders and subjects (Anatomy, Genetics, Calculus…), tasks, notes, every sticker earned and the user name "Sam". There's no dev panel and no network calls.
- **Playwright + Chromium:**
  - Phone viewport 412×915 with `deviceScaleFactor: 3`, `isMobile: true`, `hasTouch: true`.
  - Desktop viewport 1280×800 at 2×.
- **Time control:** use `page.clock.install({ time: <a weekday at 10:24 local> })` before loading. The timer is computed from timestamps, so `page.clock.fastForward()` jumps a 25:00 countdown to 00:03 instantly. Then let real time run so the crossing into overtime is recorded live.
- **Recording:**
  - Use the CDP screencast (`Page.startScreencast`, jpeg quality 100, `everyNthFrame: 1`, max size equal to the viewport × DPR).
  - Keep each frame's timestamp, and rebuild a constant 60 fps clip with ffmpeg (concat with per-frame durations), at crf 12 or better.
  - If the screencast drops frames on busy scenes, slow those interactions down and speed the clip up in Remotion.
  - Install ffmpeg with apt if it's missing.
- **Selectors:** the app has `data-tour` attributes:
  - `start`, `setup`
  - `focus` / `subjects` / `timeline` / `stats` / `stickers` / `settings` (tab buttons)
  - `timeline-nav`, `timeline-actions`, `timeline-day`, `timeline-claim`
  - `stats-filters`, `stats-tiles`, `stats-share`
  - `new-folder`, `sync-methods`
  - The start button reads "Start focus", and "forgot to start?" opens the backdate chips. Read the components before scripting each shot.
- **Movement:** taps get a short hold. Scrolls use eased `mouse.wheel` steps or `scrollTo` with smooth behaviour. Typing uses about 60–90 ms per character with jitter.
- **One script per shot**, outputting `promo/footage/<shot>.mp4`. Record a little extra (handles) at both ends of each shot.
- Make a **contact sheet** of every clip with ffmpeg (a tile of 12 frames), **look at it**, and fix anything wrong before moving on. Things to watch for: loading flashes, toasts covering the UI, a locked theme, the name not reading "Sam", empty states.

### 2. Compose (`promo/remotion/`)
- Use Remotion. Its license is free for individuals and companies of up to 3 people, which is fine here. Set the composition to 1080×1920, 60 fps, 1800 frames.
- **Import the real Pomo:** point Remotion's webpack config at the `@/` alias → `../src`, and bundle Tailwind with the app's `tailwind.config.js` so Pomo's `animate-*` classes exist.
- **The key technical fix:** Remotion renders frame by frame, so CSS animations would drift. Inside the composition, pause every animation (`animation-play-state: paused !important`) and seek each one per frame by setting a negative `animation-delay` from `useCurrentFrame()`. Keep each element's own delay offset; Pomo sets some delays inline, so add to them rather than replacing them. Check this by rendering frames 0, 1 and 2 and confirming that the bob, flap and twinkle move smoothly and the same way on every render.
- **`<PomoActor>`:** moves Pomo along a path per frame (position, scale, rotation and a small banking tilt in the direction of travel) with a `mood` timeline. It also adds a wing-point gesture, a light rotation toward whatever Pomo is presenting.
- **Other pieces:**
  - `<NotebookBg>`
  - `<PhoneFrame src=footage>`, with push-ins and a slight 3D tilt
  - `<DesktopWindow>`
  - `<HandCaption>` (SVG stroke-dash write-on; Patrick Hand converted to paths with opentype.js, or a clip-path reveal left to right)
  - `<MarkerSwipe>`, `<PageTurn>` transition, `<TapRipple>`
  - `<PriceTag>` (paper tag with a string; it flips in 3D on 22.07 s)
  - `<Padlock>` burst, `<EndCard>`

### 3. Sound effects (`promo/audio/`), made by you, nothing licensed
- Write them with the app's own Web Audio synth (`src/audio/synth.ts`), rendering offline the way `scripts/render-sounds.ts` does.
- **The 00:00 moment uses the app's real alarm sound** (see `src/audio/catalog.ts`).
- **Others:** wing flutter, a halo "ting", soft UI taps, a sticker pop, a paper page turn, a pen scribble under each caption write-on, a gentle "ka-ching" that dissolves into sparkle chimes for the $0 flip, and a warm resolving chord under the logo.
- Keep them quiet and cozy, sitting under the music (about −20 to −26 LUFS short-term).
- Export the **SFX stem** `promo/out/sfx.wav` (48 kHz stereo, exactly 30.0 s, placed on the frame-accurate timeline).

### 4. Review gates (stop and report at each one)
1. **Animatic first:** a still at the start, middle and end of every beat on one sheet, `promo/out/animatic.png`, with each beat's time and caption under it. Check it against the hard rules and the safe zones, then **stop and report** with the sheet before the full render.
2. **Full render:** `promo/out/promodoro-trailer-9x16.mp4` (H.264 High, 1080×1920 60 fps, about 20 Mbps, yuv420p, SFX only, **no music**).
   - Also export `promo/out/preview-with-click.mp4` with the guide click mixed in, for checking sync.
   - Make a contact sheet of the render (one frame every 0.5 s) and check it.
   - Check the sync points with ffprobe and frame grabs: frame 331 shows 00:00, frame 1324 shows the tag flipping, frame 1738 shows the logo landing.
3. Commit everything except big intermediate frames (add `promo/footage/` and `promo/out/frames/` to a `.gitignore` inside promo/, but **keep the final mp4s and sheets**), push `promo/trailer`, and report:
   - what was made and where
   - anything you couldn't do or couldn't verify
   - the exact paths of the final files

## Final mix (done locally afterwards, not by you)
The owner mixes the music (the 30 s edit of "Positive Lofi" by ZephiraMusic, at −14 LUFS) with your `sfx.wav` over `promodoro-trailer-9x16.mp4`. So make sure the SFX stem lines up to the frame with the video.
