/**
 * Dev-only admin panel (mounted from main.tsx behind `import.meta.env.DEV`, so it is not part of
 * any production build). A small "DEV" pill opens it; the toggle switches the whole app to the
 * pre-filled preview account and back. Ctrl+Shift+D opens it from the keyboard.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { navigate, type Tab } from '@/features/nav';
import { previewOn, setPreview } from './flag';
import { wipePreview } from './preview';

const on = previewOn();

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const counts = useLiveQuery(
    async () => ({ sessions: await db.sessions.count(), folders: await db.folders.count(), subjects: await db.boards.count(), tasks: await db.tasks.count(), notes: await db.notes.count() }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = () => {
    setPreview(!on);
    location.reload();
  };
  const reset = async () => {
    setBusy(true);
    await wipePreview(); // the preview is its own database; the real notebook is untouched
    location.reload();
  };
  const go = (t: Tab) => {
    navigate(t);
    setOpen(false);
  };

  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 9999, font: '13px/1.4 system-ui, sans-serif', color: '#222' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: on ? '#7c3aed' : '#333', color: '#fff', border: 0, borderRadius: 999, padding: '3px 10px', fontWeight: 700, fontSize: 11, opacity: 0.85, cursor: 'pointer', float: 'right' }}
      >
        DEV{on ? ' · preview' : ''}
      </button>
      {open && (
        <div style={{ clear: 'both', marginTop: 6, width: 260, background: '#fff', border: '1px solid #ccc', borderRadius: 10, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Dev admin</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={on} onChange={toggle} />
            <span>Preview account (demo data)</span>
          </label>
          <div style={{ margin: '8px 0', color: '#666', fontSize: 12 }}>
            Showing: <b>{on ? 'pre-filled preview notebook' : 'your real notebook'}</b>
            {counts && (
              <div>
                {counts.sessions} sessions · {counts.folders} folders · {counts.subjects} subjects · {counts.tasks} tasks · {counts.notes} notes
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['subjects', 'stats', 'timeline'] as Tab[]).map((t) => (
              <button key={t} onClick={() => go(t)} style={btn}>
                {t}
              </button>
            ))}
          </div>
          {on && (
            <button onClick={reset} disabled={busy} style={{ ...btn, marginTop: 8, width: '100%', color: '#b91c1c' }}>
              {busy ? 'Resetting…' : 'Reset preview data'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const btn = { border: '1px solid #ccc', background: '#f6f6f6', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 12 } as const;
