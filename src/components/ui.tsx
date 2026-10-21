/** Small notebook-styled UI primitives. */
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('promodoro:back', onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('promodoro:back', onBack);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cx(
          'relative max-h-[92vh] w-full overflow-y-auto rounded-t-sheet border border-rule bg-paper p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-lift animate-pop sm:rounded-sheet sm:pb-6',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="washi" />
        <div className="mb-3 flex items-start justify-between gap-3">
          {title ? <h2 className="font-display text-xl font-semibold">{title}</h2> : <span />}
          <button className="btn-ghost -mr-2 -mt-1 !p-2" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block text-[15px] font-bold">{label}</span>
        {hint && <span className="block text-[13px] text-ink/60">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full border transition-colors', checked ? 'border-leaf bg-leaf' : 'border-rule bg-rule/60')}
      >
        <span className={cx('absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-full border border-rule bg-sheet p-1">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx('pill', size === 'sm' ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2 text-sm', o.value === value ? 'bg-halo text-ink shadow-pill' : 'text-ink/60 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange, label, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: ReactNode; format?: (v: number) => string }) {
  return (
    <label className="block py-2">
      <span className="flex justify-between text-[15px] font-bold">
        {label}
        <span className="font-normal text-ink/60">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--pm-tomato))]" />
    </label>
  );
}

export function Stepper({ value, onChange, min = 1, max = 600, step = 1, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="inline-flex items-center rounded-full border border-rule bg-sheet">
      <button className="pill h-9 w-9 text-lg text-ink/70 hover:bg-paper" onClick={() => set(value - step)} aria-label="Less">
        −
      </button>
      <input
        className="w-12 bg-transparent text-center font-display text-lg font-semibold outline-none tabular"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          if (Number.isFinite(n)) set(n);
        }}
      />
      {suffix && <span className="-ml-1 pr-1 text-xs text-ink/50">{suffix}</span>}
      <button className="pill h-9 w-9 text-lg text-ink/70 hover:bg-paper" onClick={() => set(value + step)} aria-label="More">
        +
      </button>
    </div>
  );
}

export function Section({ title, children, aside, tour }: { title: ReactNode; children: ReactNode; aside?: ReactNode; tour?: string }) {
  return (
    <section className="card relative p-4 sm:p-5" data-tour={tour}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-hand text-[24px] leading-none text-tomato">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SourceDot({ source, rest }: { source: string; rest?: boolean }) {
  const cls = rest
    ? 'bg-leaf'
    : source === 'timed' ? 'bg-tomato' : source === 'adjusted' ? 'bg-tomato/60 ring-1 ring-tomato' : source === 'manual' ? 'border-2 border-dashed border-tomato bg-transparent' : 'bg-halo ring-1 ring-[#E9C85C]';
  return <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', cls)} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center font-hand text-[20px] text-ink/45">{children}</p>;
}
