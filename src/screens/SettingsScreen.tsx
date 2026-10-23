import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Heart, Lock, Minimize2, Play, Plus, Square, Trash2 } from 'lucide-react';
import { AMBIENTS } from '@/audio/catalog';
import { previewSound, setAmbient, currentAmbient, unlockAudio } from '@/audio/engine';
import { isSoundId } from '@/audio/catalog';
import { db } from '@/db/schema';
import { updateSettings, useSettings, type AccessoryId, type OvertimeAlert, type ThemeId } from '@/db/settings';
import { uid } from '@/engine/time';
import type { ModeChoice, Preset } from '@/engine/types';
import { isSupporter, verifyLicense } from '@/features/license';
import { useNav } from '@/features/nav';
import { toast } from '@/features/toasts';
import { openLink, platform } from '@/platform';
import { Pomo } from '@/components/Pomo';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { HEARD_OPTIONS, setSurveySharing, USE_OPTIONS } from '@/features/onboarding';
import { buildSurveyPayload } from '@/features/survey';
import { setPingEnabled } from '@/features/ping';
import { LEGAL_URL } from '@/config/legal';
import { startTour } from '@/features/tour';
import { SoundSelect } from '@/components/PromodoroCard';
import { BackupPanel } from '@/components/BackupPanel';
import { SyncPanel } from '@/components/SyncPanel';
import { DangerZone } from '@/components/DangerZone';
import { UpdateBanner } from '@/components/UpdatePill';
import { openDevLog } from '@/features/devlog';
import { checkForUpdates, currentVersion } from '@/features/updates';
import { DISCORD_INVITE, RELEASES_API, SUPPORT_URL } from '@/config/updates';
import supportIcon from '@/assets/supportkori.png';
import { DiscordIcon } from '@/components/DiscordIcon';
import { cx, Section, Segmented, Slider, Stepper, Toggle } from '@/components/ui';

/** Where supporters can buy a key / tip. Change to your own page. */

const THEMES: Array<{ id: ThemeId; name: string; free: boolean; swatch: string[] }> = [
  { id: 'classic', name: 'Classic notebook', free: true, swatch: ['#FDFBF7', '#F5EFE0', '#EE6B6E', '#F4A2A2'] },
  { id: 'midnight', name: 'Midnight ink', free: true, swatch: ['#1E2128', '#292D36', '#F0787A', '#A85860'] },
  { id: 'graph', name: 'Graph paper', free: false, swatch: ['#F8FAFC', '#ECF2F7', '#EE6B6E', '#96BEE1'] },
  { id: 'sakura', name: 'Sakura', free: false, swatch: ['#FFF8F8', '#FCE9EC', '#E86680', '#F6AABE'] },
  { id: 'kraft', name: 'Kraft paper', free: false, swatch: ['#ECDEC7', '#E0CDAC', '#D65C50', '#C47864'] },
];

const ACCESSORIES: Array<{ id: AccessoryId; name: string }> = [
  { id: 'none', name: 'Just Pomo' },
  { id: 'beret', name: 'Beret' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'scarf', name: 'Scarf' },
  { id: 'party', name: 'Party hat' },
  { id: 'flower', name: 'Flower' },
];

export function SettingsScreen() {
  const nav = useNav();
  const dataRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'general' | 'sync'>(nav.settingsSection === 'sync' ? 'sync' : 'general');
  useEffect(() => {
    if (nav.settingsSection === 'sync') setTab('sync');
    else if (nav.settingsSection === 'data') {
      setTab('general');
      setTimeout(() => dataRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    }
  }, [nav.settingsSection]);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <UpdateBanner />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'general', label: 'General' },
          { value: 'sync', label: 'Sync' },
        ]}
      />
      {tab === 'sync' ? (
        <SyncPanel />
      ) : (
        <>
          <ProfileSettings />
          <TimerSettings />
          <SoundSettings />
          <AppearanceSettings />
          <div ref={dataRef} className="space-y-4 scroll-mt-4">
            <BackupPanel />
          </div>
          {platform().kind === 'desktop' && <DesktopSettings />}
          <SupporterSettings />
          <About />
          <DangerZone />
        </>
      )}
    </div>
  );
}

