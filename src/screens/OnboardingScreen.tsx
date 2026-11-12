/**
 * The welcome notebook. A few pages, one question each, with Pomo reacting as you go.
 * Every page can be skipped; nothing here is required to use the app.
 */
import { LEGAL_URL } from '@/config/legal';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { db } from '@/db/schema';
import type { AppSettings, HeardId, UseId } from '@/db/settings';
import { completeOnboarding, hasAnswers, HEARD_OPTIONS, USE_OPTIONS, type OnboardingMode } from '@/features/onboarding';
import { buildSurveyPayload } from '@/features/survey';
import { Pomo, POMO_LINES, type PomoMood } from '@/components/Pomo';
import { cx, Toggle } from '@/components/ui';

type Page = 'hello' | 'name' | 'uses' | 'heard' | 'pace' | 'consent';

const PAGES: Record<OnboardingMode, Page[]> = {
  full: ['hello', 'name', 'uses', 'heard', 'pace', 'consent'],
  returning: ['name', 'uses', 'heard', 'consent'],
  survey: ['uses', 'heard', 'consent'],
};

/** `settings` must be the stored settings (not the loading defaults): retakes start from them. */
export function OnboardingScreen({ mode, settings: s, onDone }: { mode: OnboardingMode; settings: AppSettings; onDone?: () => void }) {
  const pages = PAGES[mode];
  const [i, setI] = useState(0);
  const page = pages[i];
  const last = i === pages.length - 1;

  // Retakes start from your previous answers.
  const [name, setName] = useState(s.profile.name);
  const [uses, setUses] = useState<UseId[]>(mode === 'full' ? [] : s.survey?.uses ?? []);
  const [usesOther, setUsesOther] = useState(mode === 'full' ? '' : s.survey?.usesOther ?? '');
  const [heard, setHeard] = useState<HeardId | null>(mode === 'full' ? null : s.survey?.heardFrom ?? null);
  const [heardOther, setHeardOther] = useState(mode === 'full' ? '' : s.survey?.heardOther ?? '');
  const [presetId, setPresetId] = useState<string | undefined>();
  const [share, setShare] = useState(mode === 'full' ? false : s.shareSurvey);
  const [busy, setBusy] = useState(false);

  const [reaction, setReaction] = useState<{ mood: PomoMood; line: string; key: number } | null>(null);
  const react = (mood: PomoMood, line: string) => setReaction({ mood, line, key: Date.now() });
  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(() => setReaction(null), 2600);
    return () => clearTimeout(t);
  }, [reaction]);

  const finish = async (tour = true) => {
    if (busy) return;
    setBusy(true);
    await completeOnboarding(
      mode,
      { name: pages.includes('name') ? name : undefined, uses, usesOther, heardFrom: heard, heardOther, share: share && hasAnswers({ uses, heardFrom: heard }), presetId },
      { tour },
    );
    onDone?.();
  };
  const next = () => {
    setReaction(null);
    if (last) void finish();
    else setI(i + 1);
  };
  const back = () => {
    setReaction(null);
    setI(Math.max(0, i - 1));
  };

  // Android back steps back through the pages; desktop shortcuts stay quiet while this is open.
  useEffect(() => {
    const onBack = (e: Event) => {
      if (i === 0 && mode === 'full') return;
      e.preventDefault();
      if (i === 0) onDone?.();
      else back();
    };
    window.addEventListener('promodoro:back', onBack);
    return () => window.removeEventListener('promodoro:back', onBack);
  });

  const who = name.trim();
  const base: Record<Page, { mood: PomoMood; line: string }> = {
    hello: { mood: 'cheering', line: "Hi! I'm Pomo, your focus buddy." },
    name: who ? { mood: 'shy', line: `Nice to meet you, ${who}!` } : { mood: 'happy', line: mode === 'returning' ? "Oh! I never asked your name." : 'What should I call you?' },
    uses: { mood: 'focused', line: uses.length ? `${uses.length === 1 ? 'Got it' : 'A bit of everything'}! Anything else?` : 'What brings you here?' },
    heard: { mood: 'puzzled', line: 'How did you find me?' },
    pace: { mood: 'flow', line: "Let's find your pace." },
    consent: { mood: 'shy', line: 'Totally optional. I like you either way.' },
  };
  const mood = reaction?.mood ?? base[page].mood;
  const line = reaction?.line ?? base[page].line;

  const poke = () => {
    const lines = POMO_LINES.frustrated;
    react('frustrated', lines[Math.floor(Math.random() * lines.length)]);
  };

  const canSkipPage = page === 'uses' ? !uses.length : page === 'heard' ? !heard : page === 'name' ? !who : false;
  const nextLabel = last ? (mode === 'survey' ? 'Save' : "Let's go!") : page === 'hello' ? 'Hi Pomo! 👋' : canSkipPage ? 'Skip for now' : 'Next';

  return (
    <div className="bg-notebook fixed inset-0 z-50 overflow-y-auto [--pm-margin-x:28px] md:[--pm-margin-x:44px]" role="dialog" aria-modal aria-label="Welcome to Promodoro">
      <div className="flex min-h-full items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] safe-pt">
        <div className="sticky-note relative w-full max-w-[520px] px-5 pb-5 pt-7 sm:px-8">
          <div className="washi" />
          <div className="absolute right-3 top-3">
            <button className="btn-ghost !px-2.5 !py-1.5 !text-[13px] !text-ink/55" onClick={() => (mode === 'full' ? void finish(false) : onDone?.())} disabled={busy}>
              {mode === 'full' ? 'Skip all' : 'Close'}
            </button>
          </div>

          <div className="flex flex-col items-center">
            <Pomo mood={mood} size={page === 'hello' ? 150 : 112} accessory={s.accessory} onClick={poke} title="Pomo" />
            <SpeechNote key={reaction?.key ?? `${page}:${line}`}>{line}</SpeechNote>
          </div>

          <div key={page} className="animate-pageIn mt-4 min-h-[180px]">
            {page === 'hello' && <HelloPage />}
            {page === 'name' && <NamePage name={name} onName={setName} onEnter={next} returning={mode === 'returning'} />}
            {page === 'uses' && (
              <ChoicePage
                title="What will you use Promodoro for?"
                hint="Pick as many as you like. I'll set up your first subjects to match."
                options={USE_OPTIONS}
                selected={uses}
                onToggle={(id) => {
                  const on = !uses.includes(id);
                  setUses(on ? [...uses, id] : uses.filter((u) => u !== id));
                  if (on) react('cheering', USE_OPTIONS.find((o) => o.id === id)!.pomo);
                }}
                other={uses.includes('other') ? { value: usesOther, onChange: setUsesOther, placeholder: 'Like what? (becomes a subject)' } : undefined}
              />
            )}
            {page === 'heard' && (
              <ChoicePage
                title="Where'd you hear about us?"
                hint="Promodoro has no ads, so this helps a lot."
                options={HEARD_OPTIONS}
                selected={heard ? [heard] : []}
                onToggle={(id) => {
                  setHeard(heard === id ? null : id);
                  if (heard !== id) react(id === 'shared-page' ? 'cheering' : 'happy', HEARD_OPTIONS.find((o) => o.id === id)!.pomo);
                }}
                other={heard === 'other' ? { value: heardOther, onChange: setHeardOther, placeholder: 'Where? (a blog, a class…)' } : undefined}
              />
            )}
            {page === 'pace' && <PacePage presetId={presetId ?? s.presetId} onPick={(id) => setPresetId(id)} onOvertime={() => react('flow', "Past zero and still counting. Every minute's saved!")} />}
            {page === 'consent' && <ConsentPage share={share} onShare={setShare} draft={{ uses, usesOther, heardFrom: heard, heardOther }} installId={s.installId} />}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button className={cx('btn-ghost !px-3', i === 0 && 'invisible')} onClick={back} aria-label="Back">
              <ArrowLeft size={16} /> Back
            </button>
            <div className="flex gap-1.5" aria-label={`Page ${i + 1} of ${pages.length}`}>
              {pages.map((p, n) => (
                <span key={p} className={cx('h-2 rounded-full transition-all', n === i ? 'w-5 bg-tomato' : n < i ? 'w-2 bg-tomato/45' : 'w-2 bg-rule')} />
              ))}
            </div>
            <button className={cx(canSkipPage ? 'btn-soft' : 'btn-primary', 'min-w-[7.5rem]')} onClick={next} disabled={busy}>
              {nextLabel}
            </button>
          </div>
          {mode === 'full' && (
            <p className="mt-4 text-center text-[12px] text-ink/55">
              By using Promodoro you agree to the{' '}
              <a className="underline hover:text-ink" href={LEGAL_URL} target="_blank" rel="noreferrer">
                Terms &amp; Privacy
              </a>
              . You must be 13 or older.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeechNote({ children }: { children: ReactNode }) {
  return (
    <div className="relative mt-1 animate-pop" aria-live="polite">
      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-rule bg-sheet" />
      <div className="rounded-note border border-rule bg-sheet px-4 py-2 text-center font-hand text-[20px] leading-tight shadow-note">{children}</div>
    </div>
  );
}

function PageTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 text-center">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-ink/60">{hint}</p>}
    </div>
  );
}

