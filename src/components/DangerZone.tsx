/** Settings → Danger zone: save a copy of everything, then erase it all and start over. */
import { useState } from 'react';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { exportJSON, markBackedUp, wipeEverything } from '@/db/backup';
import { localDay } from '@/engine/time';
import { toast } from '@/features/toasts';
import { platform } from '@/platform';
import { Sheet } from './ui';

const CONFIRM_WORD = 'DELETE';

/** Saves a full backup; true when the file was actually written (the user may cancel the dialog). */
async function saveCopy(): Promise<boolean> {
  const p = platform();
  const path = await p.saveExport(`promodoro-backup-${localDay(Date.now())}.json`, 'application/json', await exportJSON());
  if (!path) return false;
  await markBackedUp();
  toast({ text: 'Backup saved ✓', tone: 'success' });
  return true;
}

export function DangerZone() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card relative border-2 border-tomato/60 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle size={20} className="text-tomato" />
        <h3 className="font-hand text-[24px] leading-none text-tomato">Danger zone</h3>
      </div>
      <p className="mb-3 text-sm text-ink/65">
        Erase every session, subject, note, task and setting on this device and start over, like a brand-new install. Save a copy first so you can restore it later.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" onClick={() => void saveCopy()}>
          <Download size={16} /> Save a copy of my data
        </button>
        <button className="btn-soft border-tomato text-tomato" onClick={() => setOpen(true)}>
          <Trash2 size={16} /> Delete everything…
        </button>
      </div>
      {open && <NukeSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function NukeSheet({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const nuke = async () => {
    setBusy(true);
    try {
      await wipeEverything();
      try {
        localStorage.clear();
      } catch {
        /* storage may be unavailable; the database is what matters */
      }
      window.location.reload();
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'Could not erase your data' });
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Delete everything?">
      <div className="space-y-3 text-sm text-ink/75">
        <p>
          This permanently erases <b>all</b> your sessions, subjects, folders, tasks, notes, stickers and settings on this device. It <b>can't be undone</b>.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-ink/65">
          <li>Your supporter key is kept.</li>
          <li>Sync is switched off here. Your other devices keep their data, and so does any cloud folder or pairing code you used. Delete it there too if you want it gone everywhere.</li>
        </ul>
        <div className="rounded-note border border-rule bg-creme p-3">
          <p className="mb-2 font-bold">1. Keep a copy (recommended)</p>
          <button className="btn-soft" onClick={async () => setSaved((await saveCopy()) || saved)}>
            <Download size={16} /> {saved ? 'Saved ✓ Save again' : 'Save a copy of my data'}
          </button>
        </div>
        <div className="rounded-note border border-rule bg-creme p-3">
          <label className="mb-2 block font-bold" htmlFor="nuke-confirm">
            2. Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id="nuke-confirm"
            className="w-full rounded-note border border-rule bg-paper px-3 py-2 font-mono"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn-soft flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary flex-1 disabled:opacity-40" disabled={!ready} onClick={() => void nuke()}>
            {busy ? 'Erasing…' : 'Erase everything'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
