/**
 * 13.79 s: Stats, two bars. Step through the ranges (the tiles animate), then flick fast down the
 * whole page, stopping briefly on each chart: day by day → focus periods → where the time went →
 * daily goal → when you focus → how sessions go / by subject.
 */
import { openApp, Recorder, wait, smoothScroll, tabSel, tap } from './lib.mjs';

const { page, close } = await openApp();
const rec = new Recorder(page, 'stats');
await rec.start();
await wait(300);
await tap(page, rec, tabSel('stats'), { after: 700 });
rec.mark('tab');
await tap(page, rec, '[data-tour=stats-filters] button:has-text("7 days")', { after: 550 });
rec.mark('week');
await tap(page, rec, '[data-tour=stats-filters] button:has-text("Monthly")', { after: 650 });
rec.mark('month');
// Flicks: [scroll target (the top of each chart, a little above), length of the flick in ms].
const top = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + document.querySelector('main').scrollTop, sel);
const max = await page.evaluate(() => document.querySelector('main').scrollHeight - document.querySelector('main').clientHeight);
const stops = [
  ['bars', (await top('[data-tour=stats-bars]')) - 90, 300],
  ['periods', (await top('[data-tour=stats-periods]')) + 60, 280],
  ['donut', (await top('[data-tour=stats-donut]')) - 70, 340],
  ['goal', (await top('[data-tour=stats-goal]')) - 70, 280],
  ['when', (await top('[data-tour=stats-when]')) + 120, 300],
  ['end', max, 300],
];
for (const [name, y, ms] of stops) {
  const from = await page.evaluate(() => document.querySelector('main').scrollTop);
  rec.mark(`flick-${name}`);
  await smoothScroll(page, { dy: Math.min(y, max) - from, ms });
  rec.mark(`at-${name}`);
  await wait(name === 'end' ? 900 : 430);
}
await rec.stop();
await close();