function HelloPage() {
  return (
    <div className="text-center">
      <h1 className="font-display text-[28px] font-semibold text-tomato">Welcome to Promodoro</h1>
      <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink/75">A cozy notebook for focusing at your own pace. No streaks, no guilt, and your notebook stays on your device.</p>
      <ul className="mx-auto mt-4 grid max-w-sm gap-2 text-left text-[14px] text-ink/75">
        <li>⏱️ The timer keeps counting past zero, so flow time is never lost.</li>
        <li>🩹 Forgot to start? Fix it in a tap.</li>
        <li>🌟 Stickers for resting and coming back, never for grinding.</li>
      </ul>
    </div>
  );
}

function NamePage({ name, onName, onEnter, returning }: { name: string; onName: (v: string) => void; onEnter: () => void; returning: boolean }) {
  return (
    <div className="text-center">
      <PageTitle hint="Only Pomo uses it. It never leaves this device.">{returning ? 'Can I ask your name?' : "What's your name?"}</PageTitle>
      <label className="mx-auto block max-w-xs">
        <span className="sr-only">Your name</span>
        <input
          autoFocus
          value={name}
          maxLength={40}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter()}
          placeholder="your name"
          autoComplete="given-name"
          className="w-full border-b-2 border-dashed border-ink/25 bg-transparent pb-1 text-center font-hand text-[34px] leading-tight outline-none placeholder:text-ink/25 focus:border-tomato"
        />
      </label>
      <p className="mt-3 text-[13px] text-ink/50">A nickname is perfect. You can change it in Settings.</p>
    </div>
  );
}

