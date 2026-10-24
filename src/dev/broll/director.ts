/**
 * B-roll director: drives the real app like a thumb on a phone, so a screen recording of it reads as
 * someone using Promodoro live. Every gesture goes through real DOM events on real elements (React
 * handlers, dnd-kit, pointer capture), with a soft touch indicator drawn on top.
 * Dev-only: imported from src/dev/broll, which main.tsx loads only behind `?broll=`.
 */

let pace = 1;
export const setPace = (p: number) => {
  pace = p > 0 ? p : 1;
};

/** Narration-paced wait: `?pace=1.2` stretches every beat by 20 %. */
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * pace));
const raf = () => new Promise<number>((r) => requestAnimationFrame(r));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

async function tween(ms: number, step: (k: number) => void, ease = easeInOut) {
  const t0 = performance.now();
  const dur = ms * pace;
  for (;;) {
    const k = Math.min(1, (performance.now() - t0) / dur);
    step(ease(k));
    if (k >= 1) return;
    await raf();
  }
}

/* ---------- touch indicator ---------- */

const STYLE = `
* { scrollbar-width: none !important; cursor: none !important; }
*::-webkit-scrollbar { display: none !important; }
.broll-finger { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px;
  border-radius: 999px; background: rgb(45 49 46 / 0.22); box-shadow: 0 0 0 2px rgb(255 255 255 / 0.9), 0 4px 14px rgb(45 49 46 / 0.25);
  pointer-events: none; opacity: 0; transform: scale(1.25); transition: opacity 140ms ease, transform 140ms ease; }
.broll-finger.on { opacity: 1; transform: scale(1); }
.broll-finger.press { transform: scale(0.82); background: rgb(45 49 46 / 0.32); }
.broll-ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 0.95); box-shadow: 0 0 0 1px rgb(45 49 46 / 0.12); pointer-events: none;
  animation: broll-ripple 520ms ease-out forwards; }
@keyframes broll-ripple { from { transform: scale(0.7); opacity: 0.9; } to { transform: scale(2.1); opacity: 0; } }
`;

let finger: HTMLDivElement | null = null;
let fx = 0;
let fy = 0;

export function installStage() {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  finger = document.createElement('div');
  finger.className = 'broll-finger';
  document.body.appendChild(finger);
  // Synthetic pointers have no live pointer id, so capture would throw; the app works without it.
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id: number) {
    try {
      capture.call(this, id);
    } catch {
      /* synthetic pointer */
    }
  };
}

function moveFinger(x: number, y: number) {
  fx = x;
  fy = y;
  if (finger) finger.style.translate = `${x}px ${y}px`;
}
const showFinger = (on: boolean) => finger?.classList.toggle('on', on);
const pressFinger = (on: boolean) => finger?.classList.toggle('press', on);

function ripple(x: number, y: number) {
  const r = document.createElement('div');
  r.className = 'broll-ripple';
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 600);
}

/* ---------- finding things ---------- */

type Target = string | HTMLElement | (() => HTMLElement | null | undefined);

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** First visible element matching `selector` whose text includes `text` (or matches it). */
export function query(selector: string, text?: string | RegExp, root: ParentNode = document): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    if (!visible(el)) continue;
    if (text === undefined) return el;
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (typeof text === 'string' ? t.includes(text) : text.test(t)) return el;
  }
  return null;
}

/** Wait (up to `timeout`) for an element to show up. */
export async function find(target: Target, text?: string | RegExp, timeout = 8000): Promise<HTMLElement> {
  const t0 = performance.now();
  for (;;) {
    const el = typeof target === 'string' ? query(target, text) : typeof target === 'function' ? target() : target;
    if (el && visible(el)) return el;
    if (performance.now() - t0 > timeout) throw new Error(`b-roll: nothing matches ${String(target)} ${text ?? ''}`);
    await new Promise((r) => setTimeout(r, 60));
  }
}

/* ---------- scrolling ---------- */

const NAV_H = 64; // the bottom tab bar covers this much of the main scroller

function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return main();
}

export const main = () => document.querySelector('main') as HTMLElement;

/**
 * A thumb flick: the finger drags against the scroll direction while the page glides.
 * Long distances are split into several flicks, as a person would.
 */
