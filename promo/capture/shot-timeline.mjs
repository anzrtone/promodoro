/** 11.03 s: yesterday's whole page, then a drag across the dashed unlogged gap to claim it. */
import { drag, openApp, Recorder, wait, smoothScroll, tabSel, tap } from './lib.mjs';

const STRIP = '[data-tour=timeline-day] .overflow-x-auto';
const { page, close } = await openApp();
const rec = new Recorder(page, 'timeline');
await rec.start();
await wait(300);
await tap(page, rec, tabSel('timeline'));
rec.mark('tab');
await tap(page, rec, '[aria-label=Earlier]', { after: 500 });
rec.mark('yesterday');
await page.evaluate((s) => (document.querySelector(s).scrollLeft = 0), STRIP);
await smoothScroll(page, { selector: STRIP, dx: 700, ms: 1300 });
rec.mark('scrolled');
const gap = await page.locator(`${STRIP} >> text=/unlogged/`).first().boundingBox();
const y = gap.y + gap.height / 2;
await drag(page, rec, { x: gap.x + gap.width * 0.1, y }, { x: gap.x + gap.width * 0.9, y }, 800);
rec.mark('claimed');
await wait(1600);
await rec.stop();
await close();
