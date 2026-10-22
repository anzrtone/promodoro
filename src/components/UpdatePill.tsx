/** Where "a new release is out" lives: a sidebar pill (desktop), a Settings banner (phones), and the launch-time effects. */
import { useEffect, useSyncExternalStore } from 'react';
import { BookOpen, X } from 'lucide-react';
import { updateSettings, useStoredSettings } from '@/db/settings';
import { isFocusMode } from '@/features/focusMode';
import { openDevLog } from '@/features/devlog';
import { toast } from '@/features/toasts';
import { checkForUpdates, currentVersion, dismissUpdate, newerRelease, useUpdate } from '@/features/updates';
import { engine } from '@/hooks/usePromodoroEngine';
import { Pomo } from './Pomo';

/** Desktop sidebar footer: the update pill (when there is one) and the Dev log shortcut. */
export function SidebarFooter() {
  const { release, visible } = useUpdate();
  return (
    <div className="mt-auto space-y-2 pt-4">
      {visible && release && (
        <div className="flex items-center rounded-full border border-[#E9C85C] bg-halo pl-1 pr-1 shadow-pill animate-pop">
          <button className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left" onClick={openDevLog} title={`Promodoro ${release.version} is available. See what's new.`}>
            <Pomo mood="cheering" size={30} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-bold text-ink">v{release.version} is out!</span>
              <span className="block text-[11px] text-ink/65">See what's new</span>
            </span>
          </button>
          <button className="rounded-full p-1.5 text-ink/50 hover:text-ink" onClick={() => void dismissUpdate(release.version)} aria-label="Dismiss update notice">
            <X size={13} />
          </button>
        </div>
      )}
      <button className="pill !justify-start gap-3 px-3 py-2 text-[13px] text-ink/60 hover:bg-sheet hover:text-ink" onClick={openDevLog}>
        <BookOpen size={16} /> Dev log <span className="ml-auto text-[11px] text-ink/40">v{currentVersion()}</span>
      </button>
    </div>
  );
}

/** Top of Settings on phones, where there is no sidebar. */
export function UpdateBanner() {
  const { release, visible } = useUpdate();
  if (!visible || !release) return null;
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#E9C85C] bg-halo py-1.5 pl-2 pr-1 md:hidden">
      <Pomo mood="cheering" size={36} />
      <button className="min-w-0 flex-1 text-left leading-tight" onClick={openDevLog}>
        <span className="block text-sm font-bold">v{release.version} is out!</span>
        <span className="block text-xs text-ink/65">Tap to see what's new and get it on GitHub</span>
      </button>
      <button className="rounded-full p-2 text-ink/50" onClick={() => void dismissUpdate(release.version)} aria-label="Dismiss update notice">
        <X size={15} />
      </button>
    </div>
  );
}

/**
 * Renders nothing. On launch: check GitHub (at most daily), pop one toast per new release, and show the dev log
 * once after the app itself was updated. Never while a timer is running or in Focus Mode.
 */
export function UpdateEffects() {
  const stored = useStoredSettings();
  const busy = useSyncExternalStore(engine.subscribe, () => engine.getState().timers.some((t) => t.status === 'running'));
  const ready = !!stored;

  useEffect(() => {
    if (ready) void checkForUpdates();
  }, [ready]);

  const release = stored ? newerRelease(stored) : null;
  const notify = !!release && stored?.notifiedUpdate !== release.version && stored?.dismissedUpdate !== release.version;
  useEffect(() => {
    if (!release || !notify || busy || isFocusMode()) return;
    void updateSettings({ notifiedUpdate: release.version });
    toast({ text: `Promodoro ${release.version} is out!`, tone: 'info', ttl: 9000, action: { label: 'See what’s new', run: openDevLog } });
  }, [release?.version, notify, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const version = currentVersion();
  useEffect(() => {
    if (!stored || stored.lastSeenVersion === version) return;
    if (!stored.onboarded) {
      void updateSettings({ lastSeenVersion: version }); // a fresh install has nothing to catch up on
      return;
    }
    if (busy || isFocusMode()) return;
    void updateSettings({ lastSeenVersion: version });
    openDevLog();
  }, [stored?.lastSeenVersion, stored?.onboarded, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
