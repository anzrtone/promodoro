/**
 * "Share my page": renders a day as a handwritten notebook page (1080×1350 PNG) that
 * people can post. Every share carries a small "made with Promodoro" footer, which
 * makes it the app's word-of-mouth loop without any server.
 */
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { dayStart, DAY, formatDuration, formatTimeOfDay, HOUR } from '@/engine/time';
import type { Session } from '@/engine/types';
import { STICKER_ART, stickerDef } from '@/features/stickers';
import { platform } from '@/platform';
import { toast } from '@/features/toasts';
import { Sheet } from './ui';

const W = 1080;
const H = 1350;

export const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

export function css(name: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--pm-${name}`).trim();
  return `rgb(${v.split(/\s+/).join(',')})`;
}

export async function renderDayPage(canvas: HTMLCanvasElement, day: string): Promise<void> {
  await Promise.all(['400 64px "Patrick Hand"', '600 48px Fredoka', '700 28px Nunito'].map((f) => document.fonts.load(f)));
  const from = dayStart(day);
  const sessions: Session[] = (await db.sessions.where('day').equals(day).toArray()).filter((s) => !s.deleted).sort((a, b) => a.start - b.start);
  const stickers = (await db.stickers.where('earnedAt').between(from, from + DAY).toArray()).slice(0, 3);
  const focus = sessions.filter((s) => s.phase === 'focus');
  const total = focus.reduce((a, s) => a + s.actualMs, 0);
  const overtime = focus.reduce((a, s) => a + s.overtimeMs, 0);

  const c = canvas.getContext('2d')!;
  canvas.width = W;
  canvas.height = H;
  const ink = css('ink');
  // paper
  c.fillStyle = css('creme');
  c.fillRect(0, 0, W, H);
  c.strokeStyle = css('rule');
  c.lineWidth = 2;
  for (let y = 250; y < H - 90; y += 64) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.strokeStyle = css('margin');
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(120, 0);
  c.lineTo(120, H);
  c.stroke();
  // binder holes
  c.fillStyle = css('paper');
  for (const y of [180, H / 2, H - 180]) {
    c.beginPath();
    c.arc(56, y, 18, 0, Math.PI * 2);
    c.fill();
  }

  // header
  c.fillStyle = css('tomato');
  c.font = '400 72px "Patrick Hand"';
  const title = new Date(from + HOUR * 12).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  c.fillText(clip(c, title, W - 150 - 330), 150, 130);
  c.fillStyle = ink;
  c.font = '600 60px Fredoka';
  const headline = total ? `${formatDuration(total)} focused` : 'a quiet page';
  c.fillText(headline, 150, 210);
  const headW = c.measureText(headline).width;
  if (overtime > 0) {
    c.font = '400 38px "Patrick Hand"';
    c.fillStyle = '#C9A227';
    c.fillText(`+${formatDuration(overtime)} flow ✦`, 150 + headW + 28, 205);
  }

  const pomo = await loadImg(STICKER_ART[total ? 'content' : 'sleeping']);
  c.save();
  c.translate(W - 190, 140);
  c.rotate(0.08);
  c.drawImage(pomo, -130, -120, 260, 260 * (pomo.height / pomo.width));
  c.restore();

  // mini day bar
  const barY = 270;
  const x0 = 150;
  const x1 = W - 70;
  c.fillStyle = css('paper');
  roundRect(c, x0, barY, x1 - x0, 40, 20);
  c.fill();
  for (const s of sessions) {
    if (s.bulk) continue;
    const a = x0 + ((Math.max(s.start, from) - from) / DAY) * (x1 - x0);
    const b = x0 + ((Math.min(s.end, from + DAY) - from) / DAY) * (x1 - x0);
    c.fillStyle = s.phase === 'focus' ? (s.source === 'imported' ? '#FFE893' : css('tomato')) : css('leaf');
    roundRect(c, a, barY + 4, Math.max(4, b - a), 32, 8);
    c.fill();
  }

  // entries, one per ruled line
  let y = 378;
  c.textBaseline = 'alphabetic';
  const shown = focus.length > 13 ? focus.slice(0, 12) : sessions.filter((s) => s.phase !== 'side').slice(0, 13);
  for (const s of shown) {
    c.fillStyle = ink;
    c.globalAlpha = 0.5;
    c.font = '700 26px Nunito';
    c.fillText(s.bulk ? 'lump' : formatTimeOfDay(s.start), 150, y);
    c.globalAlpha = 1;
    c.font = '400 40px "Patrick Hand"';
    const label = `${s.phase === 'focus' ? '✔' : '☕'} ${s.label ?? (s.phase === 'focus' ? 'focus' : 'break')}${s.note ? ` — ${s.note}` : ''}`;
    c.fillText(clip(c, label, 640), 290, y);
    c.font = '600 34px Fredoka';
    const d = formatDuration(s.actualMs);
    c.fillText(d, x1 - c.measureText(d).width, y);
    y += 64;
  }
  if (focus.length > 13) {
    c.font = '400 34px "Patrick Hand"';
    c.fillText(`…and ${focus.length - 12} more`, 290, y);
  }

  // stickers earned today
  let sx = W - 200;
  for (const st of stickers) {
    const def = stickerDef(st.id);
    if (!def) continue;
    const img = await loadImg(STICKER_ART[def.art]);
    c.save();
    c.translate(sx, H - 220);
    c.rotate((def.tilt * Math.PI) / 180);
    c.drawImage(img, -80, -80, 160, 160 * (img.height / img.width));
    c.restore();
    sx -= 170;
  }

  // footer
  c.fillStyle = ink;
  c.globalAlpha = 0.55;
  c.font = '700 26px Nunito';
  c.fillText('made with Promodoro 🍅  ·  focus at your own pace', 150, H - 50);
  c.globalAlpha = 1;
}

export function clip(c: CanvasRenderingContext2D, text: string, max: number) {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function ShareDaySheet({ day, onClose }: { day: string; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const settings = useSettings();
  useEffect(() => {
    if (ref.current) void renderDayPage(ref.current, day).then(() => setReady(true));
  }, [day, settings.theme]);

  const save = async () => {
    const data = ref.current!.toDataURL('image/png').split(',')[1];
    const path = await platform().saveBinary(`promodoro-${day}.png`, 'image/png', data);
    if (path) toast({ text: 'Page saved', tone: 'success' });
  };

  return (
    <Sheet open onClose={onClose} title="Share this page" wide>
      <canvas ref={ref} className="mx-auto w-full max-w-[420px] rounded-note border border-rule shadow-note" style={{ aspectRatio: `${W}/${H}` }} />
      <div className="mt-4 flex justify-center">
        <button className="btn-primary" disabled={!ready} onClick={() => void save()}>
          <Download size={18} /> {platform().kind === 'android' ? 'Share image' : 'Save image'}
        </button>
      </div>
    </Sheet>
  );
}
