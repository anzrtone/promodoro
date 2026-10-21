import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { App } from './App';
import { requestPersistence } from '@/db/schema';
import { ensureSeeded } from '@/db/settings';
import { loadPlatform } from '@/platform';
import { engine } from '@/hooks/usePromodoroEngine';
import { startAutoBackupLoop } from '@/features/autoBackup';
import { unlockAudio } from '@/audio/engine';

async function boot() {
  await loadPlatform();
  await ensureSeeded();
  void requestPersistence();
  await engine.start();
  startAutoBackupLoop();
  if (import.meta.env.DEV) {
    const { seedDemoData } = await import('@/dev/seed');
    Object.assign(window, { promodoroSeed: seedDemoData });
  }
  // WebViews keep audio suspended until the first gesture.
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('root')!.innerHTML = `<div style="font-family:Nunito,sans-serif;padding:32px;color:#2D312E">
    <h1 style="font-family:Fredoka,sans-serif">Pomo tripped over something 🍅</h1>
    <p>Your data is safe on this device. Please restart Promodoro.</p>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:.6">${String(err?.stack ?? err)}</pre></div>`;
});