interface ChoiceOption<T extends string> {
  id: T;
  label: string;
  emoji: string;
}

function ChoicePage<T extends string>({
  title,
  hint,
  options,
  selected,
  onToggle,
  other,
}: {
  title: string;
  hint: string;
  options: ChoiceOption<T>[];
  selected: T[];
  onToggle: (id: T) => void;
  other?: { value: string; onChange: (v: string) => void; placeholder: string };
}) {
  return (
    <div>
      <PageTitle hint={hint}>{title}</PageTitle>
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {options.map((o, n) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.id)}
              style={{ transform: on ? `rotate(${n % 2 ? 1 : -1}deg)` : undefined }}
              className={cx(
                'flex items-center gap-2.5 rounded-note border px-3 py-2.5 text-left text-[14px] font-bold transition-all active:scale-[0.97]',
                on ? 'border-[#E9C85C] bg-halo text-ink shadow-note' : 'border-rule bg-sheet text-ink/80 hover:bg-paper',
              )}
            >
              <span className="text-xl leading-none">{o.emoji}</span>
              <span className="flex-1">{o.label}</span>
              {on && <Check size={16} className="shrink-0 text-tomato" />}
            </button>
          );
        })}
      </div>
      {other && (
        <input autoFocus className="field mt-3" value={other.value} maxLength={80} onChange={(e) => other.onChange(e.target.value)} placeholder={other.placeholder} />
      )}
    </div>
  );
}

