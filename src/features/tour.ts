/**
 * The guided tour after the welcome notebook: Pomo walks through Focus, Subjects, Timeline and Stats,
 * pointing at real controls, and helps make a first folder and subject along the way.
 *
 * Targets are elements marked with data-tour="…". `{folder}` / `{subject}` in a target or text
 * are filled with what the user made during the tour; a target that never shows up (e.g. the
 * folder step was skipped, or a timer is running) is simply skipped.
 */
import { useSyncExternalStore } from 'react';
import { addFolder, addSubject } from '@/db/folders';
import { getSettings, type UseId } from '@/db/settings';
import { demoDay, startDemo, stopDemo } from './demo';
import { navigate, type Tab } from './nav';

export type Chapter = 'focus' | 'subjects' | 'timeline' | 'stats';

/** Which guided tour is running: the main walk-through, or the one that explains device sync. */
export type TourId = 'main' | 'sync';

export interface TourStep {
  screen: Tab;
  target: string | null;
  text: string;
  /** Interactive steps ask for a name (pre-filled) and make the thing when you press Enter. */
  make?: 'folder' | 'subject';
  /** Which chapter chip lights up; defaults to `screen`. */
  chapter?: string;
  /** Settings sub-tab to open for this step. */
  section?: string;
}

export const TOUR: TourStep[] = [
  // Focus
  { screen: 'focus', target: 'start', text: "Tap here to start (or press Space). When the timer hits zero I'll chime and keep counting, so flow time is never lost." },
  { screen: 'focus', target: 'setup', text: 'Pick a subject and a task here. Tap the clock to switch presets, or drag it to fine-tune.' },
  { screen: 'focus', target: 'timeline', text: 'Forgot to start me? No worries. Backdate a start, or claim the gap on your Timeline later.' },

  // Subjects
  { screen: 'subjects', target: 'subjects-intro', text: "This is your Subjects shelf. Subjects are what you focus on, folders keep them tidy, and both can hold tasks and notes." },
  { screen: 'subjects', target: 'new-folder', make: 'folder', text: "Let's make your first folder together! Call it anything you like, or just press Enter." },
  { screen: 'subjects', target: 'folder:{folder}', text: 'Ta-da, “{folder}”! Folders can hold subjects and one level of subfolders. Drag them by the header to reorder.' },
  { screen: 'subjects', target: 'folder-add:{folder}', make: 'subject', text: 'Now a subject to live inside “{folder}”. Subjects show up on the Focus screen, colour-coded.' },
  { screen: 'subjects', target: 'subject:{subject}', text: 'There it is! Tap a subject to rename it, pick a colour or alarm sound, and keep its tasks and notes. Drag it to move it between folders.' },

  // Timeline
  { screen: 'timeline', target: 'timeline-nav', text: 'This is your Timeline: every day as a notebook page. Flip days with the arrows, or switch to Week and Month for the bigger picture. Tap any day there to open it.' },
  { screen: 'timeline', target: 'timeline-day', text: 'Each session sits here as a block at the time it happened, coloured by subject. Tap one to fix its times or add a margin note and mood. + and − zoom in and out.' },
  { screen: 'timeline', target: 'timeline-claim', text: 'Forgot to start me? Time between sessions shows up as a dashed “unlogged” box. Drag across it, or just tap it, to claim it as focus. Little yellow ticks mark when you opened or left the app, to jog your memory.' },
  { screen: 'timeline', target: 'timeline-actions', text: 'Worked away from the app? Add a past session by hand. “Share this page” turns the day into a picture, and Import brings in history from Forest, Flow or a spreadsheet.' },

  // Stats
  { screen: 'stats', target: 'stats-filters', text: 'Your Stats! Pick a range up here, and choose which kinds of time count: timed, adjusted, added by hand, or imported.' },
  { screen: 'stats', target: 'stats-tiles', text: 'The totals: focus time, your average per active day, sessions, days focused, tasks done, and notebook pages filled all time. Comparisons are just info, never a grade.' },
  { screen: 'stats', target: 'stats-bars', text: 'Focus over time. The texture shows where minutes came from, and ★ marks your best day. The little table icon shows exact numbers.' },
  { screen: 'stats', target: 'stats-periods', text: 'Focus periods: each day as a strip, coloured by subject, so you can see when in the day you actually worked.' },
  { screen: 'stats', target: 'stats-donut', text: 'Where the time went: your focus split by subject.' },
  { screen: 'stats', target: 'stats-goal', text: 'Daily goal: pick a gentle target. Rings fill up as you go. An empty day is just an empty ring, never a red mark.' },
  { screen: 'stats', target: 'stats-when', text: 'When you focus: your busiest hours, plus a weekday × hour heatmap to spot your natural rhythm.' },
  { screen: 'stats', target: 'stats-shape', text: 'How sessions go: how many ran to the bell, your longest sitting, pauses, and your focus-to-rest balance.' },
  { screen: 'stats', target: 'stats-tree', text: 'By subject: open folders and subjects to see their tasks, with a tiny trend line for each.' },
  { screen: 'stats', target: 'stats-share', text: 'Proud of a week? Share turns your stats into a notebook-page card. Tick the widgets you want, then save or send it to friends!' },

  { screen: 'stats', target: null, text: "That's the tour! No streaks here, ever, just stickers for being kind to yourself. I made you one. Ready when you are, {name}." },
];

