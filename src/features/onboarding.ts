/**
 * The welcome notebook: Pomo says hello, learns your name, and asks two light questions.
 * Answers are useful on this device first (they pick your starting subjects); sending them
 * anywhere is a separate, opt-in choice (see survey.ts).
 */
import { db } from '@/db/schema';
import { getSettings, updateSettings, type HeardId, type SurveyAnswers, type UseId } from '@/db/settings';
import type { Board } from '@/engine/types';
import { award } from './stickers';
import { newInstallId, syncSurvey } from './survey';
import { startTour } from './tour';

export const ONBOARDING_VERSION = 1;

export const USE_OPTIONS: Array<{ id: UseId; label: string; emoji: string; pomo: string }> = [
  { id: 'study', label: 'Studying', emoji: '📚', pomo: 'A scholar! I love flashcards.' },
  { id: 'code', label: 'Coding', emoji: '💻', pomo: "A coder! I'll guard your flow." },
  { id: 'write', label: 'Writing', emoji: '✍️', pomo: 'Ooh, a writer. Words count too!' },
  { id: 'work', label: 'Deep work', emoji: '🎯', pomo: 'Heads down, notifications off.' },
  { id: 'create', label: 'Creative projects', emoji: '🎨', pomo: 'Make something lovely!' },
  { id: 'bodydouble', label: 'Body doubling / ADHD focus', emoji: '👥', pomo: "I'll sit right here with you." },
  { id: 'admin', label: 'Chores & life admin', emoji: '🧺', pomo: 'Even laundry deserves a timer.' },
  { id: 'other', label: 'Something else', emoji: '✨', pomo: 'A mystery! Tell me more?' },
];

export const HEARD_OPTIONS: Array<{ id: HeardId; label: string; emoji: string; pomo: string }> = [
  { id: 'friend', label: 'A friend', emoji: '👋', pomo: 'Tell them Pomo says hi!' },
  { id: 'social', label: 'TikTok / Instagram', emoji: '📱', pomo: 'Was I famous? Was I cute?' },
  { id: 'reddit', label: 'Reddit', emoji: '🗨️', pomo: 'Upvotes for everyone!' },
  { id: 'youtube', label: 'YouTube', emoji: '▶️', pomo: 'A study-with-me, maybe?' },
  { id: 'search', label: 'Searching online', emoji: '🔍', pomo: 'You found me!' },
  { id: 'store', label: 'App store', emoji: '🛍️', pomo: 'Browsing paid off!' },
  { id: 'shared-page', label: "Someone's shared notebook page", emoji: '📓', pomo: 'A shared page? My plan is working!' },
  { id: 'other', label: 'Somewhere else', emoji: '🌱', pomo: 'Ooh, where? Do tell.' },
];

/** The starting subject each use suggests. Study/Coding/Writing reuse the ids ensureSeeded() creates. */
const USE_SUBJECTS: Record<Exclude<UseId, 'other'>, Pick<Board, 'id' | 'name' | 'color'>> = {
  study: { id: 'b-study', name: 'Study', color: '#EE6B6E' },
  code: { id: 'b-code', name: 'Coding', color: '#52B788' },
  write: { id: 'b-write', name: 'Writing', color: '#E9B949' },
  work: { id: 'b-work', name: 'Deep work', color: '#6E98CC' },
  create: { id: 'b-create', name: 'Creative', color: '#B98AD9' },
  bodydouble: { id: 'b-focus', name: 'Focus time', color: '#F4A2A2' },
  admin: { id: 'b-admin', name: 'Life admin', color: '#7FC8A9' },
};
const SEEDED = ['b-study', 'b-code', 'b-write'];

export function greeting(name: string, hour = new Date().getHours()): string {
  const who = name.trim() || 'friend';
  if (hour < 5) return `Up late, ${who}? Gently does it.`;
  if (hour < 12) return `Good morning, ${who}!`;
  if (hour < 18) return `Good afternoon, ${who}!`;
  return `Good evening, ${who}!`;
}

