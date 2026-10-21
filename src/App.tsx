import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, CalendarClock, FolderOpen, Maximize2, Settings, Sticker, Timer } from 'lucide-react';
import { setAmbient } from '@/audio/engine';
import { db } from '@/db/schema';
import { useSettings, useStoredSettings } from '@/db/settings';
import { isBreak } from '@/engine/cycle';
import { isSupporter } from '@/features/license';
import { navigate, useNav, type Tab } from '@/features/nav';
import { dismissToast, useToasts } from '@/features/toasts';
import { STICKER_ART, stickerDef } from '@/features/stickers';
import { engine, usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { isFocusMode, setFocusMode } from '@/features/focusMode';
import { platform } from '@/platform';
import { PromodoroCard } from '@/components/PromodoroCard';
import { cx } from '@/components/ui';
import { FocusScreen } from '@/screens/FocusScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { StatsScreen } from '@/screens/StatsScreen';
import { StickerScreen } from '@/screens/StickerScreen';
import { SubjectsScreen } from '@/screens/SubjectsScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { TourOverlay } from '@/components/TourOverlay';
import { TimelineScreen } from '@/screens/TimelineScreen';

const TABS: Array<{ id: Tab; label: string; icon: typeof Timer }> = [
  { id: 'focus', label: 'Focus', icon: Timer },
  { id: 'subjects', label: 'Subjects', icon: FolderOpen },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'stickers', label: 'Stickers', icon: Sticker },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function App() {
  const { tab } = useNav();
  const settings = useSettings();
  const welcome = useWelcome();
  const [mini, setMini] = useState(false);
  useTheme(settings.theme, settings.license);
  useAmbientAutoplay();
  useKeyboardShortcuts();
  useFocusModeAutoOpen(settings.focusModeAuto);
  const newStickers = useLiveQuery(() => db.stickers.filter((s) => !s.seen).count(), [], 0);

  // Android back: close sheets first, then go back to Focus, then minimise.
  useEffect(() => {
    engine.setBackHandler(() => {
      const ev = new Event('promodoro:back', { cancelable: true });
      window.dispatchEvent(ev);
      if (ev.defaultPrevented) return true;
      if (tab !== 'focus') {
        navigate('focus');
        return true;
      }
      return false;
    });
    return () => engine.setBackHandler(null);
  }, [tab]);

  // Desktop sticky-note mode (from Settings, tray menu, or the expand button).
  useEffect(() => {
    const set = (on: boolean) => {
      setMini(on);
      void platform().setMiniMode?.(on);
    };
    const onMini = (e: Event) => set((e as CustomEvent<boolean>).detail);
    const onNative = (e: Event) => (e as CustomEvent<string>).detail === 'mini' && set(!mini);
    window.addEventListener('promodoro:mini', onMini);
    window.addEventListener('promodoro:native-action', onNative);
    return () => {
      window.removeEventListener('promodoro:mini', onMini);
      window.removeEventListener('promodoro:native-action', onNative);
    };
  }, [mini]);

  // The scroller is shared by every tab, so each tab opens at the top.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  if (mini) return <MiniMode onExpand={() => window.dispatchEvent(new CustomEvent('promodoro:mini', { detail: false }))} />;

  const Screen = { focus: FocusScreen, subjects: SubjectsScreen, timeline: TimelineScreen, stats: StatsScreen, stickers: StickerScreen, settings: SettingsScreen }[tab];

  return (
    <div className="flex h-full">
      {/* Desktop: notebook index tabs down the side */}
      <nav className="hidden w-[184px] shrink-0 flex-col gap-1 border-r border-rule bg-paper/60 px-3 py-5 md:flex">
        <div className="mb-5 px-2">
          <div className="font-display text-2xl font-semibold text-tomato">Promodoro</div>
          <div className="font-hand text-[16px] text-ink/55">focus at your own pace</div>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(t.id)}
            data-tour={t.id}
            className={cx(
              'pill relative !justify-start gap-3 px-3 py-2.5 text-[15px]',
              tab === t.id ? 'bg-halo text-ink shadow-pill' : 'text-ink/65 hover:bg-sheet hover:text-ink',
            )}
          >
            <t.icon size={18} /> {t.label}
            {t.id === 'stickers' && newStickers > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-tomato" />}
          </button>
        ))}
      </nav>

      <main ref={mainRef} className="bg-notebook relative flex-1 overflow-y-auto overflow-x-hidden safe-pt [--pm-margin-x:28px] md:[--pm-margin-x:44px]">
        <div className="min-h-full px-4 pb-28 pt-6 sm:pl-14 sm:pr-8 md:pb-10">
          <Screen />
        </div>
      </main>

      {/* Android / narrow: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-paper/95 backdrop-blur safe-pb md:hidden">
        {TABS.map((t) => (
          <button key={t.id} data-tour={t.id} onClick={() => navigate(t.id)} className={cx('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold', tab === t.id ? 'text-tomato' : 'text-ink/55')}>
            <span className={cx('rounded-full px-4 py-1', tab === t.id && 'bg-halo text-ink')}>
              <t.icon size={20} />
            </span>
            {t.label}
            {t.id === 'stickers' && newStickers > 0 && <span className="absolute right-[30%] top-1.5 h-2 w-2 rounded-full bg-tomato" />}
          </button>
        ))}
      </nav>

      <Toasts />
      <TourOverlay />
      {welcome && <OnboardingScreen mode={welcome.mode} settings={welcome.settings} />}
    </div>
  );
}

/** First run (or first launch since onboarding existed): which welcome notebook to show, if any. */
function useWelcome() {
  const stored = useStoredSettings();
  const sessions = useLiveQuery(() => db.sessions.count(), []);
  if (!stored || stored.onboarded || sessions === undefined) return null;
  return { mode: sessions > 0 ? ('returning' as const) : ('full' as const), settings: stored };
}

function MiniMode({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex h-full flex-col bg-creme p-2" data-tauri-drag-region>
      <div className="flex justify-end" data-tauri-drag-region>
        <button className="btn-ghost !p-1.5" onClick={onExpand} aria-label="Expand" title="Back to the full notebook">
          <Maximize2 size={15} />
        </button>
      </div>
      <PromodoroCard compact />
    </div>
  );
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => {
        const def = t.stickerId ? stickerDef(t.stickerId) : undefined;
        return (
          <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-full border border-rule bg-sheet py-2 pl-3 pr-4 shadow-lift animate-pop">
            {def && <img src={STICKER_ART[def.art]} alt="" className="-my-3 h-12 w-12 object-contain" />}
            <span className={cx('text-sm font-bold', t.tone === 'success' && 'text-leaf')}>{t.text}</span>
            {t.action && (
              <button
                className="text-sm font-bold text-tomato"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            {def && (
              <button className="text-sm font-bold text-tomato" onClick={() => navigate('stickers')}>
                See
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useTheme(theme: string, license: string | null) {
  useEffect(() => {
    const free = theme === 'classic' || theme === 'midnight';
    const t = free || isSupporter(license) ? theme : 'classic';
    document.documentElement.dataset.theme = t;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--pm-creme').trim().split(/\s+/).join(',');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${bg})`);
  }, [theme, license]);
}

/** Open focus mode when a new focus session starts (not on launch with one already running, not for auto-started phases). */
function useFocusModeAutoOpen(on: boolean) {
  const { primary, ready } = usePromodoroEngine();
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const id = primary?.id ?? null;
    if (seen.current !== undefined && id && id !== seen.current && on && primary?.phase === 'focus' && !primary.auto) setFocusMode(true);
    seen.current = id;
  }, [ready, primary?.id, primary?.phase, primary?.auto, on]);
}

/** Optional: ambient bed starts with focus and fades out on breaks / when stopped. */
function useAmbientAutoplay() {
  const { primary } = usePromodoroEngine();
  const s = useSettings();
  const key = primary ? `${primary.phase}:${primary.status}` : 'none';
  useEffect(() => {
    if (!s.ambientAutoplay || !s.ambient) return;
    const on = primary?.phase === 'focus' && primary.status === 'running';
    if (on) setAmbient(s.ambient, s.ambientVolume);
    else if (!primary || isBreak(primary.phase) || primary.status === 'paused') setAmbient(null, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.ambientAutoplay, s.ambient]);
}

/**
 * Desktop keyboard shortcuts (ignored while typing):
 *   Space start/pause · D done · 1 / 5 nudge +1 / +5 min · O overtime · F focus mode · M sticky-note mode
 */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      const p = engine.primary();
      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        void engine.toggle();
      } else if (key === 'd' && p) void engine.done(p.id);
      else if ((key === '1' || key === '5') && p && p.plannedMs > 0) void engine.nudge(p.id, Number(key));
      else if (key === 'o' && p && p.mode === 'countdown') void engine.overtime(p.id, !p.overtime);
      else if (key === 'f' && p) setFocusMode(!isFocusMode());
      else if (key === 'm' && platform().kind === 'desktop') window.dispatchEvent(new CustomEvent('promodoro:mini', { detail: true }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