export const CHAPTERS: Array<{ id: Chapter; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'stats', label: 'Stats' },
];

/**
 * The sync tour: shown the first time someone opens Settings → Sync, and again from its "Re-tour" button.
 * Steps whose target may not be on screen (it depends on the chosen method) use no target, so they never stall.
 */
const sync = (step: Omit<TourStep, 'screen' | 'section'>): TourStep => ({ screen: 'settings', section: 'sync', ...step });

export const SYNC_TOUR: TourStep[] = [
  sync({ chapter: 'why', target: 'sync-panel', text: "This is where your devices learn to share. Sync keeps your phone and computer matching: new sessions, edits and deletions follow you both ways. No account, ever. Your notebook stays on your own devices." }),
  sync({ chapter: 'pick', target: 'sync-methods', text: 'Pick how they talk. Pairing code is the easiest: an encrypted hand-off that works anywhere. Cloud folder rides on Dropbox, OneDrive, Google Drive or iCloud, so no server at all. File is fully manual: save on one device, merge on the other.' }),
  sync({ chapter: 'pick', target: 'sync-detail', text: "Set it up once, right here. Pairing code: your first device makes a secret code, then you type that code on your other device. Cloud folder: pick your cloud app and I make the folder for you. File: just two buttons." }),
  sync({ chapter: 'use', target: null, text: "After that, tap “Sync now” whenever you like, on either device. Turn on “Sync automatically” and I'll also do it when Promodoro opens, every so often, and when you put it away." }),
  sync({ chapter: 'use', target: null, text: "It's gentle: the newer edit wins, deleting something removes it on both, and merging twice never doubles anything. With a code, your data is scrambled before it leaves, so even the server can't read it. Keep the code private." }),
  sync({ chapter: 'use', target: null, text: "That's syncing, {name}! You can hear this again any time with the “Re-tour” button up here." }),
];

export interface TourScript {
  steps: TourStep[];
  chapters: Array<{ id: string; label: string }>;
  /** Label of the last step's button. */
  done: string;
}

export const TOURS: Record<TourId, TourScript> = {
  main: { steps: TOUR, chapters: CHAPTERS, done: "Let's focus!" },
  sync: {
    steps: SYNC_TOUR,
    chapters: [
      { id: 'why', label: 'Why' },
      { id: 'pick', label: 'Set up' },
      { id: 'use', label: 'Use' },
    ],
    done: 'Got it!',
  },
};

export const chapterOf = (s: TourStep) => s.chapter ?? s.screen;

/** What the user made during the tour, for later steps to point at. */
export interface TourMade {
  folderId?: string;
  folderName?: string;
  subjectId?: string;
  subjectName?: string;
}

interface State {
  id: TourId;
  step: number | null;
  made: TourMade;
  /** Main tour: Timeline and Stats show sample data, so every widget has something to explain. */
  demo: boolean;
  /** Which way the user is moving, so a step that can't be shown is skipped in that direction. */
  dir: 1 | -1;
}

let state: State = { id: 'main', step: null, made: {}, demo: false, dir: 1 };
const subs = new Set<() => void>();
const set = (s: State) => {
  state = s;
  subs.forEach((f) => f());
};

