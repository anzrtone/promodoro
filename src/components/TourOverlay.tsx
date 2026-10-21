/** Pomo's guided tour: spotlights a real control and leaves a note in the margin beside it. */
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { useSettings } from '@/db/settings';
import { award } from '@/features/stickers';
import { setTourStep, TOUR, useTourStep } from '@/features/tour';
import { Pomo } from './Pomo';
import { cx } from './ui';

const PAD = 8;
const NOTE_W = 320;

/** The visible element for a tour target (desktop and phone navs both carry the same marker). */
function findTarget(target: string | null): HTMLElement | null {
  if (!target) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return all.find((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') ?? null;
}

export function TourOverlay() {
  const step = useTourStep();
  const s = useSettings();
  const [{ rect, vw, vh }, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number }>({ rect: null, vw: window.innerWidth, vh: window.innerHeight });

  const def = step === null ? null : TOUR[step];

  useLayoutEffect(() => {
    if (!def) return;
    const el = findTarget(def.target);
    // A step whose control isn't on screen (e.g. a timer is running) is skipped.
    if (def.target && !el) return setTourStep(step! + 1);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Follow the target through scrolling and resizes; only re-render when it actually moves.
    let raf = 0;
    let last = '';
    const track = () => {
      const r = el ? el.getBoundingClientRect() : null;
      const key = `${r?.left},${r?.top},${r?.width},${r?.height},${window.innerWidth},${window.innerHeight}`;
      if (key !== last) {
        last = key;
        setBox({ rect: r, vw: window.innerWidth, vh: window.innerHeight });
      }
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [def, step]);

  const end = () => {
    setTourStep(null);
    void award('nice-to-meet-you');
  };
  const next = () => (step! + 1 >= TOUR.length ? end() : setTourStep(step! + 1));

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Enter already presses the focused Next button.
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight') next();
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

  if (!def) return null;
  const lastStep = step === TOUR.length - 1;
  const text = def.text.replace('{name}', s.profile.name.trim() || 'friend');

  // Place the note below the spotlight if it fits, else above; centred when there's no target.
  const w = Math.min(NOTE_W, vw - 32);
  let style: CSSProperties = { width: w, left: (vw - w) / 2, top: vh / 2 - 110 };
  if (rect) {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16);
    const below = rect.bottom + PAD + 14;
    style = below + 190 < vh ? { width: w, left, top: below } : { width: w, left, bottom: vh - rect.top + PAD + 14 };
  }

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
      <div key={step} className="sticky-note absolute animate-pop p-4" style={style}>
        <div className="flex items-start gap-3">
          <div className="-ml-1 -mt-1 shrink-0">
            <Pomo mood={lastStep ? 'cheering' : 'happy'} size={lastStep ? 72 : 56} accessory={s.accessory} />
          </div>
          <p className="pt-1 font-hand text-[18px] leading-tight">{text}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {TOUR.map((_, n) => (
              <span key={n} className={cx('h-1.5 rounded-full', n === step ? 'w-4 bg-tomato' : 'w-1.5 bg-rule')} />
            ))}
          </div>
          <div className="flex gap-1">
            {!lastStep && (
              <button className="btn-ghost !px-2.5 !py-1.5 !text-[13px]" onClick={end}>
                Skip tour
              </button>
            )}
            <button className="btn-primary !px-4 !py-2 !text-sm" onClick={next} autoFocus>
              {lastStep ? "Let's focus!" : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