export async function scroll(dy: number, opts: { el?: HTMLElement; ms?: number } = {}) {
  const box = opts.el ?? main();
  const max = box.scrollHeight - box.clientHeight;
  const from = box.scrollTop;
  const to = Math.max(0, Math.min(max, from + dy));
  const total = to - from;
  if (Math.abs(total) < 2) return;
  const rect = box.getBoundingClientRect();
  const bottom = Math.min(rect.bottom, innerHeight - (box === main() ? NAV_H : 0));
  const reach = (bottom - rect.top) * 0.5;
  // Short hops are gentle flicks; long trips are a few hard flings (at most three).
  const flicks = Math.min(3, Math.max(1, Math.ceil(Math.abs(total) / (reach * 1.6))));
  const x = rect.left + rect.width * 0.62;
  for (let i = 0; i < flicks; i++) {
    const a = from + (total * i) / flicks;
    const b = from + (total * (i + 1)) / flicks;
    const down = b > a;
    const y0 = down ? rect.top + (bottom - rect.top) * 0.72 : rect.top + (bottom - rect.top) * 0.3;
    const y1 = down ? y0 - reach * 0.55 : y0 + reach * 0.55;
    moveFinger(x, y0);
    showFinger(true);
    await wait(90);
    // The finger lifts early; the page keeps gliding (momentum).
    let lifted = false;
    await tween(
      opts.ms ?? Math.min(1300, 520 + Math.abs(b - a) * 0.4),
      (k) => {
        box.scrollTop = a + (b - a) * k;
        if (k < 0.45) moveFinger(x, y0 + (y1 - y0) * (k / 0.45));
        else if (!lifted) {
          lifted = true;
          showFinger(false);
        }
      },
      easeOut,
    );
    showFinger(false);
    if (i < flicks - 1) await wait(140);
  }
}

/** Scroll so `el` sits around `at` (0 = top, 1 = bottom) of the visible area. */
export async function reveal(target: Target, opts: { at?: number; text?: string | RegExp; ms?: number } = {}) {
  const el = await find(target, opts.text);
  const box = scrollerOf(el);
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const bottom = Math.min(b.bottom, innerHeight - (box === main() ? NAV_H : 0));
  const want = b.top + (bottom - b.top) * (opts.at ?? 0.4);
  await scroll(r.top + r.height / 2 - want, { el: box, ms: opts.ms });
  return el;
}

const inView = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  // Sheets sit above the tab bar, so anything on screen inside one is within reach.
  if (el.closest('[role="dialog"]')) return r.top >= 8 && r.bottom <= innerHeight - 8;
  const box = scrollerOf(el);
  const b = box.getBoundingClientRect();
  const bottom = Math.min(b.bottom, innerHeight - (box === main() ? NAV_H : 0));
  return r.top >= b.top + 8 && r.bottom <= bottom - 8;
};

/* ---------- gestures ---------- */

function pointer(type: string, el: Element, x: number, y: number) {
  const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 };
  el.dispatchEvent(new PointerEvent(type, init));
}

/** Glide the (hovering, invisible) finger to a point, then touch down there. */
async function touchAt(x: number, y: number) {
  moveFinger(x, y);
  showFinger(true);
  await wait(110);
  pressFinger(true);
  ripple(x, y);
}

/** Tap an element: scrolls it into reach first if needed, then a real pointer + click sequence. */
export async function tap(target: Target, text?: string | RegExp, opts: { hold?: number } = {}) {
  let el = await find(target, text);
  if (!inView(el)) {
    await reveal(el, { at: 0.45 });
    await wait(200);
    el = await find(target, text);
  }
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  await touchAt(x, y);
  pointer('pointerdown', el, x, y);
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
  await wait(opts.hold ?? 110);
  pointer('pointerup', el, x, y);
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
  el.click();
  pressFinger(false);
  await wait(140);
  showFinger(false);
  return el;
}

/** Press-and-drag horizontally across an element, from one fraction of its width to another. */
export async function drag(target: Target, from: number, to: number, opts: { ms?: number; y?: number; onto?: HTMLElement } = {}) {
  const el = await find(target);
  const r = el.getBoundingClientRect();
  // Only the part that's on screen can be touched (the timeline strip scrolls sideways).
  const clip = (el.closest('.overflow-x-auto') as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, right: innerWidth };
  const left = Math.max(r.left, clip.left + 6);
  const width = Math.min(r.right, clip.right - 6) - left;
  const y = r.top + r.height * (opts.y ?? 0.5);
  const x0 = left + width * from;
  const x1 = left + width * to;
  // Events go to whatever is under the finger (the gap box), bubbling to the timeline's handlers.
  const hit = opts.onto ?? (document.elementFromPoint(x0, y) as HTMLElement) ?? el;
  await touchAt(x0, y);
  pointer('pointerdown', hit, x0, y);
  await wait(160);
  await tween(opts.ms ?? 1300, (k) => {
    const x = x0 + (x1 - x0) * k;
    moveFinger(x, y);
    pointer('pointermove', hit, x, y);
  });
  await wait(220);
  pointer('pointerup', hit, fx, fy);
  pressFinger(false);
  await wait(140);
  showFinger(false);
}

