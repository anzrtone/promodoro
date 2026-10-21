import { useLiveQuery } from 'dexie-react-hooks';
import { HardDriveDownload } from 'lucide-react';
import { db } from '@/db/schema';
import { updateSettings, useSettings } from '@/db/settings';
import { DAY, formatAgo, formatTimeOfDay, MINUTE } from '@/engine/time';
import { lastSessionEnd } from '@/engine/timeline';
import { navigate } from '@/features/nav';
import { usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { PromodoroCard } from '@/components/PromodoroCard';
import { Notices, WrapSheet } from '@/components/SessionSheets';
import { SideTimers } from '@/components/SideTimers';
import { TaskNote } from '@/components/TaskNote';
import { FocusMode } from '@/components/FocusMode';

export function FocusScreen() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
      <LastSessionLine />
      <Notices />
      <PromodoroCard />
      <SideTimers />
      <TaskNote />
      <BackupReminder />
      <WrapSheet />
      <FocusMode />
    </div>
  );
}

/** "Last session ended 47 min ago": always visible, so forgetting to start is never a mystery. */
function LastSessionLine() {
  const { primary, now } = usePromodoroEngine();
  const last = useLiveQuery(async () => lastSessionEnd(await db.sessions.where('end').above(Date.now() - 14 * DAY).toArray()), []);
  if (primary || !last) return <div className="h-6" />;
  const ago = now - last.end;
  return (
    <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-center font-hand text-[20px] text-ink/60">
      <span>
        last session ended <b className="text-ink/80">{formatAgo(ago)}</b>
        {ago < DAY && ` (${formatTimeOfDay(last.end)})`}
      </span>
      {ago > 10 * MINUTE && ago < 8 * 60 * MINUTE && (
        <button className="text-[19px] text-tomato underline decoration-dotted underline-offset-4" onClick={() => navigate('timeline')}>
          worked since? claim it →
        </button>
      )}
    </p>
  );
}

/** A gentle, rare nudge. Never nags; disappears for good once auto-backup is on. */
function BackupReminder() {
  const s = useSettings();
  const sessions = useLiveQuery(() => db.sessions.count(), [], 0);
  const now = Date.now();
  const last = s.autoBackup.enabled && !s.autoBackup.lastError ? now : s.lastBackupAt ?? s.installedAt;
  const due = sessions >= 5 && now - last > s.backupReminderDays * DAY && now > s.backupSnoozedUntil;
  if (!due) return null;
  return (
    <div className="sticky-note flex items-start gap-3 p-3">
      <HardDriveDownload className="mt-1 shrink-0 text-ink/50" size={20} />
      <div className="flex-1">
        <p className="font-hand text-[19px] leading-6">Your notebook lives only on this device. Want a safety copy?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="chip chip-on" onClick={() => navigate('settings', { settingsSection: 'data' })}>
            Turn on auto-backup
          </button>
          <button className="chip" onClick={() => void updateSettings({ backupSnoozedUntil: now + 7 * DAY })}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
