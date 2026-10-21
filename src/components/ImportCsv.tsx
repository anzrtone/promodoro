/** CSV import wizard: auto-guess columns, preview, duplicate detection, one-tap commit. */
import { useEffect, useMemo, useState } from 'react';
import { commitCsvImport, planCsvImport, type CsvPlan } from '@/db/backup';
import { guessMapping, mapRows, parseCSV, type ColumnMapping } from '@/engine/csv';
import { formatDuration } from '@/engine/time';
import { award } from '@/features/stickers';
import { toast } from '@/features/toasts';
import { Sheet, Toggle } from './ui';

const FIELDS: Array<{ key: keyof ColumnMapping; label: string }> = [
  { key: 'start', label: 'Start (date & time)' },
  { key: 'end', label: 'End (date & time)' },
  { key: 'date', label: 'Date only' },
  { key: 'time', label: 'Time only' },
  { key: 'duration', label: 'Duration' },
  { key: 'label', label: 'Label / tag' },
  { key: 'note', label: 'Note' },
  { key: 'success', label: '“Completed?” column' },
];

export function ImportCsvSheet({ file, onClose }: { file: { text: string; name: string }; onClose: () => void }) {
  const rows = useMemo(() => parseCSV(file.text), [file.text]);
  const headers = rows[0] ?? [];
  const [m, setM] = useState<ColumnMapping>(() => guessMapping(headers));
  const [plan, setPlan] = useState<CsvPlan | null>(null);
  const [includeDupes, setIncludeDupes] = useState(false);
  const mapped = useMemo(() => mapRows(rows, m), [rows, m]);

  useEffect(() => {
    void planCsvImport(mapped.rows, file.name).then(setPlan);
  }, [mapped, file.name]);

  const set = (key: keyof ColumnMapping, v: string) => setM({ ...m, [key]: v === '' ? undefined : Number(v) });
  const total = (plan?.fresh ?? []).concat(includeDupes ? plan?.duplicates ?? [] : []);

  const commit = async () => {
    const n = await commitCsvImport(total, file.name);
    if (n) void award('moving-in');
    toast({ text: `Imported ${n} sessions. Welcome home!`, tone: 'success' });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={`Import ${file.name}`} wide>
      {rows.length < 2 ? (
        <p>That file looks empty.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink/65">I guessed the columns. Fix anything that looks off. Imported time is labelled “imported”, never judged.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 font-bold">{f.label}</span>
                <select className="field !py-1.5" value={(m[f.key] as number | undefined) ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              Duration unit
              <select className="field !w-auto !py-1.5" value={m.durationUnit} onChange={(e) => setM({ ...m, durationUnit: e.target.value as ColumnMapping['durationUnit'] })}>
                <option value="min">minutes</option>
                <option value="sec">seconds</option>
                <option value="hour">hours</option>
              </select>
            </label>
            <Toggle checked={m.dayFirst} onChange={(v) => setM({ ...m, dayFirst: v })} label="Dates are day/month" />
          </div>

          <div className="overflow-x-auto rounded-note border border-rule bg-sheet">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink/50">
                  <th className="px-2 py-1">Start</th>
                  <th>Length</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {mapped.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-rule">
                    <td className="px-2 py-1">{new Date(r.start).toLocaleString()}</td>
                    <td>{formatDuration(r.durationMs)}</td>
                    <td className="truncate">{r.label ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-note bg-paper p-3 text-sm">
            <b>{plan?.fresh.length ?? '…'}</b> new sessions ({formatDuration((plan?.fresh ?? []).reduce((a, s) => a + s.actualMs, 0))})
            {plan && plan.duplicates.length > 0 && (
              <>
                {' '}
                · <b>{plan.duplicates.length}</b> look like ones you already have
                <Toggle checked={includeDupes} onChange={setIncludeDupes} label="Import the likely duplicates too" />
              </>
            )}
            {mapped.skipped.length > 0 && (
              <details className="mt-1 text-ink/60">
                <summary className="cursor-pointer">{mapped.skipped.length} rows skipped</summary>
                <ul className="mt-1 max-h-28 overflow-y-auto text-xs">
                  {mapped.skipped.slice(0, 50).map((s) => (
                    <li key={s.line}>
                      line {s.line}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <button className="btn-primary w-full" disabled={!total.length} onClick={() => void commit()}>
            Import {total.length} sessions
          </button>
        </div>
      )}
    </Sheet>
  );
}
