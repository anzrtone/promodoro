/** 22.07 s backdrop: the Focus screen at rest, behind the free-forever beat. */
import { openApp, Recorder, wait } from './lib.mjs';

const { page, close } = await openApp();
await wait(4500); // after the greeting bubble
const rec = new Recorder(page, 'idle');
await rec.start();
await wait(6000);
await rec.stop();
await close();
