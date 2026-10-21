/** After-session wrap-up (summary, suggested break, margin note) and missed-alarm notices. */
import { useEffect, useState } from 'react';
import { Coffee, Play, X } from 'lucide-react';
import { addManualSession } from '@/db/repo';
import { useSettings } from '@/db/settings';
import { formatAgo, formatClock, formatDuration, formatTimeOfDay, MINUTE } from '@/engine/time';
import type { Mood } from '@/engine/types';
import { engine, usePromodoroEngine } from '@/hooks/usePromodoroEngine';
import { Pomo } from './Pomo';
import { cx, Sheet, Stepper } from './ui';
import { award } from '@/features/stickers';

const MOODS: Array<{ id: Mood; face: string; label: string }> = [
  { id: 'great', face: '😊', label: 'great' },
  { id: 'good', face: '🙂', label: 'good' },
  { id: 'meh', face: '😐', label: 'meh' },
  { id: 'tough', face: '😮‍💨', label: 'tough' },
];

export function WrapSheet() {
  const { wrap, primary } = usePromodoroEngine();
  const settings = useSettings();
  const [breakMin, setBreakMin] = useState(5);
  const [note, setNote] = useState('');
  const [mood, setMood] = useState<Mood | undefined>();

  useEffect(() => {
    if (!wrap) return;
    setBreakMin(Math.max(1, Math.round(wrap.suggestedBreakMs / MINUTE)));
    setNote(wrap.session.note ?? '');
    setMood(wrap.session.mood);
  }, [wrap?.session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wrap) return null;
  const s = wrap.session;
  const focus = s.phase === 'focus';

  const saveNote = async () => {
    if ((note || '') !== (s.note || '') || mood !== s.mood) await engine.noteSession(s.id, note || undefined, mood);
  };
  const close = async () => {
    await saveNote();
    engine.dismissWrap();
  };

  const rows: Array<[string, string]> = [];
  if (s.plannedMs > 0) rows.push(['planned', formatDuration(s.plannedMs)]);
  rows.push(['worked', formatDuration(s.actualMs, { seconds: true })]);
  if (s.overtimeMs > 0) rows.push(['overtime', `+${formatDuration(s.overtimeMs)}`]);
  if (s.recoveredMs > 0) rows.push(['recovered', formatDuration(s.recoveredMs)]);
  if (s.pausedMs > MINUTE) rows.push(['paused', formatDuration(s.pausedMs)]);

  return (
    <Sheet open onClose={() => void close()} title={focus ? (s.endReason === 'early' ? 'Done is done ✓' : 'Session complete!') : 'Break over'}>
      <div className="flex items-center gap-4">
        <Pomo mood={focus ? 'cheering' : 'happy'} size={92} accessory={settings.accessory} />
        <div className="flex-1">
          {wrap.late && <p className="mb-1 text-sm text-ink/60">This finished while you were away, at {formatTimeOfDay(s.end)}. Saved exactly as it happened.</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-hand text-[22px] text-ink/60">{k}</dt>
                <dd className="font-display text-lg font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {focus && (
        <div className="mt-4 space-y-2 rounded-note border border-rule bg-sheet p-3 bg-lined">
          <input
            className="w-full bg-transparent font-hand text-[24px] outline-none placeholder:text-ink/35"
            placeholder="margin note: what did you work on?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-bold uppercase tracking-wide text-ink/50">felt</span>
            {MOODS.map((m) => (
              <button key={m.id} className={cx('chip !px-2.5', mood === m.id && 'chip-on')} onClick={() => setMood(mood === m.id ? undefined : m.id)} title={m.label}>
                {m.face}
              </button>
            ))}
          </div>
        </div>
      )}

      {focus && wrap.nextBreak && !primary ? (
        <div className="mt-5">
          <p className="mb-2 text-sm text-ink/70">
            Suggested {wrap.nextBreak === 'long' ? 'long ' : ''}break:{' '}
            <b>
              {Math.round(wrap.suggestedBreakMs / MINUTE)} min
            </b>{' '}
            {settings.breakPolicy.mode === 'ratio' && <span className="text-ink/50">(you worked {formatDuration(s.actualMs)} ÷ {settings.breakPolicy.ratio})</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Stepper value={breakMin} onChange={setBreakMin} suffix="m" max={120} />
            <button
              className="btn-rest"
              onClick={async () => {
                await saveNote();
                await engine.startBreak(wrap.nextBreak!, breakMin);
              }}
            >
              <Coffee size={18} /> Start break
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await saveNote();
                engine.dismissWrap();
                await engine.startFocus();
              }}
            >
              <Play size={16} /> Keep going
            </button>
            <button className="btn-ghost" onClick={() => void close()}>
              Skip
            </button>
          </div>
        </div>
      ) : !focus && !primary ? (
        <div className="mt-5 flex gap-3">
          <button
            className="btn-primary"
            onClick={async () => {
              engine.dismissWrap();
              await engine.startFocus();
            }}
          >
            <Play size={18} /> Start focus
          </button>
          <button className="btn-ghost" onClick={() => void close()}>
            Not yet
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <button className="btn-soft" onClick={() => void close()}>
            Lovely
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** "Your focus ended 14 min ago while you were away." — with gentle recovery options. */
export function Notices() {
  const { notices, primary } = usePromodoroEngine();
  if (!notices.length) return null;
  const n = notices[notices.length - 1];
  const away = Date.now() - n.at;
  return (
    <div className="sticky-note relative mx-auto flex w-full max-w-[560px] items-start gap-3 p-3 animate-pop">
      <Pomo mood="puzzled" size={56} />
      <div className="flex-1">
        <p className="font-hand text-[22px] leading-6">
          {n.label ?? (n.phase === 'focus' ? 'Your focus' : 'Your break')} {n.stopped ? 'finished' : 'reached its goal'} {formatAgo(away)}, while you were away.
        </p>
        <p className="text-sm text-ink/60">
          {n.stopped ? `It's saved, ending at ${formatTimeOfDay(n.at)}.` : `I kept counting: you're at +${formatClock(away)} overtime.`}
        </p>
        {n.stopped && n.phase === 'focus' && away > 2 * MINUTE && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="chip"
              disabled={!!primary}
              onClick={async () => {
                await addManualSession({ start: n.at, end: Date.now(), durationMs: Date.now() - n.at, phase: 'focus', label: n.label, kind: 'claim' });
                void award('found-time');
                engine.dismissNotice(n.id);
              }}
            >
              I kept working, add the {formatDuration(away)}
            </button>
            <button className="chip" onClick={() => engine.dismissNotice(n.id)}>
              I stopped on time
            </button>
          </div>
        )}
      </div>
      <button className="btn-ghost !p-1.5" onClick={() => engine.dismissNotice(n.id)} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
