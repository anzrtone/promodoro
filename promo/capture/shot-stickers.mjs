/** 16.55 s: the Sticker Book, scrolled gently. */
import { openApp, Recorder, wait, smoothScroll, tabSel, tap } from './lib.mjs';

const { page, close } = await openApp();
const rec = new Recorder(page, 'stickers');
await rec.start();
await wait(300);
await tap(page, rec, tabSel('stickers'), { after: 500 });
rec.mark('tab');
await smoothScroll(page, { dy: 900, ms: 2400 });
rec.mark('scrolled');
await wait(500);
await rec.stop();
await close();
