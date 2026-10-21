/** Settings → Your data: auto-backup folder, manual export/restore, CSV import. */
import { useEffect, useState } from 'react';
import { Download, FolderOpen, HardDriveDownload, RefreshCw, Upload } from 'lucide-react';
import { exportCSV, exportJSON, importJSON, markBackedUp } from '@/db/backup';
import { rebuildFromLog } from '@/db/repo';
import { updateSettings, useSettings } from '@/db/settings';
import { formatAgo, localDay } from '@/engine/time';
import { runAutoBackup } from '@/features/autoBackup';
import { award } from '@/features/stickers';
import { toast } from '@/features/toasts';
import { platform } from '@/platform';
import { ImportCsvSheet } from './ImportCsv';
import { Section, Segmented, Sheet, Stepper, Toggle } from './ui';

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function BackupPanel() {
  const s = useSettings();
  const ab = s.autoBackup;
  const p = platform();
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<{ text: string; name: string } | null>(null);
  const [csv, setCsv] = useState<{ text: string; name: string } | null>(null);

  useEffect(() => {
    void p.defaultBackupFolder().then(setDefaultDir);
  }, [p]);

  const folder = ab.dir ?? (p.backupFolderPickable ? null : defaultDir);

  const setAb = (patch: Partial<typeof ab>) => updateSettings({ autoBackup: { ...ab, ...patch } });

  const enable = async (on: boolean) => {
    if (on && p.backupFolderPickable && !ab.dir) {
      const dir = await p.pickBackupFolder();
      if (!dir) return;
      await setAb({ enabled: true, dir, lastError: null });
    } else await setAb({ enabled: on, lastError: null });
    if (on) {
      void award('backup-buddy');
      await backupNow();
    }
  };

  const chooseFolder = async () => {
    const dir = await p.pickBackupFolder();
    if (dir) await setAb({ dir, lastError: null });
  };

  const backupNow = async () => {
    setBusy(true);
    const r = await runAutoBackup({ force: true });
    setBusy(false);
    if (r.status === 'written') toast({ text: `Backed up to ${r.path}`, tone: 'success' });
    else if (r.status === 'failed') toast({ text: `Backup failed: ${r.error}` });
    else if (r.reason === 'no-folder') toast({ text: 'Choose a backup folder first' });
  };

  const exportFile = async (kind: 'json' | 'csv') => {
    const day = localDay(Date.now());
    const contents = kind === 'json' ? await exportJSON() : await exportCSV();
    const path = await p.saveExport(`promodoro-${kind === 'json' ? 'backup' : 'sessions'}-${day}.${kind}`, kind === 'json' ? 'application/json' : 'text/csv', contents);
    if (path) {
      if (kind === 'json') await markBackedUp();
      toast({ text: 'Exported ✓', tone: 'success' });
    }
  };

  return (
    <>
      <Section title="Automatic backups">
        <p className="mb-2 text-sm text-ink/65">
          {p.kind === 'android'
            ? 'A dated backup is written to your phone’s Documents/Promodoro folder every day. That folder survives uninstalling the app, and Google Drive, Syncthing or FolderSync can copy it off your phone if you like.'
            : 'A dated backup is written to a folder you choose. Pick a folder inside Dropbox, OneDrive or Google Drive and your own cloud keeps a copy for you, free.'}
        </p>
        <Toggle checked={ab.enabled} onChange={(v) => void enable(v)} label="Back up automatically" hint={`Once every ${ab.intervalHours === 24 ? 'day' : `${ab.intervalHours} hours`}, keeping the newest ${ab.keep} files`} />
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-note border border-rule bg-creme px-3 py-2 text-sm">
          <FolderOpen size={16} className="shrink-0 text-ink/50" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={folder ?? ''}>
            {folder ?? 'No folder chosen yet'}
          </span>
          {p.backupFolderPickable && (
            <button className="chip" onClick={() => void chooseFolder()}>
              {ab.dir ? 'Change…' : 'Choose…'}
            </button>
          )}
          {p.revealFolder && folder && (
            <button className="chip" onClick={() => void p.revealFolder!(folder)}>
              Open
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            keep <Stepper value={ab.keep} onChange={(v) => void setAb({ keep: v })} min={1} max={365} />
          </label>
          <Segmented
            size="sm"
            value={String(ab.intervalHours)}
            onChange={(v) => void setAb({ intervalHours: Number(v) })}
            options={[
              { value: '6', label: '6 h' },
              { value: '24', label: 'daily' },
              { value: '168', label: 'weekly' },
            ]}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-soft" disabled={busy || (p.backupFolderPickable && !ab.dir)} onClick={() => void backupNow()}>
            <HardDriveDownload size={16} /> {busy ? 'Backing up…' : 'Back up now'}
          </button>
          <span className="text-xs text-ink/55">
            {ab.lastError ? <span className="text-tomato">Last attempt failed: {ab.lastError}</span> : ab.lastAt ? `Last backup ${formatAgo(Date.now() - ab.lastAt)}` : 'No automatic backup yet'}
          </span>
        </div>
      </Section>

      <Section title="Export & restore">
        <p className="mb-3 text-sm text-ink/65">
          Everything lives only on this device: no account, no server. A JSON backup restores everything on any device running Promodoro. CSV opens in any spreadsheet.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={() => void exportFile('json')}>
            <Download size={16} /> Export backup (JSON)
          </button>
          <button className="btn-soft" onClick={() => void exportFile('csv')}>
            <Download size={16} /> Export sessions (CSV)
          </button>
          <button
            className="btn-soft"
            onClick={async () => {
              const f = await pickFile('.json,application/json');
              if (f) setRestore({ text: await f.text(), name: f.name });
            }}
          >
            <Upload size={16} /> Restore backup…
          </button>
          <button
            className="btn-soft"
            onClick={async () => {
              const f = await pickFile('.csv,.tsv,.txt,text/csv');
              if (f) setCsv({ text: await f.text(), name: f.name });
            }}
          >
            <Upload size={16} /> Import CSV (Forest, Flow, spreadsheets)…
          </button>
        </div>
        <details className="mt-4 text-sm text-ink/65">
          <summary className="cursor-pointer font-bold">Advanced</summary>
          <p className="my-2">Every tap is written to an append-only log. If anything ever looks off, sessions can be rebuilt from it.</p>
          <button
            className="btn-ghost"
            onClick={async () => {
              const r = await rebuildFromLog();
              toast({ text: `Rebuilt ${r.sessions} sessions from the log`, tone: 'success' });
            }}
          >
            <RefreshCw size={15} /> Rebuild from log
          </button>
        </details>
      </Section>

      {restore && <RestoreSheet file={restore} onClose={() => setRestore(null)} />}
      {csv && <ImportCsvSheet file={csv} onClose={() => setCsv(null)} />}
    </>
  );
}

function RestoreSheet({ file, onClose }: { file: { text: string; name: string }; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (mode: 'merge' | 'replace') => {
    setBusy(true);
    try {
      const r = await importJSON(file.text, mode);
      toast({ text: mode === 'merge' ? `Merged: ${r.sessions} new sessions` : `Restored ${r.sessions} sessions`, tone: 'success' });
      onClose();
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : 'Could not read that file' });
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Restore a backup">
      <p className="mb-4 text-sm text-ink/70">
        <b>{file.name}</b>
      </p>
      <div className="space-y-2">
        <button className="btn-primary w-full" disabled={busy} onClick={() => void run('merge')}>
          Merge into this device
        </button>
        <p className="text-center text-xs text-ink/55">Keeps everything here and adds what's missing. Safe to repeat.</p>
        <button className="btn-soft w-full" disabled={busy} onClick={() => void run('replace')}>
          Replace everything on this device
        </button>
        <p className="text-center text-xs text-ink/55">Makes this device an exact copy of the backup.</p>
      </div>
    </Sheet>
  );
}