/** Tap the same button several times in a row, finger resting on it (e.g. stepping a number down). */
export async function tapRepeat(target: Target, times: number, opts: { every?: number } = {}) {
  let el = await find(target);
  if (!inView(el)) {
    await reveal(el, { at: 0.45 });
    await wait(200);
    el = await find(target);
  }
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  moveFinger(x, y);
  showFinger(true);
  await wait(110);
  for (let i = 0; i < times; i++) {
    pressFinger(true);
    ripple(x, y);
    pointer('pointerdown', el, x, y);
    await wait(70);
    pointer('pointerup', el, x, y);
    el.click();
    pressFinger(false);
    await wait((opts.every ?? 260) - 70);
  }
  await wait(120);
  showFinger(false);
}

/**
 * Drag round a circular dial like a thumb on a kitchen timer. `fracs` are clock positions
 * (0 = 12 o'clock, 0.25 = 3 o'clock, …); the finger presses at the first, glides through
 * each of the rest (pausing briefly on each), then lets go.
 */
export async function dragAround(target: Target, fracs: number[], opts: { radius: number; ms?: number; hold?: number }) {
  const el = await find(target);
  const box = ((el as unknown as SVGElement).ownerSVGElement ?? el).getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const at = (f: number) => {
    const a = f * Math.PI * 2;
    return [cx + opts.radius * Math.sin(a), cy - opts.radius * Math.cos(a)] as const;
  };
  let [x, y] = at(fracs[0]);
  await touchAt(x, y);
  pointer('pointerdown', el, x, y);
  await wait(opts.hold ?? 260);
  for (let i = 1; i < fracs.length; i++) {
    const a = fracs[i - 1];
    const b = fracs[i];
    await tween(opts.ms ?? Math.max(450, Math.abs(b - a) * 2600), (k) => {
      [x, y] = at(a + (b - a) * k);
      moveFinger(x, y);
      pointer('pointermove', el, x, y);
    });
    await wait(opts.hold ?? 260);
  }
  pointer('pointerup', el, x, y);
  pressFinger(false);
  await wait(140);
  showFinger(false);
}

/** Nudge the page as a finger would before touching, e.g. to wake an auto-hiding UI. */
export function stir(el: Element = document.body) {
  pointer('pointermove', el, innerWidth / 2, innerHeight / 2);
}

/** Type into a (React-controlled) field at a human pace, with small hesitations. */
export async function type(target: Target, text: string, opts: { cps?: number; clear?: boolean } = {}) {
  const el = (await find(target)) as HTMLInputElement | HTMLTextAreaElement;
  if (document.activeElement !== el) {
    await tap(el);
    el.focus();
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  let value = opts.clear === false ? el.value : '';
  if (opts.clear !== false) {
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const base = 1000 / (opts.cps ?? 9);
  for (const ch of text) {
    value += ch;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const jitter = base * (0.55 + Math.random() * 0.9) + (ch === ' ' ? base * 0.6 : 0);
    await new Promise((r) => setTimeout(r, jitter * pace));
  }
  return el;
}

export function pressEnter(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
}

/** Tap a bottom-bar tab. */
export const tab = (label: string) => tap('nav.fixed button', label);

/* ---------- time ---------- */

const realNow = Date.now.bind(Date);
let offset = 0;
let warped = false;

/** Let the app's clock run fast for a moment (e.g. to reach the bell without a minute of dead air). */
export async function warpClock(addMs: number, overMs: number) {
  if (!warped) {
    warped = true;
    Date.now = () => realNow() + offset;
  }
  const start = offset;
  let lastPaint = 0;
  await tween(
    overMs,
    (k) => {
      offset = start + addMs * k;
      // The app repaints once a wall-clock second; a visibility ping makes it repaint now.
      const t = performance.now();
      if (t - lastPaint > 70) {
        lastPaint = t;
        document.dispatchEvent(new Event('visibilitychange'));
      }
    },
    (t) => t,
  );
  document.dispatchEvent(new Event('visibilitychange'));
}
