/**
 * The Sticker Book: gentle, collectible milestones.
 *
 * Deliberately *not* streaks. Stickers celebrate the behaviours other apps punish:
 * coming back after time away, finishing early, recovering forgotten time, resting.
 * Nothing is ever lost and no sticker can be "broken".
 */
import { db } from '@/db/schema';
import { HOUR, MINUTE } from '@/engine/time';
import { daysAwayBefore } from '@/engine/stats';
import type { Session } from '@/engine/types';
import { toast } from './toasts';

import content from '@/assets/stickers/content.webp';
import flustered from '@/assets/stickers/flustered.webp';
import grumpy from '@/assets/stickers/grumpy.webp';
import neutral from '@/assets/stickers/neutral.webp';
import peek from '@/assets/stickers/peek.webp';
import puzzled from '@/assets/stickers/puzzled.webp';
import shy from '@/assets/stickers/shy.webp';
import smitten from '@/assets/stickers/smitten.webp';
import teary from '@/assets/stickers/teary.webp';
import done from '@/assets/stickers/done.webp';
import excited from '@/assets/stickers/excited.webp';
import hundred from '@/assets/stickers/hundred.webp';
import moving from '@/assets/stickers/moving.webp';
import nerd from '@/assets/stickers/nerd.webp';
import backup from '@/assets/stickers/backup.webp';
import sleeping from '@/assets/stickers/sleeping.webp';

export const STICKER_ART = {
  content, flustered, grumpy, neutral, peek, puzzled, shy, smitten, teary,
  done, excited, hundred, moving, nerd, backup, sleeping,
};

export interface StickerDef {
  id: string;
  title: string;
  blurb: string;
  hint: string;
  art: keyof typeof STICKER_ART;
  tilt: number;
}

export const STICKERS: StickerDef[] = [
  { id: 'first-page', title: 'First page', blurb: 'Your very first session. Hello!', hint: 'Finish any focus session', art: 'content', tilt: -4 },
  { id: 'in-the-flow', title: 'In the flow', blurb: 'You kept going past zero, and every minute counted.', hint: 'Keep working past the alarm', art: 'smitten', tilt: 3 },
  { id: 'found-time', title: 'Found time', blurb: 'You recovered time you forgot to track. It counts.', hint: 'Backdate, turn the clock forward, or claim a gap', art: 'puzzled', tilt: -2 },
  { id: 'done-is-done', title: 'Done is done', blurb: 'Wrapped up early. Knowing when to stop is a skill.', hint: 'Finish a session before the timer', art: 'done', tilt: 5 },
  { id: 'welcome-back', title: 'Welcome back', blurb: 'A few days away, and here you are. Pomo missed you.', hint: 'Come back after 3+ days away', art: 'excited', tilt: -5 },
  { id: 'rest-counts', title: 'Rest counts', blurb: 'Ten breaks taken. Rest is part of the work.', hint: 'Take 10 breaks', art: 'sleeping', tilt: 2 },
  { id: 'long-haul', title: 'Long haul', blurb: 'A single stretch of 90 minutes or more.', hint: 'One session of 90+ minutes', art: 'flustered', tilt: -3 },
  { id: 'ten-pages', title: 'Ten pages', blurb: 'Ten days of notebook filled. Pomo is very impressed.', hint: 'Focus on 10 different days', art: 'nerd', tilt: 4 },
  { id: 'hundred-hours', title: '100 hours', blurb: 'One hundred hours of focus, all yours.', hint: 'Reach 100 hours total', art: 'hundred', tilt: -4 },
  { id: 'moving-in', title: 'Moving in', blurb: 'You brought your history along. Make yourself at home.', hint: 'Import sessions from another app', art: 'moving', tilt: 3 },
  { id: 'backup-buddy', title: 'Backup buddy', blurb: 'Automatic backups on. Your notebook is safe.', hint: 'Turn on automatic backups', art: 'backup', tilt: -2 },
  { id: 'nice-to-meet-you', title: 'Nice to meet you', blurb: 'You and Pomo said hello. The first page of a cozy notebook.', hint: 'Finish the welcome notebook', art: 'shy', tilt: 4 },
  { id: 'pomo-poke', title: 'Hey!', blurb: 'Pomo has feelings too, you know.', hint: 'A secret…', art: 'grumpy', tilt: 6 },
];

export const stickerDef = (id: string) => STICKERS.find((s) => s.id === id);

export async function award(id: string): Promise<boolean> {
  const def = stickerDef(id);
  if (!def) return false;
  const added = await db.transaction('rw', db.stickers, async () => {
    if (await db.stickers.get(id)) return false;
    await db.stickers.put({ id, earnedAt: Date.now(), seen: false });
    return true;
  });
  if (added) toast({ text: `New sticker: ${def.title}`, tone: 'sticker', stickerId: id, ttl: 5200 });
  return added;
}

/** Called whenever a session is recorded (timed, manual or claimed). */
export async function evaluateSession(s: Session): Promise<void> {
  const earned = new Set(await db.stickers.toCollection().primaryKeys());
  const want = (id: string) => !earned.has(id);

  if (s.phase === 'focus') {
    if (want('first-page')) await award('first-page');
    if (want('in-the-flow') && s.overtimeMs >= MINUTE) await award('in-the-flow');
    if (want('found-time') && (s.recoveredMs > 0 || s.source === 'manual') && !s.bulk) await award('found-time');
    if (want('done-is-done') && s.endReason === 'early') await award('done-is-done');
    if (want('long-haul') && !s.bulk && s.actualMs >= 90 * MINUTE) await award('long-haul');
    if (want('welcome-back') || want('ten-pages') || want('hundred-hours')) {
      const days = await db.daily.toArray();
      const active = days.filter((d) => d.focusMs > 0).map((d) => d.day);
      if (want('welcome-back') && daysAwayBefore(s.day, active) >= 3) await award('welcome-back');
      if (want('ten-pages') && active.length >= 10) await award('ten-pages');
      if (want('hundred-hours') && days.reduce((a, d) => a + d.focusMs, 0) >= 100 * HOUR) await award('hundred-hours');
    }
  } else if ((s.phase === 'short' || s.phase === 'long') && want('rest-counts')) {
    const breaks = await db.sessions.where('phase').anyOf('short', 'long').count();
    if (breaks >= 10) await award('rest-counts');
  }
}
