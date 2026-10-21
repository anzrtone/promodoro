/** Session details, claim-a-gap, and manual / bulk entry sheets. */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { addManualSession, deleteSession, editSession, restoreSession } from '@/db/repo';
import { useSettings } from '@/db/settings';
import { SOURCE_LABEL } from '@/engine/stats';
import { dayStart, formatDuration, formatTimeOfDay, HOUR, localDay, MINUTE, today } from '@/engine/time';
import type { Mood, Phase, Session } from '@/engine/types';
import { phaseLabel } from '@/engine/cycle';
import { evaluateSession, award } from '@/features/stickers';
import { toast } from '@/features/toasts';
import { cx, Segmented, Sheet, SourceDot, Stepper, Toggle } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
export const toHHMM = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromHHMM = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return dayStart(day) + (h || 0) * HOUR + (m || 0) * MINUTE;
};

function BoardPicker({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const boards = useLiveQuery(() => db.boards.orderBy('order').filter((b) => !b.archived).toArray(), [], []);
  return (
    <div className="flex flex-wrap gap-2">
      <button className={cx('chip', !value && 'chip-on')} onClick={() => onChange(undefined)}>
        none
      </button>
      {boards.map((b) => (
        <button key={b.id} className={cx('chip', value === b.id && 'chip-on')} onClick={() => onChange(b.id)}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
          {b.name}
        </button>
      ))}
    </div>
  );
}

export function SessionDetail({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [boardId, setBoardId] = useState<string | undefined>();
  const [mood, setMood] = useState<Mood | undefined>();
  useEffect(() => {
    if (!session) return;
    setNote(session.note ?? '');
    setLabel(session.label ?? '');
    setBoardId(session.boardId);
    setMood(session.mood);
  }, [session]);
  if (!session) return null;
  const s = session;

  const save = async () => {
    await editSession(s.id, { note: note || undefined, label: label || undefined, boardId, mood });
    onClose();
  };
  const remove = async () => {
    await deleteSession(s.id);
    onClose();
    toast({ text: 'Session removed', action: { label: 'Undo', run: () => void restoreSession(s.id) } });
  };

  const rows: Array<[string, string]> = [
    ['when', `${formatTimeOfDay(s.start)} – ${formatTimeOfDay(s.end)}`],
    ['worked', formatDuration(s.actualMs, { seconds: true })],
  ];
  if (s.plannedMs) rows.push(['planned', formatDuration(s.plannedMs)]);
  if (s.timedMs) rows.push(['timed', formatDuration(s.timedMs, { seconds: true })]);
  if (s.recoveredMs && s.source !== 'manual') rows.push(['recovered', formatDuration(s.recoveredMs)]);
  if (s.pausedMs >= MINUTE) rows.push(['paused', formatDuration(s.pausedMs)]);
  if (s.overtimeMs) rows.push(['overtime', `+${formatDuration(s.overtimeMs)}`]);
  if (s.endReason) rows.push(['ended', s.endReason === 'early' ? 'finished early' : s.endReason === 'complete' ? 'completed' : s.endReason]);

  return (
    <Sheet open onClose={onClose} title={`${phaseLabel(s.phase)}${s.bulk ? ' (lump of time)' : ''}`}>
      <div className="mb-3 flex items-center gap-2 text-sm text-ink/70">
        <SourceDot source={s.source} /> {SOURCE_LABEL[s.source]}
        {s.importFrom && <span className="text-ink/45">· from {s.importFrom}</span>}
      </div>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-hand text-[18px] text-ink/55">{k}</dt>
            <dd className="font-display font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3">
        <input className="field" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <BoardPicker value={boardId} onChange={setBoardId} />
        <input className="field font-hand !text-[19px]" placeholder="margin note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <Segmented<Mood | 'none'>
          size="sm"
          value={mood ?? 'none'}
          onChange={(v) => setMood(v === 'none' ? undefined : v)}
          options={[
            { value: 'none', label: '—' },
            { value: 'great', label: '😊' },
            { value: 'good', label: '🙂' },
            { value: 'meh', label: '😐' },
            { value: 'tough', label: '😮‍💨' },
          ]}
        />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button className="btn-ghost !text-ink/55" onClick={() => void remove()}>
          Remove
        </button>
        <button className="btn-primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

export interface ClaimDraft {
  start: number;
  end: number;
}

/** Claim a dragged range of the timeline (or enter a past session by hand). */
export function ClaimSheet({ draft, onClose, mode }: { draft: ClaimDraft | null; onClose: () => void; mode: 'claim' | 'entry' }) {
  const settings = useSettings();
  const [day, setDay] = useState(today());
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('09:25');
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState<Phase>('focus');
  const [boardId, setBoardId] = useState<string | undefined>(settings.boardId ?? undefined);
  const [bulk, setBulk] = useState(false);
  const [bulkHours, setBulkHours] = useState(10);

  useEffect(() => {
    if (!draft) return;
    setDay(localDay(draft.start));
    setFrom(toHHMM(draft.start));
    setTo(toHHMM(draft.end));
    setBulk(false);
  }, [draft]);

  if (!draft) return null;
  let start = fromHHMM(day, from);
  let end = fromHHMM(day, to);
  if (end <= start) end += 24 * HOUR;
  if (bulk) {
    start = dayStart(day) + 12 * HOUR;
    end = start + bulkHours * HOUR;
  }
  const dur = end - start;

  const save = async () => {
    const id = await addManualSession({ start, end, durationMs: dur, phase, label: label || undefined, boardId, kind: bulk ? 'bulk' : mode });
    const s = await db.sessions.get(id);
    if (s) void evaluateSession(s);
    if (mode === 'claim') void award('found-time');
    toast({ text: `${formatDuration(dur)} added to ${day === today() ? 'today' : day}`, tone: 'success' });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={mode === 'claim' ? 'Claim this time' : 'Add a past session'}>
      <p className="mb-3 text-sm text-ink/65">
        {mode === 'claim' ? 'You know you were working. It counts.' : "Your numbers, your notebook. It'll be labelled “added by hand”."}
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="field !w-auto" value={day} onChange={(e) => setDay(e.target.value)} />
          {!bulk && (
            <>
              <input type="time" className="field !w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-ink/50">to</span>
              <input type="time" className="field !w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
        </div>
        {mode === 'entry' && (
          <Toggle
            checked={bulk}
            onChange={setBulk}
            label="Lump of time"
            hint="e.g. 300 hours studied before Promodoro. Counts in totals, isn't drawn on the timeline, and can be filtered out of averages."
          />
        )}
        {bulk && <Stepper value={bulkHours} onChange={setBulkHours} max={10000} suffix="h" />}
        <Segmented<Phase>
          size="sm"
          value={phase}
          onChange={setPhase}
          options={[
            { value: 'focus', label: 'Focus' },
            { value: 'short', label: 'Break' },
          ]}
        />
        <input className="field" placeholder="What was it? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <BoardPicker value={boardId} onChange={setBoardId} />
      </div>
      <button className="btn-primary mt-5 w-full" disabled={dur <= 0} onClick={() => void save()}>
        Add {formatDuration(dur)}
      </button>
    </Sheet>
  );
}
