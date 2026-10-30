/**
 * The dev "preview account": a separate notebook (its own IndexedDB) pre-filled with a small,
 * realistic history, folders, subjects, tasks and notes, so analytics and the folder tree have
 * something to show. Reuses the tour's sample-history generator for the sessions.
 */
import { db } from '@/db/schema';
import { updateSettings } from '@/db/settings';
import { DEFAULT_PRESETS } from '@/engine/cycle';
import { summarizeDay } from '@/engine/stats';
import { dayStart, HOUR, MINUTE, today, tzNow, localDay } from '@/engine/time';
import type { Board, Folder, Note, Session } from '@/engine/types';
import { buildDemo } from '@/features/demo';
import { STICKERS } from '@/features/stickers';
import { currentVersion } from '@/features/updates';

const SEEDED = 'devPreviewSeeded';

const FOLDERS: Folder[] = [
  { id: 'pv-f-uni', name: 'University', color: '#8FB8E8', order: 0 },
  { id: 'pv-f-bio', name: 'Biology', color: '#52B788', parentId: 'pv-f-uni', order: 1 },
  { id: 'pv-f-work', name: 'Work', color: '#F4A261', order: 2 },
];

const BOARDS: Board[] = [
  { id: 'pv-b-anat', name: 'Anatomy', color: '#EE6B6E', folderId: 'pv-f-bio', order: 0 },
  { id: 'pv-b-gen', name: 'Genetics', color: '#52B788', folderId: 'pv-f-bio', order: 1 },
  { id: 'pv-b-calc', name: 'Calculus', color: '#9B8FE8', folderId: 'pv-f-uni', order: 2 },
  { id: 'pv-b-essay', name: 'Essay writing', color: '#E9B949', folderId: 'pv-f-uni', order: 3 },
  { id: 'pv-b-job', name: 'Day job', color: '#4FB0C6', folderId: 'pv-f-work', order: 4 },
  { id: 'pv-b-read', name: 'Reading', color: '#D98BC4', order: 5 },
];

/** Roughly how often each subject gets picked (index-aligned with BOARDS). */
const WEIGHTS = [5, 3, 4, 2, 5, 1];

export const isPreviewSeeded = async () => !!(await db.settings.get(SEEDED));

function pickBoard(i: number): string {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let n = (i * 7 + 3) % total;
  for (let k = 0; k < WEIGHTS.length; k++) {
    if ((n -= WEIGHTS[k]) < 0) return BOARDS[k].id;
  }
  return BOARDS[0].id;
}

export async function seedPreview(name = 'Preview'): Promise<void> {
  const data = buildDemo(today(), BOARDS);
  const sessions: Session[] = data.sessions.map((s, i) => ({ ...s, id: s.id.replace('demo-', 'pv-'), boardId: s.phase === 'focus' ? pickBoard(i) : undefined }));

  // A couple of sessions earlier today, so "today" isn't empty.
  const now = Date.now();
  const midnight = dayStart(today());
  [[3 * HOUR, 25], [90 * MINUTE, 50]].forEach(([ago, min], i) => {
    const start = now - ago;
    if (start < midnight) return;
    const actual = min * MINUTE;
    sessions.push({ id: `pv-today${i}`, start, end: start + actual, tz: tzNow(start), day: localDay(start), phase: 'focus', mode: 'countdown', boardId: BOARDS[i * 4].id, plannedMs: actual, actualMs: actual, timedMs: actual, recoveredMs: 0, pausedMs: 0, overtimeMs: 0, source: 'timed', endReason: 'complete', createdAt: start });
  });

  const daily = [...new Set(sessions.map((s) => s.day))].map((d) => summarizeDay(d, sessions));
  const tasks = data.tasks.map((t, i) => ({ ...t, id: t.id.replace('demo-', 'pv-'), boardId: i % 3 === 2 ? undefined : BOARDS[i % BOARDS.length].id, folderId: i % 3 === 2 ? FOLDERS[i % FOLDERS.length].id : undefined }));
  const t0 = Date.now();
  const notes: Note[] = [
    { id: 'pv-n1', title: 'Exam plan', body: 'Week 1: muscles\nWeek 2: nerves\nWeek 3: past papers', boardId: 'pv-b-anat', createdAt: t0, updatedAt: t0, order: 0 },
    { id: 'pv-n2', title: 'Semester goals', body: 'Keep at least 2h/day on weekdays.', folderId: 'pv-f-uni', createdAt: t0, updatedAt: t0, order: 1 },
    { id: 'pv-n3', title: 'Standup notes', body: 'Ship the invoice export on Thursday.', boardId: 'pv-b-job', createdAt: t0, updatedAt: t0, order: 2 },
  ];

  await db.transaction('rw', [db.folders, db.boards, db.sessions, db.daily, db.tasks, db.notes, db.events, db.stickers, db.settings], async () => {
    await db.folders.bulkPut(FOLDERS);
    await db.boards.bulkPut(BOARDS);
    await db.sessions.bulkPut(sessions);
    await db.daily.bulkPut(daily);
    await db.tasks.bulkPut(tasks);
    await db.notes.bulkPut(notes);
    await db.events.bulkAdd(data.events);
    await db.settings.put({ key: SEEDED, value: Date.now() });
  });
  await fillStickers();
  await updateSettings({ onboarded: true, boardId: BOARDS[0].id, profile: { name }, pingEnabled: false, updateCheck: false, syncTourSeen: true, lastSeenVersion: currentVersion(), presetId: DEFAULT_PRESETS[0].id, dailyGoalMs: 2 * HOUR });
}

/** Empty the preview notebook (it is its own database, so the real one is never touched). */
export async function wipePreview(): Promise<void> {
  await db.delete();
}

/** The preview book always shows every sticker earned, so new art can be eyeballed. Runs on every boot. */
async function fillStickers(): Promise<void> {
  const earnedAt = Date.now();
  await db.stickers.bulkPut(STICKERS.map((s) => ({ id: s.id, earnedAt, seen: true })));
}

/** Filming mode: start from the same notebook on every load, so every take of a shot matches. */
export async function seedPromo(): Promise<void> {
  await db.delete();
  await db.open();
  await seedPreview('Sam');
}

export async function ensurePreviewSeeded(): Promise<void> {
  await db.open();
  if (!(await isPreviewSeeded())) await seedPreview();
  else await fillStickers();
}
