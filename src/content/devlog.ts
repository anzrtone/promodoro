/**
 * The dev log: one page per release, newest first. It ships inside the app so it works offline and shows
 * "what's new" after an update. Add a page here whenever package.json's version changes
 * (tests/devlog.test.ts fails until you do).
 */
export type ChangeKind = 'new' | 'better' | 'fixed';

export interface DevLogEntry {
  version: string;
  /** ISO date, shown in the page's hand-written heading. */
  date: string;
  /** One cozy line from Pomo. */
  note: string;
  changes: Array<{ kind: ChangeKind; text: string }>;
}

export const KIND_LABEL: Record<ChangeKind, string> = { new: 'New', better: 'Better', fixed: 'Fixed' };

export const DEVLOG: DevLogEntry[] = [
  {
    version: '0.1.3',
    date: '2026-10-23',
    note: 'Your tasks finally behave, and Pomo learned to hum instead of shout in overtime.',
    changes: [
      { kind: 'new', text: 'Choose what happens when a timer goes into overtime: ring, vibrate only (the new default) or nothing.' },
      { kind: 'new', text: 'Rename a task by tapping its name (hold it in focus mode).' },
      { kind: 'new', text: 'Drag tasks by the grip in the margin to put them in your own order.' },
      { kind: 'new', text: 'Pick or change the subject straight from focus mode.' },
      { kind: 'new', text: 'Tap the empty space on the timer card to jump into focus mode.' },
      { kind: 'better', text: 'New tasks write themselves in and deleted ones slide away, instead of just popping.' },
      { kind: 'better', text: 'You can add a task from focus mode even when the list is empty.' },
      { kind: 'better', text: 'Any preset can be deleted now, not just the ones you made.' },
      { kind: 'better', text: 'A tidier Settings page, with the Support me badge in place of the tip jar.' },
      { kind: 'fixed', text: 'The "kept counting" overtime note now clears once the session ends, instead of following you into your break.' },
      { kind: 'fixed', text: "Moving a task to another subject no longer makes it vanish from today's tasks." },
      { kind: 'fixed', text: 'The Vibrate setting is now respected by Android alarms.' },
    ],
  },
  {
    version: '0.1.2',
    date: '2026-10-22',
    note: 'The notebook learns to talk: now Pomo can tell you what changed.',
    changes: [
      { kind: 'new', text: 'The dev log and update notices you are looking at now.' },
      { kind: 'new', text: 'A pill in the sidebar and a dot on Settings when a new release is out on GitHub.' },
      { kind: 'new', text: 'Contact info, a Discord invite and a Support me badge.' },
      { kind: 'better', text: 'Focus Mode, the task note, stats and timeline got a round of polish.' },
      { kind: 'better', text: 'Checking off a task is now always your call, never automatic.' },
    ],
  },
  {
    version: '0.1.1',
    date: '2026-10-22',
    note: 'A small one: a little housekeeping so every download can be checked.',
    changes: [
      { kind: 'better', text: 'Release downloads now come with checksums so you can verify them.' },
      { kind: 'better', text: 'Terms & Privacy and a Danger zone for wiping data.' },
      { kind: 'fixed', text: 'Test and source builds never talk to the official server.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-21',
    note: 'Hello, world! Pomo and the notebook are open for business.',
    changes: [
      { kind: 'new', text: 'The focus timer with gentle Flow overtime and missed-time recovery.' },
      { kind: 'new', text: 'Subjects, an honest history timeline, stats and stickers.' },
      { kind: 'new', text: 'Automatic backups, device sync and CSV import from Forest and Flow.' },
      { kind: 'new', text: 'Windows and Android apps.' },
    ],
  },
];