function PacePage({ presetId, onPick, onOvertime }: { presetId: string; onPick: (id: string) => void; onOvertime: () => void }) {
  const presets = useLiveQuery(() => db.presets.orderBy('order').filter((p) => !p.once).toArray(), [], []);
  return (
    <div>
      <PageTitle hint="You can change this any time by tapping the clock.">Pick a starting rhythm</PageTitle>
      <div className="grid grid-cols-2 gap-2">
        {presets.slice(0, 4).map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === presetId}
            onClick={() => onPick(p.id)}
            className={cx('rounded-note border px-3 py-2 text-left transition-all active:scale-[0.97]', p.id === presetId ? 'border-[#E9C85C] bg-halo shadow-note' : 'border-rule bg-sheet hover:bg-paper')}
          >
            <span className="block font-display text-lg font-semibold tabular">
              {p.focusMin} / {p.shortMin}
            </span>
            <span className="block text-[12px] text-ink/60">{p.name.replace(/\s*\d+\s*\/\s*\d+\s*$/, '')}</span>
          </button>
        ))}
      </div>
      <GentleFlowDemo onOvertime={onOvertime} />
    </div>
  );
}

/** A five-second taste of Gentle Flow: the timer reaches zero, chimes (visually), and keeps counting. */
function GentleFlowDemo({ onOvertime }: { onOvertime: () => void }) {
  const [t, setT] = useState(-5);
  const fired = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x >= 9 ? -5 : x + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (t === 0 && !fired.current) {
      fired.current = true;
      onOvertime();
    }
    if (t < 0) fired.current = false;
  }, [t, onOvertime]);
  const over = t >= 0;
  const clock = `${over ? '+' : ''}0:${String(Math.abs(t)).padStart(2, '0')}`;
  return (
    <div className="mt-4 flex items-center gap-4 rounded-note border border-dashed border-rule bg-sheet/70 px-4 py-3">
      <div className={cx('min-w-[4.5rem] text-center font-display text-3xl font-semibold tabular transition-colors', over ? 'text-leaf' : 'text-tomato')}>
        <span key={over ? 'o' : 'c'} className={cx('inline-block', t === 0 && 'animate-wiggle')}>
          {clock}
        </span>
      </div>
      <p className="text-[13px] leading-snug text-ink/70">
        <b className="text-ink">Gentle Flow:</b> {over ? "it chimed, and it's still counting. Saved as 25:00 planned + overtime." : 'watch what happens when the timer hits zero…'}
      </p>
    </div>
  );
}

function ConsentPage({
  share,
  onShare,
  draft,
  installId,
}: {
  share: boolean;
  onShare: (v: boolean) => void;
  draft: { uses: UseId[]; usesOther: string; heardFrom: HeardId | null; heardOther: string };
  installId: string | null;
}) {
  if (!hasAnswers(draft))
    return (
      <div className="text-center">
        <PageTitle>All set!</PageTitle>
        <p className="mx-auto max-w-sm text-[14px] text-ink/70">You skipped the questions, so there's nothing to share. That's completely fine. You can answer them later in Settings.</p>
      </div>
    );
  const payload = buildSurveyPayload({ survey: { ...draft, answeredAt: Date.now() }, installId });
  return (
    <div>
      <PageTitle hint="Promodoro has no accounts and no ads. Besides this optional survey, it only sends a once-a-day anonymous count of installs (you can switch that off in Settings).">Help Pomo grow?</PageTitle>
      <div className="rounded-note border border-rule bg-sheet px-4">
        <Toggle checked={share} onChange={onShare} label="Share my two answers anonymously" hint="Helps decide what to build next." />
      </div>
      <ul className="mt-3 space-y-1 text-[13px] text-ink/70">
        <li className="flex gap-2">
          <ShieldCheck size={16} className="mt-px shrink-0 text-leaf" /> Never your name, sessions, notes or subjects.
        </li>
        <li className="flex gap-2">
          <ShieldCheck size={16} className="mt-px shrink-0 text-leaf" /> Turn it off in Settings and your answers are deleted.
        </li>
      </ul>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer font-bold text-ink/60 hover:text-ink">See exactly what gets sent</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-note border border-rule bg-paper p-3 text-[11.5px] leading-snug text-ink/75">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}
