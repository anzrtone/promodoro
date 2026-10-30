/** 13.79 s: Stats, stepping through the ranges; the tiles animate on each step. */
import { openApp, Recorder, wait, tabSel, tap } from './lib.mjs';

const { page, close } = await openApp();
const rec = new Recorder(page, 'stats');
await rec.start();
await wait(300);
await tap(page, rec, tabSel('stats'), { after: 700 });
rec.mark('tab');
await tap(page, rec, '[data-tour=stats-filters] button:has-text("7 days")', { after: 800 });
rec.mark('week');
await tap(page, rec, '[data-tour=stats-filters] button:has-text("Monthly")', { after: 1400 });
rec.mark('month');
await rec.stop();
await close();
