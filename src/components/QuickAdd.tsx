/** Add (or tweak) presets and subjects right from the Focus screen, without a trip to Settings. */
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Trash2 } from 'lucide-react';
import { db } from '@/db/schema';
import { addSubject, SWATCHES } from '@/db/folders';
import { updateSettings, useSettings } from '@/db/settings';
import { flattenFolders } from '@/engine/folders';
import { uid } from '@/engine/time';
import type { Folder, Preset } from '@/engine/types';
import { cx, Sheet, Stepper } from './ui';

export const ONCE_ID = 'p-once';

export function PresetSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Preset }) {
  const settings = useSettings();
  const [p, setP] = useState({ name: '', focusMin: 45, shortMin: 9, longMin: 20, rounds: 3 });
  useEffect(() => {
    if (!open) return;
    setP(editing ? { name: editing.once ? '' : editing.name, focusMin: editing.focusMin, shortMin: editing.shortMin, longMin: editing.longMin, rounds: editing.rounds } : { name: '', focusMin: 45, shortMin: 9, longMin: 20, rounds: 3 });
  }, [open, editing]);
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const name = p.name.trim() || `My ${p.focusMin} / ${p.shortMin}`;

  const useOnce = async () => {
    await db.presets.put({ id: ONCE_ID, ...p, name: 'One-off', once: true, order: 9999 });
    await updateSettings({ presetId: ONCE_ID, round: 1 });
    onClose();
  };
  const save = async () => {
    if (editing && !editing.once) await db.presets.update(editing.id, { ...p, name });
    else {
      const id = uid('p');
      await db.presets.put({ id, ...p, name, order: await db.presets.count() });
      await updateSettings({ presetId: id, round: 1 });
    }
    onClose();
  };
  const remove = async () => {
    if (!editing) return;
    await db.presets.delete(editing.id);
    if (settings.presetId === editing.id) {
      const first = await db.presets.orderBy('order').filter((x) => !x.once).first();
      if (first) await updateSettings({ presetId: first.id, round: 1 });
    }
    onClose();
  };

  const isEdit = editing && !editing.once;
  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Edit preset' : 'Custom timing'}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {(
          [
            ['focusMin', 'Focus', 300],
            ['shortMin', 'Short break', 120],
            ['longMin', 'Long break', 180],
            ['rounds', 'Rounds', 12],
          ] as const
        ).map(([k, label, max]) => (
          <label key={k} className="block">
            <span className="label">{label}</span>
            <Stepper value={p[k]} max={max} onChange={set(k)} suffix={k === 'rounds' ? undefined : 'min'} />
          </label>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="label">Name (optional)</span>
        <input className="field" value={p.name} placeholder={`My ${p.focusMin} / ${p.shortMin}`} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      {settings.breakPolicy.mode === 'ratio' && (
        <p className="mt-3 text-xs text-ink/60">
          Breaks currently scale with how long you worked (work ÷ {settings.breakPolicy.ratio}).{' '}
          <button className="font-bold text-tomato underline decoration-dotted" onClick={() => void updateSettings({ breakPolicy: { ...settings.breakPolicy, mode: 'preset' } })}>
            Use the preset's break lengths instead
          </button>
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isEdit ? (
          <>
            <button className="btn-primary" onClick={() => void save()}>
              Save
            </button>
            <button className="btn-ghost" onClick={() => void remove()}>
              <Trash2 size={15} /> Delete
            </button>
          </>
        ) : (
          <>
            <button className="btn-primary" onClick={() => void useOnce()}>
              Use once
            </button>
            <button className="btn-soft" onClick={() => void save()}>
              Save as preset
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function SubjectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const folders = useLiveQuery(() => db.folders.orderBy('order').filter((f) => !f.archived).toArray(), [], []);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [folderId, setFolderId] = useState<string | undefined>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(SWATCHES[Math.floor(Math.random() * SWATCHES.length)]);
    setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  const create = async () => {
    if (!name.trim()) return input.current?.focus();
    const id = await addSubject({ name: name.trim(), color, folderId });
    await updateSettings({ boardId: id });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="New subject">
      <input ref={input} className="field" value={name} placeholder="e.g. Physics" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} />
      <div className="mt-3 flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <button key={c} className={cx('h-7 w-7 rounded-full border-2', color === c ? 'border-ink/60' : 'border-transparent')} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />
        ))}
      </div>
      {folders.length > 0 && (
        <label className="mt-3 block">
          <span className="label">Folder</span>
          <FolderSelect value={folderId} folders={folders} onChange={setFolderId} noneLabel="No folder" />
        </label>
      )}
      <button className="btn-primary mt-4" onClick={() => void create()}>
        Add & select
      </button>
    </Sheet>
  );
}

export function FolderSelect({ value, folders, onChange, noneLabel }: { value?: string; folders: Folder[]; onChange: (id: string | undefined) => void; noneLabel: string }) {
  return (
    <div className="relative">
      <select className="field appearance-none pr-8" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{noneLabel}</option>
        {flattenFolders(folders).map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {depth === 2 ? `   ↳ ${folder.name}` : folder.name}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3 text-ink/50" />
    </div>
  );
}

/** Right-click or press-and-hold. */
export function useLongPress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return {
    onContextMenu: (e: { preventDefault: () => void }) => {
      e.preventDefault();
      cancel();
      onLong();
    },
    onPointerDown: (e: { pointerType: string }) => {
      fired.current = false;
      if (e.pointerType === 'mouse') return;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLong();
      }, 500);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    /** True if the press that just ended opened the menu (so the click should be ignored). */
    wasLong: () => fired.current,
  };
}
