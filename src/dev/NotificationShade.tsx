/**
 * Dev-only preview of the Android notifications (mounted from DevPanel, DEV builds only). It follows
 * the same rules as TimerNotificationPlugin.java: a countdown shows time left and, at zero, either
 * counts up (overtime) or disappears; a paused timer shows Resume and Stop. It checks what the app
 * sends and what the buttons do, not how Android draws it.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { formatClock } from '@/engine/time';
import { getShade, subscribeShade } from './shade';

const CORAL = '#ee6b6e';
const circle = (bg: string, fg: string) => ({ width: 40, height: 40, borderRadius: '50%', border: 0, background: bg, color: fg, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }) as const;

function useTick(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function NotificationShade() {
  const { status, report, handlers } = useSyncExternalStore(subscribeShade, getShade);
  const now = useTick(250);
  const [open, setOpen] = useState(true);
  const [reportShown, setReportShown] = useState(false);

  const live = status?.live;
  let time: string | null = null;
  let paused = false;
  if (live) {
    if (live.kind === 'paused') {
      paused = true;
      time = live.frozen;
    } else if (live.kind === 'up') time = (live.plus ? '+' : '') + formatClock(now - live.at);
    else if (now < live.at) time = formatClock(live.at - now, { ceil: true });
    else if (live.after === 'up') time = '+' + formatClock(now - live.at);
    // else: the countdown reached zero and Android clears the notification.
  }

  if (!time && !report) return null;
  const act = (a: 'toggle' | 'done') => handlers?.onAction(a);

  return (
    <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 9999, width: 340, font: '13px/1.4 system-ui, sans-serif', color: '#222' }}>
      <div style={{ background: '#4a4a4f', borderRadius: 14, padding: 10 }}>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 0, color: '#d6d6dc', fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: open ? 8 : 0 }}>
          {open ? '▾' : '▸'} Android notifications (dev preview)
        </button>
        {open && time && live && (
          <div style={{ background: '#f3f1ee', borderRadius: 22, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: report ? 8 : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: CORAL, lineHeight: 1.1 }}>{time}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status?.title}</div>
            </div>
            <button aria-label={paused ? 'Resume' : 'Pause'} onClick={() => act('toggle')} style={paused ? circle(CORAL, '#fff') : circle('rgba(128,128,128,.22)', '#7a7a7a')}>
              {paused ? '▶' : '❚❚'}
            </button>
            {paused && (
              <button aria-label="Stop" onClick={() => act('done')} style={circle('rgba(128,128,128,.22)', '#7a7a7a')}>
                ✕
              </button>
            )}
          </div>
        )}
        {open && report && (
          <div style={{ background: '#f3f1ee', borderRadius: 22, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: '#6b6b6b' }}>Scheduled for {new Date(report.at).toLocaleString()}</div>
            {reportShown ? (
              <button onClick={() => handlers?.onAction('open-stats')} style={{ all: 'unset', cursor: 'pointer', display: 'block', marginTop: 4 }}>
                <div style={{ fontWeight: 600 }}>{report.title}</div>
                <div style={{ color: '#444' }}>{report.body}</div>
              </button>
            ) : (
              <button onClick={() => setReportShown(true)} style={{ marginTop: 4, fontSize: 12 }}>
                Show the report now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
