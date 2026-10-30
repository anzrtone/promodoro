/** 8.28 s: "forgot to start?" unfolds, then one tap backdates the session by 20 minutes. */
import { openApp, Recorder, wait, tap } from './lib.mjs';

const { page, close } = await openApp({ setup: { focusModeAuto: false } });
const rec = new Recorder(page, 'forgot');
await rec.start();
await wait(500);
await tap(page, rec, 'button:has-text("forgot to start?")');
rec.mark('chips');
await wait(500);
const chip = await tap(page, rec, 'button.chip:has-text("20 min ago")');
rec.mark('started');
await wait(2200);
await rec.stop();
await close();
