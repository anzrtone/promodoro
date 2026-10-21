/**
 * Development-only demo data (never bundled into release builds' UI): three weeks of
 * realistic, imperfect history so the timeline, stats and share page can be designed
 * and screenshotted. Written through the real event log, exactly like real use.
 */
import { addManualSession, append } from '@/db/repo';
import { commitCsvImport } from '@/db/backup';
import { rowToSession } from '@/engine/csv';
import { dayStart, HOUR, MINUTE, addDays, today, uid } from '@/engine/time';
import type { PendingEvent } from '@/engine/timer';

export async function seedDemoData(days = 21): Promise<void> {
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const boards = ['b-study', 'b-code', 'b-write', undefined];
  const labels = ['chapter 3 notes', 'bug bash', 'essay draft', 'flashcards', 'refactor timer', undefined];
  for (let d = days; d >= 0; d--) {
    const day = addDays(today(), -d);
    if (r() < 0.18 && d > 0) continue; // days off are fine
    let t = dayStart(day) + (8 + Math.floor(r() * 3)) * HOUR + Math.floor(r() * 50) * MINUTE;
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      if (d === 0 && t > Date.now() - 40 * MINUTE) break;
      const id = uid('t');
      const overtime = r() < 0.5;
      const planned = [25, 30, 50][Math.floor(r() * 3)] * MINUTE;
      const backdate = r() < 0.12 ? 15 * MINUTE : 0;
      const ev: PendingEvent[] = [
        { type: 'timer.start', ts: t, timerId: id, data: { mode: 'countdown', overtime, phase: 'focus', plannedMs: planned, backdateMs: backdate || undefined, boardId: boards[Math.floor(r() * 4)], label: labels[Math.floor(r() * labels.length)], round: (i % 4) + 1, presetId: 'p-25-5' } } as PendingEvent,
      ];
      let worked = planned - backdate;
      if (r() < 0.25) {
        ev.push({ type: 'timer.pause', ts: t + 10 * MINUTE, timerId: id, data: {} } as PendingEvent);
        ev.push({ type: 'timer.resume', ts: t + 14 * MINUTE, timerId: id, data: {} } as PendingEvent);
        worked += 4 * MINUTE;
      }
      if (overtime) worked += Math.floor(r() * 18) * MINUTE;
      else if (r() < 0.2) worked -= 8 * MINUTE;
      const end = t + worked;
      ev.push({ type: 'timer.done', ts: end, timerId: id, data: { reason: worked < planned - backdate ? 'early' : 'complete' } } as PendingEvent);
      await append(ev);
      // a break
      const bid = uid('t');
      const brk = Math.round(worked / 5 / MINUTE) * MINUTE;
      await append([
        { type: 'timer.start', ts: end + MINUTE, timerId: bid, data: { mode: 'countdown', overtime: false, phase: 'short', plannedMs: brk } } as PendingEvent,
        { type: 'timer.done', ts: end + MINUTE + brk, timerId: bid, data: { reason: 'complete' } } as PendingEvent,
      ]);
      t = end + brk + (10 + Math.floor(r() * 70)) * MINUTE;
      if (r() < 0.15) await addManualSession({ start: t - 30 * MINUTE, end: t - 5 * MINUTE, durationMs: 25 * MINUTE, phase: 'focus', kind: 'claim', label: 'reading' });
    }
  }
  await commitCsvImport(
    [rowToSession({ start: dayStart(addDays(today(), -days - 2)) + 9 * HOUR, end: dayStart(addDays(today(), -days - 2)) + 10 * HOUR, durationMs: HOUR, label: 'Forest import' }, 'forest.csv')],
    'forest.csv',
  );
}
