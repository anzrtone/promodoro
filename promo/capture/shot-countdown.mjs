/** 5.52 s: the countdown crosses 00:00 live (Gentle Flow), then keeps counting into overtime. */
import { openApp, Recorder, slowmo, sleep, wait } from './lib.mjs';

const { page, close } = await openApp({ setup: { focusModeAuto: false } });
await page.slowmo.stop();
// Start on a whole second so the wall-clock-aligned display lands exactly on 00:00.
const now = await page.evaluate(() => Date.now());
const start = now + 5000 - (now % 1000);
await page.clock.pauseAt(start);
await page.locator('[data-tour=start]').click();
await sleep(800);
const zero = start + 25 * 60_000;
await page.clock.pauseAt(zero - 4300);
await sleep(300);

const rec = new Recorder(page, 'countdown');
await page.exposeFunction('promoMark', (name) => rec.mark(name));
await page.evaluate(() => {
  const seen = new Set();
  new MutationObserver(() => {
    const big = [...document.querySelectorAll('.tabular')].map((e) => e.textContent.trim());
    for (const v of ['00:02', '00:01', '00:00', '+00:00', '+00:01', '+00:02']) if (big.includes(v) && !seen.has(v)) (seen.add(v), window.promoMark(v));
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
});
await rec.start();
await slowmo(page);
await wait(8500);
await rec.stop(0.2);
await close();