function ProfileSettings() {
  const s = useSettings();
  const [name, setName] = useState<string | null>(null);
  const [retake, setRetake] = useState(false);
  const label = <T extends string>(opts: Array<{ id: T; label: string; emoji: string }>, id: T) => {
    const o = opts.find((x) => x.id === id);
    return o ? `${o.emoji} ${o.label}` : id;
  };
  const survey = s.survey;
  const payload = buildSurveyPayload(s);
  return (
    <Section title="You & Pomo">
      <div className="flex items-center gap-4">
        <Pomo mood="shy" size={64} accessory={s.accessory} />
        <label className="flex-1">
          <span className="label">What Pomo calls you</span>
          <input
            className="field"
            value={name ?? s.profile.name}
            maxLength={40}
            placeholder="friend"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== null) void updateSettings({ profile: { name: name.trim() } });
              setName(null);
            }}
          />
        </label>
      </div>
      <div className="mt-4">
        <span className="label">Welcome survey</span>
        {survey ? (
          <div className="flex flex-wrap gap-1.5">
            {survey.uses.map((u) => (
              <span key={u} className="chip !cursor-default">
                {u === 'other' && survey.usesOther ? `✨ ${survey.usesOther}` : label(USE_OPTIONS, u)}
              </span>
            ))}
            {survey.heardFrom && (
              <span className="chip !cursor-default !text-ink/60">heard via {survey.heardFrom === 'other' && survey.heardOther ? survey.heardOther : label(HEARD_OPTIONS, survey.heardFrom)}</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink/60">Not answered yet.</p>
        )}
        {survey && (
          <>
            <Toggle
              checked={s.shareSurvey}
              onChange={(v) => void setSurveySharing(v)}
              label="Share my answers anonymously"
              hint={s.shareSurvey ? 'Thank you! Turning this off deletes them from the survey server.' : 'Never your name, sessions, notes or subjects.'}
            />
            <details className="text-[13px]">
              <summary className="cursor-pointer font-bold text-ink/60 hover:text-ink">See exactly what gets sent</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-note border border-rule bg-paper p-3 text-[11.5px] leading-snug text-ink/75">{JSON.stringify(payload, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
      <Toggle
        checked={s.pingEnabled}
        onChange={(v) => void setPingEnabled(v)}
        label="Anonymous daily user count"
        hint="A random id, your platform and app version, once a day, so the developer knows roughly how many people use Promodoro. Turning it off deletes it."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-soft" onClick={() => setRetake(true)}>
          {survey ? 'Change my answers' : 'Answer the survey'}
        </button>
        <button className="btn-soft" onClick={() => startTour()}>
          Replay Pomo's tour
        </button>
      </div>
      {retake && <OnboardingScreen mode="survey" settings={s} onDone={() => setRetake(false)} />}
    </Section>
  );
}

function TimerSettings() {
  const s = useSettings();
  const presets = useLiveQuery(() => db.presets.orderBy('order').filter((p) => !p.once).toArray(), [], []);
  const savePreset = (p: Preset) => db.presets.put(p);
  const deletePreset = async (id: string) => {
    await db.presets.delete(id);
    // Don't leave the timer on a preset that no longer exists.
    if (s.presetId === id) await updateSettings({ presetId: presets.find((p) => p.id !== id)!.id });
  };
  return (
    <Section title="Timer">
      <div className="mb-3">
        <span className="label">Default mode</span>
        <Segmented<ModeChoice>
          size="sm"
          value={s.defaultMode}
          onChange={(v) => void updateSettings({ defaultMode: v })}
          options={[
            { value: 'countdown', label: 'Countdown' },
            { value: 'overtime', label: 'Gentle Flow' },
            { value: 'countup', label: 'Count up' },
          ]}
        />
        <p className="mt-1 text-xs text-ink/55">Gentle Flow chimes at zero, then keeps counting so time in the flow is never lost.</p>
      </div>
      <Toggle
        checked={s.autoAdvance}
        onChange={(v) => void updateSettings({ autoAdvance: v })}
        label="Auto-advance"
        hint="Start the next phase automatically when a countdown reaches zero. Off = wait for my tap."
      />
      <Toggle
        checked={s.focusModeAuto}
        onChange={(v) => void updateSettings({ focusModeAuto: v })}
        label="Open focus mode on start"
        hint="Go full screen with just the timer, Pomo and your task when a focus session starts. Esc or the arrow leaves it."
      />
      <div className="py-2">
        <span className="label">Suggested break</span>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            value={s.breakPolicy.mode}
            onChange={(v) => void updateSettings({ breakPolicy: { ...s.breakPolicy, mode: v } })}
            options={[
              { value: 'ratio', label: 'Based on work' },
              { value: 'preset', label: 'Fixed (preset)' },
            ]}
          />
          {s.breakPolicy.mode === 'ratio' && (
            <span className="flex items-center gap-2 text-sm">
              work ÷ <Stepper value={s.breakPolicy.ratio} min={2} max={12} onChange={(v) => void updateSettings({ breakPolicy: { ...s.breakPolicy, ratio: v } })} />
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink/55">At ÷{s.breakPolicy.ratio}: 50 min of work suggests a {Math.round(50 / s.breakPolicy.ratio)} min break.</p>
      </div>
      <div className="py-2">
        <span className="label">Breaks</span>
        <Segmented
          size="sm"
          value={s.breakMode}
          onChange={(v) => void updateSettings({ breakMode: v })}
          options={[
            { value: 'countdown', label: 'End at zero' },
            { value: 'overtime', label: 'Keep counting' },
          ]}
        />
      </div>

      <div className="mt-3">
        <span className="label">Presets</span>
        <ul className="space-y-2">
          {presets.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-note border border-rule bg-creme p-2">
              <input className="field !w-40 !py-1.5" value={p.name} onChange={(e) => void savePreset({ ...p, name: e.target.value })} />
              {(['focusMin', 'shortMin', 'longMin'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1 text-xs text-ink/60">
                  {k === 'focusMin' ? 'focus' : k === 'shortMin' ? 'short' : 'long'}
                  <Stepper value={p[k]} max={300} onChange={(v) => void savePreset({ ...p, [k]: v })} />
                </label>
              ))}
              <label className="flex items-center gap-1 text-xs text-ink/60">
                rounds
                <Stepper value={p.rounds} max={12} onChange={(v) => void savePreset({ ...p, rounds: v })} />
              </label>
              {/* Any preset can go, as long as one is left to time with. */}
              {presets.length > 1 && (
                <button className="btn-ghost !p-2" onClick={() => void deletePreset(p.id)} aria-label="Delete preset">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          className="btn-ghost mt-2"
          onClick={() => db.presets.put({ id: uid('p'), name: 'My preset', focusMin: 45, shortMin: 9, longMin: 20, rounds: 3, order: presets.length })}
        >
          <Plus size={15} /> New preset
        </button>
      </div>
    </Section>
  );
}

function SoundSettings() {
  const s = useSettings();
  const [amb, setAmb] = useState(currentAmbient());
  const test = (id?: string) => {
    unlockAudio();
    if (isSoundId(id)) previewSound(id, s.volume);
  };
  // Stop any preview ambient when leaving Settings, unless autoplay will
  // manage it (i.e. a focus session is running with autoplay on).
  useEffect(() => {
    return () => {
      if (!s.ambientAutoplay) setAmbient(null, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Section title="Sounds">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="label">Focus alarm</span>
          <div className="flex gap-2">
            <div className="flex-1">
              <SoundSelect value={s.soundId} onChange={(v) => v && void updateSettings({ soundId: v })} />
            </div>
            <button className="btn-soft !px-3" onClick={() => test(s.soundId)} aria-label="Test">
              <Play size={15} />
            </button>
          </div>
        </div>
        <div>
          <span className="label">Break alarm</span>
          <div className="flex gap-2">
            <div className="flex-1">
              <SoundSelect value={s.breakSoundId} onChange={(v) => v && void updateSettings({ breakSoundId: v })} />
            </div>
            <button className="btn-soft !px-3" onClick={() => test(s.breakSoundId)} aria-label="Test">
              <Play size={15} />
            </button>
          </div>
        </div>
      </div>
      <Slider label="Volume" value={Math.round(s.volume * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => void updateSettings({ volume: v / 100 })} />
      <Toggle checked={s.vibrate} onChange={(v) => void updateSettings({ vibrate: v })} label="Vibrate" />
      <Toggle checked={s.silent} onChange={(v) => void updateSettings({ silent: v })} label="Silent + vibrate" hint="No alarm audio at all, just a buzz and a notification." />
      <Toggle checked={s.alarmRepeat} onChange={(v) => void updateSettings({ alarmRepeat: v })} label="Repeat alarm" hint="Rings several times until you're back. Off = plays once and stops." />
      <div className="py-2">
        <span className="label">When a timer goes into overtime</span>
        <Segmented<OvertimeAlert>
          size="sm"
          value={s.overtimeAlert}
          onChange={(v) => void updateSettings({ overtimeAlert: v })}
          options={[
            { value: 'sound', label: 'Ring' },
            { value: 'vibrate', label: platform().kind === 'desktop' ? 'Notify only' : 'Vibrate only' },
            { value: 'none', label: 'Nothing' },
          ]}
        />
        <p className="mt-1 text-xs text-ink/55">
          For Gentle Flow and overtime goals: the timer keeps counting either way.{' '}
          {s.overtimeAlert === 'sound' ? 'Plays your alarm sound at the goal.' : s.overtimeAlert === 'vibrate' ? (platform().kind === 'desktop' ? 'A notification, no sound.' : 'A buzz and a notification, no sound.') : 'No sound, no buzz, no pop-up.'}
        </p>
      </div>
      {platform().kind === 'android' && (
        <>
          <Toggle checked={s.liveTimerNotification} onChange={(v) => void updateSettings({ liveTimerNotification: v })} label="Timer in the notification bar" hint="A ticking timer with pause, resume and stop buttons while one is running." />
          <Toggle checked={s.dailyReport} onChange={(v) => void updateSettings({ dailyReport: v })} label="Daily report" hint="One note each evening with how long you focused. Skipped on days you didn't." />
          {s.dailyReport && (
            <div className="flex items-center gap-3 pb-2">
              <span className="label !mb-0">Report time</span>
              <input
                type="time"
                className="field !w-auto"
                value={`${String(Math.floor(s.dailyReportMinutes / 60)).padStart(2, '0')}:${String(s.dailyReportMinutes % 60).padStart(2, '0')}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) void updateSettings({ dailyReportMinutes: h * 60 + m });
                }}
              />
            </div>
          )}
        </>
      )}
      {platform().kind === 'android' && <p className="text-xs text-ink/55">Alarms use Promodoro's own notification channels, so your phone's other sounds are never changed. When the screen is off, Android plays alarms through the notification channel at your phone's notification volume.</p>}

      <div className="mt-3">
        <span className="label">Ambient sound while you focus</span>
        <div className="flex flex-wrap gap-2">
          {AMBIENTS.map((a) => (
            <button
              key={a.id}
              className={cx('chip', amb === a.id && 'chip-on')}
              onClick={() => {
                unlockAudio();
                const next = amb === a.id ? null : a.id;
                setAmbient(next, s.ambientVolume);
                setAmb(next);
                void updateSettings({ ambient: next });
              }}
            >
              {amb === a.id ? <Square size={12} /> : <span>{a.emoji}</span>} {a.name}
            </button>
          ))}
        </div>
        <Slider
          label="Ambient volume"
          value={Math.round(s.ambientVolume * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onChange={(v) => {
            void updateSettings({ ambientVolume: v / 100 });
            if (amb) setAmbient(amb, v / 100);
          }}
        />
        <Toggle checked={s.ambientAutoplay} onChange={(v) => void updateSettings({ ambientAutoplay: v })} label="Play ambient during focus automatically" hint="Starts with focus, fades out on breaks." />
      </div>
    </Section>
  );
}


function AppearanceSettings() {
  const s = useSettings();
  const supporter = isSupporter(s.license);
  return (
    <Section title="Look & feel">
      <span className="label">Notebook</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {THEMES.map((t) => {
          const locked = !t.free && !supporter;
          return (
            <button
              key={t.id}
              className={cx('relative rounded-note border-2 p-2 text-left text-xs font-bold transition', s.theme === t.id ? 'border-tomato' : 'border-rule hover:border-ink/30')}
              onClick={() => (locked ? toast({ text: `${t.name} is a supporter theme 💛` }) : void updateSettings({ theme: t.id }))}
            >
              <div className="mb-1.5 flex h-10 overflow-hidden rounded-[8px]">
                {t.swatch.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              {t.name}
              {locked && <Lock size={12} className="absolute right-2 top-2 text-ink/50" />}
            </button>
          );
        })}
      </div>

      <span className="label mt-4">Pomo's outfit</span>
      <div className="flex flex-wrap gap-2">
        {ACCESSORIES.map((a) => {
          const locked = a.id !== 'none' && !supporter;
          return (
            <button
              key={a.id}
              className={cx('flex flex-col items-center rounded-note border-2 p-1.5 text-[11px] font-bold', s.accessory === a.id ? 'border-tomato' : 'border-rule')}
              onClick={() => (locked ? toast({ text: 'Outfits are a little thank-you for supporters 💛' }) : void updateSettings({ accessory: a.id }))}
            >
              <Pomo mood="happy" size={56} accessory={a.id} />
              <span className="flex items-center gap-1">
                {locked && <Lock size={10} />}
                {a.name}
              </span>
            </button>
          );
        })}
      </div>
      <Toggle checked={s.showTasks} onChange={(v) => void updateSettings({ showTasks: v })} label="Show task lists" hint="Turn off to hide tasks on the timer, focus mode and wrap-up." />
      <Toggle checked={s.pomoTalks} onChange={(v) => void updateSettings({ pomoTalks: v })} label="Pomo talks" hint="Little encouraging notes in the margin." />
      <Toggle checked={s.use24h} onChange={(v) => void updateSettings({ use24h: v })} label="24-hour clock" hint="Show times like 14:30 instead of 2:30 PM." />
    </Section>
  );
}

function DesktopSettings() {
  const s = useSettings();
  return (
    <Section title="Desktop">
      <Toggle
        checked={s.closeToTray}
        onChange={(v) => void updateSettings({ closeToTray: v })}
        label="Keep running in the tray when closed"
        hint="Timers and alarms keep going; quit from the tray menu."
      />
      <div className="flex flex-wrap items-center gap-3 py-2">
        <button className="btn-soft" onClick={() => window.dispatchEvent(new CustomEvent('promodoro:mini', { detail: true }))}>
          <Minimize2 size={16} /> Sticky-note mode
        </button>
        <span className="text-sm text-ink/60">
          A tiny always-on-top note. Global shortcut: <kbd className="rounded border border-rule bg-sheet px-1.5 text-xs">Ctrl</kbd>+<kbd className="rounded border border-rule bg-sheet px-1.5 text-xs">Alt</kbd>+
          <kbd className="rounded border border-rule bg-sheet px-1.5 text-xs">P</kbd> starts/pauses from anywhere. In the app: Space start/pause, D done, 1/5 nudge, O overtime, M sticky note.
        </span>
      </div>
    </Section>
  );
}

function SupporterSettings() {
  const s = useSettings();
  const [key, setKey] = useState('');
  const lic = verifyLicense(s.license);
  return (
    <Section title="Support Promodoro" aside={<Heart size={18} className="text-tomato" />}>
      <p className="mb-3 text-sm text-ink/65">
        Promodoro is free, with no ads, and it always will be. Supporters unlock cosmetic extras (notebook themes and Pomo outfits) as a thank-you.
      </p>
      {lic ? (
        <p className="font-hand text-[20px] text-leaf">Thank you, {lic.n}! 💛 All extras unlocked.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input className="field flex-1 font-mono !text-xs" placeholder="PROMO-… supporter key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            className="btn-primary"
            onClick={() => {
              if (verifyLicense(key)) {
                void updateSettings({ license: key.trim() });
                toast({ text: 'Thank you! Extras unlocked 💛', tone: 'success' });
              } else toast({ text: "That key doesn't look right. Copy the whole PROMO-… line." });
            }}
          >
            Unlock
          </button>
          <button className="pill gap-2 px-4 py-2 text-sm font-bold text-ink hover:bg-halo" onClick={() => void openLink(SUPPORT_URL)} title="Support the developer on Kori">
            <img src={supportIcon} alt="" width={20} height={20} className="rounded-md" /> Support me
          </button>
        </div>
      )}
    </Section>
  );
}

function UpdateSettings() {
  const s = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const check = async () => {
    setMsg('Checking…');
    const r = await checkForUpdates({ force: true });
    setMsg(r === 'update' ? 'A new release is out! See the dev log.' : r === 'current' ? "You're on the latest release." : r === 'failed' ? "Couldn't reach GitHub. Try again later." : "This build doesn't check for updates.");
    if (r === 'update') openDevLog();
  };
  return (
    <div className="mt-3 border-t border-rule pt-1">
      {RELEASES_API && (
        <>
          <Toggle
            checked={s.updateCheck}
            onChange={(v) => void updateSettings({ updateCheck: v })}
            label="Tell me about new releases"
            hint="Once a day Promodoro asks GitHub for the latest release. Nothing about you is sent; GitHub sees an IP address, like any web request."
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pb-1 pt-2">
        <button className="btn-soft" onClick={openDevLog}>Dev log</button>
        <button className="btn-soft" onClick={() => void openLink(DISCORD_INVITE)}>
          <DiscordIcon size={15} /> Join the Discord
        </button>
        {RELEASES_API && <button className="btn-soft" onClick={() => void check()}>Check for updates</button>}
        {msg && <span className="text-sm text-ink/60">{msg}</span>}
      </div>
    </div>
  );
}

function About() {
  return (
    <Section title="About">
      <p className="text-sm text-ink/70">
        Promodoro {currentVersion()}. Focus at your own pace. Your progress counts, even when your day isn't perfect.
      </p>
      <UpdateSettings />
      <p className="mt-2 text-xs text-ink/55">
        Your notebook never leaves this device unless you export it. Promodoro sends a once-a-day anonymous count (a random id, your platform and the app version) so the developer knows roughly how many people use it (switch it off in You & Pomo), and your welcome-survey answers only if you opt in (see You &amp; Pomo). If you leave "Tell me about new releases" on, it also asks GitHub for the latest release once a day. Device sync, if you turn it on, is end-to-end encrypted. Promodoro is not a medical tool and makes no clinical claims.
      </p>
      <p className="mt-2 text-xs">
        <a className="underline text-ink/65 hover:text-ink" href={LEGAL_URL} target="_blank" rel="noreferrer">
          Terms &amp; Privacy
        </a>
      </p>
    </Section>
  );
}
