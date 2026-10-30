/** 16.55 s: the Sticker Book, a short scroll that settles so the push-in can rest on one card. */
import { openApp, Recorder, wait, smoothScroll, tabSel, tap } from './lib.mjs';

const { page, close } = await openApp();
const rec = new Recorder(page, 'stickers');
await rec.start();
await wait(300);
await tap(page, rec, tabSel('stickers'), { after: 400 });
rec.mark('tab');
await smoothScroll(page, { dy: 330, ms: 1100 });
rec.mark('scrolled');
await wait(2400);
await rec.stop();
await close();