/** Start a tour. (Takes only a known id, so it is safe to hand straight to an onClick.) */
export function startTour(id: TourId = 'main') {
  const tour: TourId = id === 'sync' ? 'sync' : 'main';
  const first = TOURS[tour].steps[0];
  navigate(first.screen, first.section ? { settingsSection: first.section } : {});
  // Every run of the main tour (first time or a replay) shows the sample notebook on Timeline and Stats.
  // The user's own history is only hidden behind it, never touched, and is back when the tour ends.
  set({ id: tour, step: 0, made: {}, demo: tour === 'main', dir: 1 });
}

const DEMO_SCREENS: Tab[] = ['timeline', 'stats'];

export const getTourStep = () => state.step;

/** Skip a step that can't be shown, carrying on in the direction the user was going. */
export function skipTourStep() {
  if (state.step === null) return;
  const n = state.step + state.dir;
  // Backing up past the first step turns around instead of ending the tour.
  if (n < 0) setTourStep(state.step + 1, 1);
  else setTourStep(n, state.dir);
}

/** One step back. "Make a folder/subject" steps that were already done are passed over, so nothing gets made twice. */
export function tourBack() {
  if (state.step === null || state.step === 0) return;
  setTourStep(state.step - 1, -1);
}

export function setTourStep(n: number | null, dir: 1 | -1 = 1): void {
  const steps = TOURS[state.id].steps;
  const step = n !== null && n >= steps.length ? null : n;
  if (step === null) {
    if (state.demo) void stopDemo();
    return set({ ...state, step, demo: false });
  }
  const s = steps[step];
  if (dir === -1 && ((s.make === 'folder' && state.made.folderId) || (s.make === 'subject' && state.made.subjectId))) {
    return step > 0 ? setTourStep(step - 1, -1) : setTourStep(step + 1, 1);
  }
  const go = () => {
    // The sample day is yesterday, a full day, so the Timeline opens there.
    const extra = s.section ? { settingsSection: s.section } : state.demo && s.screen === 'timeline' ? { day: demoDay() } : {};
    navigate(s.screen, extra);
    set({ ...state, step, dir });
  };
  // Fill the sample notebook before showing a screen that needs it (falls back to real data if that fails).
  if (state.demo && DEMO_SCREENS.includes(s.screen)) void startDemo().catch(() => undefined).finally(go);
  else go();
}

export function useTour(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => state,
  );
}

/** A step's target with ids filled in; null if it points at something that wasn't made. */
export function tourTarget(t: string | null, made: TourMade): string | null {
  if (!t) return null;
  if (t.includes('{folder}') && !made.folderId) return '';
  if (t.includes('{subject}') && !made.subjectId) return '';
  return t.replace('{folder}', made.folderId ?? '').replace('{subject}', made.subjectId ?? '');
}

export function tourText(s: string, made: TourMade, name: string): string {
  return s
    .replace('{name}', name.trim() || 'friend')
    .replaceAll('{folder}', made.folderName ?? 'your folder')
    .replaceAll('{subject}', made.subjectName ?? 'your subject');
}

/** Suggested names, from what the user said they'd use Promodoro for. */
const SUGGEST: Record<UseId, [folder: string, subject: string]> = {
  study: ['School', 'Biology'],
  code: ['Projects', 'Side project'],
  write: ['Writing', 'First draft'],
  work: ['Work', 'Quarterly report'],
  create: ['Creative', 'Sketchbook'],
  bodydouble: ['Everyday', 'Inbox zero'],
  admin: ['Home', 'Taxes'],
  other: ['My stuff', 'First project'],
};

export async function suggestName(kind: 'folder' | 'subject'): Promise<string> {
  const uses = (await getSettings()).survey?.uses ?? [];
  const pick = SUGGEST[uses[0] ?? 'other'];
  return kind === 'folder' ? pick[0] : pick[1];
}

const FOLDER_COLOR = '#E9B949';
const SUBJECT_COLOR = '#4FB0C6';

/** Make the folder or subject for an interactive step, then move on. */
export async function makeForTour(kind: 'folder' | 'subject', rawName: string): Promise<void> {
  const name = rawName.trim().slice(0, 40) || (await suggestName(kind));
  if (kind === 'folder') {
    const folderId = await addFolder({ name, color: FOLDER_COLOR });
    set({ ...state, made: { ...state.made, folderId, folderName: name } });
  } else {
    const subjectId = await addSubject({ name, color: SUBJECT_COLOR, folderId: state.made.folderId });
    set({ ...state, made: { ...state.made, subjectId, subjectName: name } });
  }
  if (state.step !== null) setTourStep(state.step + 1);
}
