/** Pomo's guided tour: spotlights a real control and leaves a note in the margin beside it. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSettings } from '@/db/settings';
import { navigate } from '@/features/nav';
import { ArrowLeft } from 'lucide-react';
import { award } from '@/features/stickers';
import { chapterOf, makeForTour, setTourStep, skipTourStep, suggestName, tourBack, TOURS, tourTarget, tourText, useTour, type TourStep } from '@/features/tour';
import { Pomo } from './Pomo';
import { cx } from './ui';

const PAD = 8;
const NOTE_W = 340;
/** How long to wait for a step's target to render (screens load their data async) before skipping it. */
const WAIT_MS = 1500;

/** The visible element for a tour target (desktop and phone navs both carry the same marker). */
function findTarget(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`));
  return all.find((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') ?? null;
}

export function TourOverlay() {
  const { id, step, made } = useTour();
  const { steps, chapters, done } = TOURS[id];
  const s = useSettings();
  const [measuredH, setMeasuredH] = useState(0);
  const [{ rect, vw, vh }, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number }>({ rect: null, vw: window.innerWidth, vh: window.innerHeight });
  const [ready, setReady] = useState(false);

  const def = step === null ? null : steps[step];
  const target = def ? tourTarget(def.target, made) : null;

  useLayoutEffect(() => {
    if (!def) return;
    setReady(false);
    // A step pointing at something that wasn't made (or isn't on screen, e.g. a timer is running) is skipped.
    if (target === '') return skipTourStep();
    let raf = 0;
    let el: HTMLElement | null = null;
    let last = '';
    const since = performance.now();
    // Follow the target through scrolling and resizes; only re-render when it actually moves.
    const track = () => {
      if (target && !el) {
        el = findTarget(target);
        if (!el) {
          if (performance.now() - since > WAIT_MS) return skipTourStep();
          raf = requestAnimationFrame(track);
          return;
        }
        el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.55 ? 'start' : 'center', behavior: 'smooth' });
      }
      const r = el ? el.getBoundingClientRect() : null;
      const key = `${r?.left},${r?.top},${r?.width},${r?.height},${window.innerWidth},${window.innerHeight}`;
      if (key !== last) {
        last = key;
        setBox({ rect: r, vw: window.innerWidth, vh: window.innerHeight });
        setReady(true);
      }
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [def, step, target]);

  const end = () => {
    setTourStep(null);
    if (id === 'main') void award('nice-to-meet-you');
  };
  const finish = () => {
    end();
    if (id === 'main') navigate('focus');
  };
  const next = () => (step! + 1 >= steps.length ? finish() : setTourStep(step! + 1));

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Enter already presses the focused button; arrows would fight the name field.
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' && !def?.make) next();
      else if (e.key === 'ArrowLeft' && !def?.make) tourBack();
    };
    const onBack = (e: Event) => {
      e.preventDefault();
      end();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('promodoro:back', onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('promodoro:back', onBack);
    };
  });

  if (!def || !ready) return def ? <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Pomo's tour" /> : null;
  const lastStep = step === steps.length - 1;
  const text = tourText(def.text, made, s.profile.name);

  // Below the spotlight if it fits, else above, else pinned to the bottom (tall targets); centred when there's no target.
  const w = Math.min(NOTE_W, vw - 32);
  // The note's real height once it has rendered (the sample-data line and long texts make it taller).
  const noteH = measuredH || (def.make ? 250 : 200);
  let style: CSSProperties = { width: w, left: (vw - w) / 2, top: Math.max(16, vh / 2 - noteH / 2) };
  if (rect) {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    const below = rect.bottom + PAD + 14;
    const above = rect.top - PAD - 14;
    style =
      below + noteH < vh ? { width: w, left, top: below } : above - noteH > 0 ? { width: w, left, bottom: vh - above } : { width: w, left: (vw - w) / 2, bottom: 16 };
  }
  const chapter = chapters.findIndex((c) => c.id === chapterOf(def));

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Pomo's tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-card border-2 border-halo transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(var(--pm-ink) / 0.38), 0 0 0 6px rgb(var(--pm-halo) / 0.45)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink/40" />
      )}
      {/* Clicks outside the note do nothing, so the tour can't be lost by accident. */}
      <div className="absolute inset-0" />
      <div key={step} ref={(el) => el && setMeasuredH(el.offsetHeight)} className="sticky-note absolute animate-pop p-4" style={style}>
        <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px] font-bold uppercase tracking-wide">
          {chapters.map((c, n) => (
            <span key={c.id} className={cx('rounded-full px-2 py-0.5', n === chapter ? 'bg-halo text-ink' : n < chapter ? 'text-ink/50' : 'text-ink/30')}>
              {n < chapter ? '✓ ' : ''}
              {c.label}
            </span>
          ))}
        </div>
        <div className="flex items-start gap-3">
          <div className="-ml-1 -mt-1 shrink-0">
            <Pomo mood={lastStep || def.make ? 'cheering' : 'happy'} size={lastStep ? 72 : 56} accessory={s.accessory} />
          </div>
          <p className="pt-1 font-hand text-[18px] leading-tight">{text}</p>
        </div>
        {def.make ? (
          <MakeField kind={def.make} onSkip={next} back={step! > 0 ? <BackButton /> : null} />
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {step! > 0 && <BackButton />}
              <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-rule" aria-label={`Step ${step! + 1} of ${steps.length}`}>
                <div className="h-full rounded-full bg-tomato transition-all" style={{ width: `${((step! + 1) / steps.length) * 100}%` }} />
              </div>
            </div>
            <div className="flex gap-1">
              {!lastStep && (
                <button className="btn-ghost !px-2.5 !py-1.5 !text-[13px]" onClick={end}>
                  Skip tour
                </button>
              )}
              <button className="btn-primary !px-4 !py-2 !text-sm" onClick={next} autoFocus>
                {lastStep ? done : 'Next'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The hands-on bit: a name field with a suggestion already in it. Enter makes it. */
function BackButton() {
  return (
    <button type="button" className="btn-ghost -ml-1.5 !gap-1 !px-1.5 !py-1 !text-[12px] !text-ink/55" onClick={tourBack} title="Previous step (←)">
      <ArrowLeft size={13} /> Back
    </button>
  );
}

function MakeField({ kind, onSkip, back }: { kind: NonNullable<TourStep['make']>; onSkip: () => void; back: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void suggestName(kind).then((n) => setName((cur) => cur ?? n));
  }, [kind]);
  useEffect(() => {
    // Select the suggestion so typing replaces it and Enter keeps it.
    if (name !== null && input.current && document.activeElement !== input.current) {
      input.current.focus();
      input.current.select();
    }
  }, [name]);
  const make = () => {
    if (busy) return;
    setBusy(true);
    void makeForTour(kind, name ?? '');
  };
  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        make();
      }}
    >
      <label className="block">
        <span className="label">
          {kind === 'folder' ? 'Folder name' : 'Subject name'} <span className="font-normal normal-case tracking-normal text-ink/45">· Enter to {kind === 'folder' ? 'make it' : 'add it'}</span>
        </span>
        <input ref={input} className="field font-hand !text-[22px]" value={name ?? ''} maxLength={40} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <div className="mt-3 flex items-center justify-end gap-1 whitespace-nowrap">
          <span className="mr-auto">{back}</span>
          <button type="button" className="btn-ghost !px-2.5 !py-1.5 !text-[13px]" onClick={onSkip} disabled={busy}>
            Not now
          </button>
          <button type="submit" className="btn-primary !px-4 !py-2 !text-sm" disabled={busy || !name?.trim()}>
            {kind === 'folder' ? 'Make folder' : 'Add subject'}
          </button>
      </div>
    </form>
  );
}
