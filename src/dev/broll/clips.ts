/**
 * One script per B-roll shot, each timed to its line of the A-roll voice-over (rough read at ~2.6
 * words/s; `?pace=` stretches or squeezes them all). See broll/SHOTLIST.md for the cue sheet.
 */
import { drag, find, main, pressEnter, query, reveal, scroll, tab, tap, type, wait, warpClock } from './director';

const sheet = () => document.querySelector<HTMLElement>('[role="dialog"] > div.relative');
const section = (title: string) => () => query('section', new RegExp(`^${title}`));

export const CLIPS: Record<string, () => Promise<void>> = {
  /** "So I have built Promodoro… get out of here with your paywalls." (~13 s) */
  async intro() {
    await wait(2200); // Pomo says good morning to Anzar
    await scroll(330);
    await wait(1300);
    await scroll(-330);
    await wait(900);
    await tap('[data-tour="start"]');
    await wait(5200); // full-screen focus mode, timer ticking
  },

  /** "You can view all the graphs and analytics: bar graphs, pie charts, heat maps, useful insights…" (~10 s) */
  async stats() {
    await tab('Stats');
    await wait(900);
    await tap('button', /^30 days$/);
    await wait(700);
    await reveal(section('Last 30 days'), { at: 0.35 }); // bar graph
    await wait(1100);
    await reveal('[data-tour="stats-donut"]', { at: 0.42 }); // pie chart
    await wait(1300);
    await reveal('[data-tour="stats-when"]', { at: 0.55 }); // heat map
    await wait(1300);
    await reveal('[data-tour="stats-shape"]', { at: 0.45 }); // insights
    await wait(1400);
  },

  /** "All of the data lives on your device, so you can export it out with a click of a button…" (~9 s) */
  async export() {
    await tab('Settings');
    await wait(700);
    await reveal(section('Export & restore'), { at: 0.42, ms: 1000 });
    await wait(1400);
    await tap('button', 'Export backup (JSON)');
    await wait(1600);
    await tap('button', 'Export sessions (CSV)');
    await wait(2200);
  },

  /** "Even better, you can bring in any of the past data… into our ecosystem…" (~17 s) */
  async import() {
    await tab('Timeline');
    await wait(1300);
    await tap('button', 'Import history');
    await wait(1600); // lands on Settings → Export & restore
    await tap('button', 'Import CSV');
    await find('[role="dialog"]');
    await wait(2200); // columns guessed, preview of the Forest rows
    const box = sheet();
    if (box) {
      await scroll(260, { el: box });
      await wait(1500);
      await scroll(400, { el: box });
    }
    await wait(1600); // "N new sessions (…h)"
    await tap('[role="dialog"] button', /^Import \d+ sessions$/);
    await wait(2200); // "Welcome home!" toast + sticker
    await tab('Stats');
    await wait(600);
    await tap('button', /^Year$/);
    await wait(1200);
    await reveal(section('Last year'), { at: 0.4 });
    await wait(2000); // the imported months (dotted bars) now fill the year
  },

  /** "You can synchronize your data across all devices with the click of a button. So simple to set up." (~7 s) */
  async sync() {
    await tab('Settings');
    await wait(500);
    await tap('button', /^Sync$/);
    await wait(900);
    await tap('button', /^Cloud folder$/);
    await wait(900);
    await tap('button', 'Use Google Drive');
    await wait(700);
    await tap('button', 'Sync now');
    await wait(3200); // spinner, then "Brought in 5 new sessions."
  },

  /** "…you never have to worry about forgetting… add any session manually… through the timeline mode." (~11 s) */
  async timeline() {
    await tab('Timeline');
    await wait(1500);
    // Drag across a dashed "unlogged" gap to claim it.
    const gap = await find(() => widestGap());
    await drag(gap, 0.12, 0.88, { ms: 1500 });
    await find('[role="dialog"]');
    await wait(1000);
    await type('[role="dialog"] input[placeholder^="What was it"]', 'Lecture review');
    await wait(400);
    await tap('[role="dialog"] button', /^Calculus$/);
    await wait(700);
    await tap('[role="dialog"] button', /^Add \d/);
    await wait(2600); // claimed block appears on the timeline + toast
  },

  /** "Pomodoros are just so outdated… Gentle Flow… keep going… you will not miss a single second." (~22 s) */
  async flow() {
    await wait(1200);
    await tap('button', 'forgot to start?');
    await wait(700);
    await tap('button', /^custom…$/);
    await wait(300);
    await type('input[aria-label="Minutes ago"]', '24', { cps: 5 });
    await wait(400);
    await tap('button[type="submit"]', 'Go');
    await wait(1800); // 25-minute session, 1 minute left
    await warpClock(52_000, 2600); // run down to the bell
    await wait(2600); // 0:00 — it chimes and keeps counting
    await warpClock(4 * 60_000, 3800); // overtime piling up, nothing stops
    await wait(2400);
    await warpClock(3 * 60_000, 2400);
    await wait(2800); // "25:00 planned + 07:xx overtime"
  },

  /** "Plus, there's a bunch of other nifty features, like a task system, a folder management…" (~7 s) */
  async subjects() {
    await tab('Subjects');
    await wait(900);
    await tap(() => query('[data-tour^="subject:"]', 'Anatomy'));
    await wait(900);
    const input = await type('input[placeholder="add a task…"]', 'Flashcards: muscles of the arm', { cps: 12 });
    pressEnter(input);
    await wait(900);
    await tap(() => query('li', 'Flashcards: muscles')?.querySelector<HTMLElement>('button[aria-label="Mark done"]'));
    await wait(1800);
  },

  /** "Stop giving your money over… You can get everything here for free at my GitHub…" (~17 s) */
  async outro() {
    await wait(1600);
    await tab('Stats');
    await wait(1400);
    await scroll(900);
    await wait(900);
    await tab('Subjects');
    await wait(1600);
    await tab('Timeline');
    await wait(1600);
    await tab('Focus');
    await wait(1200);
    main().scrollTo({ top: 0 });
    await tap('[data-tour="start"]');
    await wait(5000);
  },
};

/** Everything back to back: one continuous take for a quick edit. */
CLIPS.reel = async () => {
  for (const name of ['intro', 'stats', 'export', 'sync', 'timeline', 'flow', 'subjects']) {
    await CLIPS[name]();
    await tab('Focus').catch(() => undefined);
    await wait(600);
  }
};

/** The widest dashed "unlogged" gap on the day strip that's currently in view. */
function widestGap(): HTMLElement | null {
  const strip = query('[data-tour="timeline-day"]');
  if (!strip) return null;
  const box = strip.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestW = 0;
  for (const el of Array.from(strip.querySelectorAll<HTMLElement>('div.border-dashed'))) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
    if (w > bestW && w > 60) {
      best = el;
      bestW = w;
    }
  }
  return best;
}
