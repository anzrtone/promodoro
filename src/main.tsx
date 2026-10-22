import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { requestPersistence } from '@/db/schema';
import { ensureSeeded } from '@/db/settings';
import { loadPlatform } from '@/platform';
import { engine } from '@/hooks/usePromodoroEngine';
import { startAutoBackupLoop } from '@/features/autoBackup';
import { unlockAudio } from '@/audio/engine';
import { syncSurvey } from '@/features/survey';
import { clearLeftoverDemo } from '@/features/demo';
import { brollClip, previewOn } from '@/dev/flag';
import { sendPing } from '@/features/ping';
import { startAutoSyncLoop } from '@/sync';

async function boot() {
  await loadPlatform();
  if (brollClip()) {
    const { prepareBroll } = await import('@/dev/broll');
    await prepareBroll();
  } else if (previewOn()) {
    const { ensurePreviewSeeded } = await import('@/dev/preview');
    await ensurePreviewSeeded();
  }
  await ensureSeeded();
  void requestPersistence();
  await engine.start();
  startAutoBackupLoop();
  void syncSurvey();
  void clearLeftoverDemo();
  void sendPing();
  startAutoSyncLoop();
  if (import.meta.env.DEV) {
    const { seedDemoData } = await import('@/dev/seed');
    Object.assign(window, { promodoroSeed: seedDemoData });
    // B-roll takes are recorded as finished footage: no DEV pill on screen.
    if (!brollClip()) void mountDevPanel();
  }
  // WebViews keep audio suspended until the first gesture.
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  if (brollClip()) void import('@/dev/broll').then((m) => m.runBroll());
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('root')!.innerHTML = `<div style="font-family:Nunito,sans-serif;padding:32px;color:#2D312E">
    <h1 style="font-family:Fredoka,sans-serif">Pomo tripped over something 🍅</h1>
    <p>Your data is safe on this device. Please restart Promodoro.</p>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:.6">${String(err?.stack ?? err)}</pre></div>`;
});

/** Dev-only admin panel, in its own React root so it never touches the app tree. */
async function mountDevPanel() {
  const { DevPanel } = await import('@/dev/DevPanel');
  const el = document.createElement('div');
  document.body.appendChild(el);
  createRoot(el).render(<DevPanel />);
}