/**
 * Swap the three sample subjects for ones that match what you said you'd use Promodoro for.
 * Only touches sample subjects nothing points at yet, so it's safe on any install.
 */
export async function applyUseSubjects(uses: UseId[], usesOther = ''): Promise<string | null> {
  const wanted: Array<Pick<Board, 'id' | 'name' | 'color'>> = uses.flatMap((u) => (u === 'other' ? [] : [USE_SUBJECTS[u]]));
  const other = usesOther.trim().slice(0, 24);
  if (uses.includes('other') && other) wanted.push({ id: 'b-other', name: other, color: '#D9A73A' });
  if (!wanted.length) return null;
  return db.transaction('rw', db.boards, db.sessions, db.tasks, db.notes, async () => {
    for (const id of SEEDED) {
      if (wanted.some((w) => w.id === id)) continue;
      const used = (await db.sessions.where('boardId').equals(id).count()) + (await db.tasks.where('boardId').equals(id).count()) + (await db.notes.where('boardId').equals(id).count());
      if (!used) await db.boards.delete(id);
    }
    const existing = await db.boards.toArray();
    let order = 0;
    for (const w of wanted) {
      const have = existing.find((b) => b.id === w.id || b.name.toLowerCase() === w.name.toLowerCase());
      if (have) await db.boards.update(have.id, { order: order++, archived: false });
      else await db.boards.put({ ...w, order: order++ });
    }
    for (const b of existing) if (!wanted.some((w) => w.id === b.id || w.name.toLowerCase() === b.name.toLowerCase())) await db.boards.update(b.id, { order: order++ });
    const first = wanted[0];
    return (existing.find((b) => b.name.toLowerCase() === first.name.toLowerCase())?.id ?? first.id) as string;
  });
}

export type OnboardingMode = 'full' | 'returning' | 'survey';

export interface OnboardingResult {
  name?: string;
  uses: UseId[];
  usesOther: string;
  heardFrom: HeardId | null;
  heardOther: string;
  share: boolean;
  presetId?: string;
}

export function hasAnswers(r: Pick<OnboardingResult, 'uses' | 'heardFrom'>): boolean {
  return r.uses.length > 0 || r.heardFrom !== null;
}

export async function completeOnboarding(mode: OnboardingMode, r: OnboardingResult, { tour = true } = {}): Promise<void> {
  const s = await getSettings();
  const survey: SurveyAnswers | null = hasAnswers(r)
    ? { uses: r.uses, usesOther: r.usesOther, heardFrom: r.heardFrom, heardOther: r.heardOther, answeredAt: Date.now() }
    : s.survey;
  const changed = JSON.stringify(survey && { ...survey, answeredAt: 0 }) !== JSON.stringify(s.survey && { ...s.survey, answeredAt: 0 });
  const boardId = mode === 'full' && (await db.sessions.count()) === 0 ? await applyUseSubjects(r.uses, r.usesOther) : null;
  await updateSettings({
    ...(r.name !== undefined ? { profile: { name: r.name.trim().slice(0, 40) } } : {}),
    survey,
    shareSurvey: r.share,
    installId: r.share ? s.installId ?? newInstallId() : s.installId,
    // New answers need sending again; the endpoint upserts by install id.
    ...(changed && r.share ? { surveySentAt: null } : {}),
    ...(r.presetId ? { presetId: r.presetId, round: 1 } : {}),
    ...(boardId ? { boardId } : {}),
    onboarded: true,
    onboardingVersion: ONBOARDING_VERSION,
  });
  void syncSurvey();
  // The tour hands out the sticker at its end; everyone else gets it now.
  if (mode === 'full' && tour) startTour();
  else if (mode !== 'survey') void award('nice-to-meet-you');
}

/** Turn sharing on or off from Settings. Turning it off asks the endpoint to delete what it has. */
export async function setSurveySharing(on: boolean): Promise<void> {
  const s = await getSettings();
  await updateSettings({ shareSurvey: on, installId: on ? s.installId ?? newInstallId() : s.installId });
  void syncSurvey();
}
