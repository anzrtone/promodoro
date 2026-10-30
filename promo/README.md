# Promodoro trailer (30 s, 9:16)

Pomo, the real `src/components/Pomo.tsx`, tours the real app. Everything lives here so the app's own
dependencies stay untouched. **No music in the repo**: the video is rendered with SFX only and cut to
the music's grid (87 BPM; see `remotion/timing.ts`); the music is mixed in locally afterwards.

```bash
npm ci                 # here, in promo/ (the repo root needs its own `npm ci` too)
npm run dev            # in the repo root: the app on :1420, for capturing
npm run capture        # Playwright → footage/<shot>.mp4 + .json, contact sheets in footage/sheets/
npm run animatic       # review sheet → out/animatic.png
npm run sfx            # SFX stem → out/sfx.wav (48 kHz stereo, 30.0 s)
npm run render         # → out/promodoro-trailer-9x16.mp4, out/preview-with-click.mp4, sheets
```

- **Capture** (`capture/`): the app in `?promo=1` filming mode, recorded with the CDP screencast at a
  true 3× (phone) / 2× (desktop). Shots are filmed in slow motion (CSS animation rate + the stepped
  Playwright clock) so no frames drop, then rebuilt as constant 60 fps clips with their tap timings.
- **Compose** (`remotion/`): `timing.ts` is the grid, `edit.ts` the clips and captions, `Trailer.tsx`
  the choreography. CSS animations are paused and seeked per frame (`anim.tsx`), so renders are
  frame-accurate and repeatable.
- **Sync points**: 00:00 on frame 331 (5.52 s), the $0 tag turning on 1324 (22.07 s), the wordmark
  landing on 1738 (28.97 s). If the countdown is re-recorded, re-measure `ZERO_FRAME` in `edit.ts`.
- **SFX** (`audio/render-sfx.ts`): the app's own synth (the real "Tomato timer" alarm at 00:00, the
  glockenspiel under the $0) plus procedural flutters, taps, page turns, pen and the logo chord.
  `audio/guide-click.wav` is for previews only.
