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
  /** One cozy line from Pome. */
  note: string;
  changes: Array<{ kind: ChangeKind; text: string }>;
}

export const KIND_LABEL: Record<ChangeKind, string> = { new: 'New', better: 'Better', fixed: 'Fixed' };

export const DEVLOG: DevLogEntry[] = [
  {
    version: '0.1.1',
    date: '2026-10-22',
    note: 'A small one: a little housekeeping so every download can be checked.',
    changes: [
      { kind: 'new', text: 'The dev log and update notices you are looking at now.' },
      { kind: 'better', text: 'Release downloads now come with checksums so you can verify them.' },
      { kind: 'better', text: 'Terms & Privacy, a Danger zone for wiping data, and Focus Mode tweaks.' },
      { kind: 'new', text: 'Focus Mode shows a stack of your open tasks, with a smooth dropdown to collapse it to just the first.' },
      { kind: 'new', text: 'A "Show task lists" setting hides tasks everywhere if you would rather not use them.' },
      { kind: 'new', text: 'The wrap-up sheet lets you tick off the task you worked on.' },
      { kind: 'better', text: 'Tap the colored dot on any task to move it to another subject.' },
      { kind: 'better', text: 'A gentle "wrapping up" screen replaces the dark flash when a session ends.' },
      { kind: 'fixed', text: 'Finishing a session no longer marks its task done for you. That is your call.' },
      { kind: 'fixed', text: 'Test and source builds never talk to the official server.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-21',
    note: 'Hello, world! Pome and the notebook are open for business.',
    changes: [
      { kind: 'new', text: 'The focus timer with gentle Flow overtime and missed-time recovery.' },
      { kind: 'new', text: 'Subjects, an honest history timeline, stats and stickers.' },
      { kind: 'new', text: 'Automatic backups, device sync and CSV import from Forest and Flow.' },
      { kind: 'new', text: 'Windows and Android apps.' },
    ],
  },
];
