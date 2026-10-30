/** 27.59 s: the desktop app (1280×800) in the free Midnight theme, a session running. */
import { DESKTOP, openApp, Recorder, wait } from './lib.mjs';

const { page, close } = await openApp({ device: DESKTOP, setup: { theme: 'midnight', focusModeAuto: false } });
await page.locator('[data-tour=start]').click();
await wait(600);
await page.clock.fastForward(7 * 60_000);
await wait(4500); // let the greeting bubble clear
const rec = new Recorder(page, 'desktop');
await rec.start();
await wait(3500);
await rec.stop();
await close();
