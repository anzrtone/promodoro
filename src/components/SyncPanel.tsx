/** Settings → Sync your devices: pairing code, cloud folder, or a file. */
import { useEffect, useState } from 'react';
import { Cloud, Compass, Copy, Eye, EyeOff, FileDown, FileUp, FolderOpen, KeyRound, RefreshCw, Smartphone } from 'lucide-react';
import { API_BASE } from '@/config/api';
import { updateSettings, useSettings, useStoredSettings, type SyncMethod } from '@/db/settings';
import { toast } from '@/features/toasts';
import { startTour, useTour } from '@/features/tour';
import { platform } from '@/platform';
import { buildSyncFile, formatSyncCode, lastSyncedLabel, mergeSyncFile, newSyncCode, normalizeSyncCode, syncNow } from '@/sync';
import { Section, Segmented, Toggle } from './ui';

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const SYNC_FOLDER = 'Promodoro Sync';
const SYNC_COOLDOWN_MS = 10_000;
const joinPath = (dir: string, leaf: string) => {
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${leaf}`;
};

export function SyncPanel() {
  const s = useSettings();
  const sync = s.sync;
  const p = platform();
  const [busy, setBusy] = useState(false);
  const [cooling, setCooling] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState('');
  const stored = useStoredSettings();
  const [cloud, setCloud] = useState<Array<{ label: string; path: string }>>([]);
  useEffect(() => {
    void platform().cloudFolders?.().then(setCloud, () => undefined);
  }, []);
  const useFolder = (dir: string) => patch({ dir, lastError: null, lastPushHash: null });
  const tour = useTour();

  // First visit to this tab on this device: Pomo explains syncing (the same way the welcome tour works).
  const firstVisit = stored !== undefined && stored.onboarded && !stored.syncTourSeen && tour.step === null;
  useEffect(() => {
    if (!firstVisit) return;
    const t = setTimeout(() => {
      void updateSettings({ syncTourSeen: true });
      startTour('sync');
    }, 600);
    return () => clearTimeout(t);
  }, [firstVisit]);

  const patch = (next: Partial<typeof sync>) => updateSettings({ sync: { ...sync, ...next } });

  const run = async () => {
    setBusy(true);
    const r = await syncNow();
    setBusy(false);
    if (r.status === 'ok') {
      // Rest the button briefly so rapid clicks can't hammer the server.
      setCooling(true);
      setTimeout(() => setCooling(false), SYNC_COOLDOWN_MS);
    }
    if (r.status === 'ok') toast({ text: r.summary, tone: 'success' });
    else if (r.status === 'failed') toast({ text: r.error });
    else if (r.status === 'skipped' && r.reason === 'no-folder') toast({ text: 'Choose a sync folder first' });
  };

  const choose = async (method: SyncMethod) => {
    await patch({ method, lastError: null });
    setEntering(false);
  };

  const startRelay = async (code: string) => {
    await updateSettings({ sync: { ...sync, method: 'relay', code, lastError: null, lastPushHash: null, lastBlobHash: null } });
    setEntering(false);
    setTyped('');
    // Let the settings land before the first sync reads them.
    setTimeout(() => void run(), 50);
  };

  const connect = async () => {
    const norm = normalizeSyncCode(typed);
    if (!norm) return toast({ text: 'That code should be 20 letters and numbers, like ABCDE-FGHJK-MNPQR-STVWX' });
    await startRelay(formatSyncCode(norm));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sync.code ?? '');
      toast({ text: 'Code copied', tone: 'success' });
    } catch {
      setReveal(true);
      toast({ text: 'Couldn’t copy. Select the code and copy it by hand.' });
    }
  };

  const folder = sync.dir ?? (p.backupFolderPickable ? null : 'Documents/Promodoro');
  const relayReady = API_BASE !== null;

  return (
    <>
      <Section
        title="Sync your devices"
        tour="sync-panel"
        aside={
          <button className="chip" onClick={() => startTour('sync')} title="Hear how syncing works again">
            <Compass size={14} /> Re-tour
          </button>
        }
      >
        <p className="mb-3 text-sm text-ink/65">
          Everything stays on your devices. Syncing just merges the two copies: new sessions, edits and deletions follow you both ways, and you never need an account. Set it up once, then tap <b>Sync now</b> whenever you like.
        </p>
        <div className="inline-block" data-tour="sync-methods">
        <Segmented
          size="sm"
          value={sync.method}
          onChange={(v) => void choose(v)}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'relay', label: 'Pairing code', title: 'Encrypted, works anywhere' },
            { value: 'folder', label: 'Cloud folder', title: 'Through Dropbox, OneDrive, Google Drive or iCloud' },
            { value: 'file', label: 'File', title: 'Carry a file between devices yourself' },
          ]}
        />
        </div>

        <div data-tour="sync-detail">
        {sync.method === 'off' && <p className="mt-4 rounded-note border border-rule bg-creme px-3 py-2 text-sm text-ink/65">Pick a way to sync above and I'll walk you through it. Not sure which? Pairing code is the easiest.</p>}

        {sync.method === 'relay' && (
          <div className="mt-4 space-y-3">
            {!relayReady && (
              <p className="rounded-note border border-rule bg-creme px-3 py-2 text-sm text-ink/70">This build isn’t connected to a sync server. Use a cloud folder or a file instead.</p>
            )}
            {relayReady && !sync.code && (
              <>
                <p className="text-sm text-ink/65">Your data is encrypted on this device with a code only your devices know. The server just holds scrambled bytes it can’t read.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => void startRelay(newSyncCode())}>
                    <KeyRound size={16} /> This is my first device
                  </button>
                  <button className="btn-soft" onClick={() => setEntering((v) => !v)}>
                    <Smartphone size={16} /> I have a code from another device
                  </button>
                </div>
                {entering && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="field max-w-[18rem] font-mono uppercase tracking-wider"
                      placeholder="ABCDE-FGHJK-MNPQR-STVWX"
                      value={typed}
                      autoFocus
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void connect()}
                    />
                    <button className="btn-primary" onClick={() => void connect()}>
                      Connect
                    </button>
                  </div>
                )}
              </>
            )}
            {relayReady && sync.code && (
              <>
                <div>
                  <span className="label">Your sync code</span>
                  <div className="flex flex-wrap items-center gap-2 rounded-note border border-rule bg-creme px-3 py-2">
                    <span className="min-w-0 flex-1 select-all font-mono text-[15px] tracking-wider">{reveal ? sync.code : '••••• ••••• ••••• •••••'}</span>
                    <button className="chip" onClick={() => setReveal((v) => !v)}>
                      {reveal ? <EyeOff size={14} /> : <Eye size={14} />} {reveal ? 'Hide' : 'Show'}
                    </button>
                    <button className="chip" onClick={() => void copy()}>
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink/55">On your other device: Settings → Sync your devices → Pairing code → “I have a code”. Keep this private; it unlocks your synced data.</p>
                </div>
                <button
                  className="text-xs font-bold text-ink/55 underline"
                  onClick={() => {
                    if (confirm('Stop syncing this device? Your data here stays. The other devices keep syncing with each other.')) void patch({ method: 'off', code: null, lastPushHash: null, lastBlobHash: null });
                  }}
                >
                  Stop syncing on this device
                </button>
              </>
            )}
          </div>
        )}

        {sync.method === 'folder' && (
          <div className="mt-4 space-y-3">
            {p.kind === 'android' ? (
              <p className="text-sm text-ink/65">
                Each device writes its own small file into <b>Documents/Promodoro</b> and merges the others’. Let Google Drive, Syncthing or FolderSync copy that folder between your devices, and you’re set. Nothing to create.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink/65">
                  This uses a cloud app you already have, like Dropbox, OneDrive, Google Drive or iCloud, to carry the files. Pick yours and I’ll make a “Promodoro Sync” folder inside it, so there’s nothing to create. On your other device, choose the same cloud service.
                </p>
                {!sync.dir && (
                  <div className="space-y-2">
                    {cloud.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {cloud.map((c) => (
                          <button key={c.path} className="btn-soft" onClick={() => void useFolder(c.path)} title={c.path}>
                            <Cloud size={16} /> Use {c.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-note border border-rule bg-creme px-3 py-2 text-sm text-ink/70">
                        I couldn’t find Dropbox, OneDrive, Google Drive or iCloud on this computer. Pairing code works without any of them.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      {cloud.length === 0 && (
                        <button className="btn-primary" onClick={() => void choose('relay')}>
                          <KeyRound size={16} /> Use a pairing code instead
                        </button>
                      )}
                      <button
                        className="text-xs font-bold text-ink/55 underline"
                        onClick={async () => {
                          const dir = await p.pickBackupFolder('Choose a folder your cloud app keeps in sync (a new “Promodoro Sync” folder goes inside it)');
                          if (dir) await useFolder(joinPath(dir, SYNC_FOLDER));
                        }}
                      >
                        Use a different synced folder…
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {(sync.dir || p.kind === 'android') && (
              <div className="flex flex-wrap items-center gap-2 rounded-note border border-rule bg-creme px-3 py-2 text-sm">
                <FolderOpen size={16} className="shrink-0 text-ink/50" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={folder ?? ''}>
                  {folder}
                </span>
                {p.backupFolderPickable && (
                  <button className="chip" onClick={() => void patch({ dir: null, lastError: null, lastPushHash: null })}>
                    Change…
                  </button>
                )}
                {p.revealFolder && folder && (
                  <button className="chip" onClick={() => void p.revealFolder!(folder)}>
                    Open
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {sync.method === 'file' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink/65">Save a sync file on one device, move it over any way you like (email, USB, chat), and merge it on the other. Do it both ways to bring them level.</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-soft"
                onClick={async () => {
                  const f = await buildSyncFile();
                  if (await p.saveExport(f.name, 'application/json', f.text)) toast({ text: 'Sync file saved ✓', tone: 'success' });
                }}
              >
                <FileDown size={16} /> Save a sync file
              </button>
              <button
                className="btn-soft"
                onClick={async () => {
                  const f = await pickFile('.json,application/json');
                  if (!f) return;
                  try {
                    toast({ text: (await mergeSyncFile(await f.text())).summary, tone: 'success' });
                  } catch (err) {
                    toast({ text: err instanceof Error ? err.message : 'Could not read that file' });
                  }
                }}
              >
                <FileUp size={16} /> Merge a sync file…
              </button>
            </div>
          </div>
        )}

        </div>

        {((sync.method === 'folder' && folder) || (sync.method === 'relay' && sync.code)) && (
          <div className="mt-4 border-t border-rule pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary" disabled={busy || cooling || (sync.method === 'folder' && p.backupFolderPickable && !folder)} onClick={() => void run()}>
                <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : cooling ? 'Synced just now' : 'Sync now'}
              </button>
              <span className="text-xs text-ink/55">
                {sync.lastError ? <span className="text-tomato">Last attempt failed: {sync.lastError}</span> : `${lastSyncedLabel(sync)}${sync.lastSummary ? `. ${sync.lastSummary}` : ''}`}
              </span>
            </div>
            <Toggle checked={sync.auto} onChange={(v) => void patch({ auto: v })} label="Sync automatically" hint="When Promodoro opens, every so often, and when you put it away. “Sync now” always works too." />
          </div>
        )}
        {sync.method === 'file' && sync.lastAt && <p className="mt-3 text-xs text-ink/55">{lastSyncedLabel(sync)}. {sync.lastSummary}</p>}
      </Section>

    </>
  );
}
