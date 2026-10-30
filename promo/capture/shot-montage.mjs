/** 19.31 s: four quick looks: Focus mode, the Subjects folder tree, Share my page, Sync. */
import { openApp, Recorder, wait, tabSel, tap } from './lib.mjs';

async function take(name, fn, setup) {
  const { page, close } = await openApp({ setup });
  await fn.before?.(page);
  const rec = new Recorder(page, name);
  await rec.start();
  await wait(250);
  await fn.run(page, rec);
  await rec.stop(0.3);
  await close();
}

await take('m-focusmode', { run: async (page, rec) => { await tap(page, rec, '[data-tour=start]', { after: 1800 }); rec.mark('open'); } });
await take('m-subjects', { run: async (page, rec) => { await tap(page, rec, tabSel('subjects'), { after: 1500 }); rec.mark('open'); } });
await take('m-share', {
  before: async (page) => {
    await page.locator(tabSel('timeline')).click();
    await wait(700);
    await page.locator('[aria-label=Earlier]').click();
    await wait(900);
  },
  run: async (page, rec) => { await tap(page, rec, 'button:has-text("Share this page")', { after: 1600 }); rec.mark('open'); },
});
await take('m-sync', {
  before: async (page) => {
    await page.locator(tabSel('settings')).click();
    await wait(900);
  },
  run: async (page, rec) => { await tap(page, rec, 'button:has-text("Sync") >> nth=0', { after: 1500 }); rec.mark('open'); },
});
