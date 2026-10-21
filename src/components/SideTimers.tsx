/**
 * Side timers: little sticky notes for tea, laundry, the oven… Each has its own sound,
 * and the alarm queue makes sure they never cut off the main timer's alarm.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { formatClock, MINUTE } from '@/engine/time';
import { snapshot } from '@/engine/timer';
import { engine, usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { unlockAudio } from '@/audio/engine';
import type { SoundId } from '@/audio/synth';
import { SoundSelect } from './PromodoroCard';
import { Segmented, Sheet, Stepper } from './ui';

type SideMode = 'countdown' | 'countup';
const MODES: Array<{ value: SideMode; label: string; title: string }> = [
  { value: 'countdown', label: 'Count down', title: 'Rings at zero' },
  { value: 'countup', label: 'Count up', title: 'A stopwatch, no limit' },
];

const QUICK: Array<{ label: string; min: number; sound: SoundId; emoji: string }> = [
  { label: 'Tea', min: 4, sound: 'chime', emoji: '🍵' },
  { label: 'Stretch', min: 2, sound: 'soft', emoji: '🙆' },
  { label: 'Laundry', min: 45, sound: 'bell', emoji: '🧺' },
  { label: 'Oven', min: 20, sound: 'kitchen', emoji: '🍪' },
];

export function SideTimers() {
  const { sides, now } = usePromodoroEngine();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Tea');
  const [min, setMin] = useState(4);
  const [sound, setSound] = useState<string | undefined>('chime');
  const [mode, setMode] = useState<SideMode>('countdown');

  const start = (l: string, m: number, s?: string, md: SideMode = 'countdown') => {
    unlockAudio();
    void engine.startTimer({ phase: 'side', mode: md, minutes: m, label: l, soundId: s });
    setOpen(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-wrap items-stretch justify-center gap-3">
      {sides.map((t, i) => {
        const snap = snapshot(t, now);
        const up = t.mode === 'countup';
        return (
          <div key={t.id} className="sticky-note relative flex min-w-[124px] flex-col items-center px-3 pb-2 pt-3" style={{ transform: `rotate(${i % 2 ? 1.5 : -1.5}deg)` }}>
            <button className="absolute right-1 top-1 rounded-full p-1 text-ink/40 hover:text-ink" onClick={() => engine.discard(t.id)} aria-label="Remove">
              <X size={13} />
            </button>
            <span className="font-hand text-[19px] leading-none">{t.label}</span>
            <span className="font-display text-2xl font-semibold tabular" title={up ? 'Counting up' : undefined}>
              {up ? formatClock(snap.totalMs) : formatClock(snap.remainingMs, { ceil: true })}
            </span>
            <div className="mt-1 flex gap-1">
              {!up && (
                <button className="chip !px-2 !py-1 !text-xs" onClick={() => engine.nudge(t.id, 1)}>
                  +1
                </button>
              )}
              <button className="chip !px-2 !py-1 !text-xs" onClick={() => (t.status === 'running' ? engine.pause(t.id) : engine.resume(t.id))}>
                {t.status === 'running' ? 'pause' : 'go'}
              </button>
            </div>
          </div>
        );
      })}
      <button className="pill min-h-[64px] border border-dashed border-rule px-4 font-hand text-[19px] text-ink/55 hover:bg-paper" onClick={() => setOpen(true)}>
        <Plus size={16} /> side timer
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="A little side timer">
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q.label} className="chip" onClick={() => start(q.label, q.min, q.sound)}>
              {q.emoji} {q.label} · {q.min}m
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <input className="field font-hand !text-[19px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What for?" />
          <Segmented value={mode} options={MODES} onChange={setMode} size="sm" />
          {mode === 'countdown' && (
            <div className="flex items-center gap-3">
              <Stepper value={min} onChange={setMin} max={600} suffix="m" />
              <div className="flex-1">
                <SoundSelect value={sound} onChange={setSound} />
              </div>
            </div>
          )}
          <button className="btn-primary w-full" onClick={() => start(label || 'Timer', min, sound, mode)}>
            {mode === 'countup' ? 'Start counting up' : `Start ${formatClock(min * MINUTE)}`}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
