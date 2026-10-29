/**
 * "Share my stats": a notebook-style card (1080 wide, as tall as the chosen widgets need)
 * built from whatever the person ticks. Same paper, Pomo and footer as the day page, so
 * every share looks like Promodoro without a server or an account.
 */
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { updateSettings, useSettings, type ShareWidgetId } from '@/db/settings';
import type { SessionShape } from '@/engine/stats';
import { dayStart, DAY, formatDuration, formatHours, HOUR, weekStart, addDays } from '@/engine/time';
import { STICKER_ART, stickerDef } from '@/features/stickers';
import { platform } from '@/platform';
import { toast } from '@/features/toasts';
import { clip, css, loadImg, roundRect } from './DayPage';
import { cx, Sheet } from './ui';

export interface StatsSnapshot {
  name: string;
  rangeLabel: string;
  /** "today", "last 7 days", "October", "2026"… */
  rangeName: string;
  /** What the range is compared with: "yesterday", "the previous 7 days", "September"… */
  vs: string;
  /** Title of the bar chart: "focus by hour", "focus per day", "focus per month". */
  barsTitle: string;
  totals: { focusMs: number; activeDays: number; totalDays: number; avgMs: number; sessions: number; tasksDone: number; prevFocusMs?: number };
  bars: Array<{ label: string; ms: number }>;
  periods: Array<{ day: string; blocks: Array<{ from: number; to: number; color: string }> }>;
  slices: Array<{ name: string; color: string; ms: number }>;
  goal: { goalMs: number; days: Array<{ day: string; ms: number; ratio: number }> };
  hours: number[];
  shape: SessionShape;
  /** Sticker ids earned in the range. */
  stickers: string[];
}

export const SHARE_WIDGETS: Array<{ id: ShareWidgetId; label: string }> = [
  { id: 'totals', label: 'Totals' },
  { id: 'bars', label: 'Focus per day' },
  { id: 'periods', label: 'Focus periods' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'goal', label: 'Daily goal' },
  { id: 'rhythm', label: 'Your rhythm' },
  { id: 'shape', label: 'How sessions go' },
  { id: 'stickers', label: 'Stickers' },
];

const W = 1080;
const X0 = 150;
const X1 = W - 70;
const CW = X1 - X0;
const FONTS = ['400 64px "Patrick Hand"', '600 48px Fredoka', '700 28px Nunito'];

/** Canvas can't read CSS variables, so turn `rgb(var(--pm-x) / a)` into a real colour. */
function resolve(color: string): string {
  const m = color.match(/rgb\(var\(--pm-([\w-]+)\)(?:\s*\/\s*([\d.]+))?\)/);
  if (!m) return color;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--pm-${m[1]}`).trim().split(/\s+/).join(',');
  return m[2] ? `rgba(${v},${m[2]})` : `rgb(${v})`;
}

interface Block {
  h: number;
  draw: (c: CanvasRenderingContext2D, y: number) => void | Promise<void>;
}

const hourLabel = (h: number) => (h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);
const localDate = (day: string) => new Date(dayStart(day) + DAY / 2);

export async function renderStatsCard(canvas: HTMLCanvasElement, s: StatsSnapshot, widgets: ShareWidgetId[]): Promise<void> {
  await Promise.all(FONTS.map((f) => document.fonts.load(f)));
  const ink = css('ink');
  const tomato = css('tomato');
  const rule = css('rule');
  const blocks: Block[] = [];

  const title = (c: CanvasRenderingContext2D, y: number, text: string) => {
    c.fillStyle = tomato;
    c.font = '400 46px "Patrick Hand"';
    c.fillText(text, X0, y + 44);
  };
  const muted = (c: CanvasRenderingContext2D, a = 0.55) => {
    c.fillStyle = ink;
    c.globalAlpha = a;
  };

  for (const id of widgets) {
    if (id === 'totals') {
      const items: Array<[string, string]> = [
        [formatDuration(s.totals.focusMs), `focus, ${s.rangeName}`],
        [`${s.totals.activeDays}/${s.totals.totalDays}`, 'days focused'],
        [formatDuration(s.totals.avgMs), 'per active day'],
        [String(s.totals.sessions), 'sessions'],
        [String(s.totals.tasksDone), 'tasks done'],
        [s.shape.longestMs ? formatDuration(s.shape.longestMs) : '—', 'longest sitting'],
      ];
      blocks.push({
        h: 70 + 2 * 130,
        draw: (c, y) => {
          title(c, y, 'the totals');
          items.forEach(([v, l], i) => {
            const x = X0 + (i % 3) * (CW / 3);
            const yy = y + 70 + Math.floor(i / 3) * 130;
            c.fillStyle = css('sheet');
            roundRect(c, x, yy, CW / 3 - 18, 112, 20);
            c.fill();
            c.strokeStyle = rule;
            c.lineWidth = 2;
            c.stroke();
            c.fillStyle = i === 0 ? tomato : ink;
            c.font = '600 48px Fredoka';
            c.fillText(clip(c, v, CW / 3 - 56), x + 22, yy + 58);
            muted(c, 0.6);
            c.font = '400 30px "Patrick Hand"';
            c.fillText(clip(c, l, CW / 3 - 56), x + 22, yy + 94);
            c.globalAlpha = 1;
          });
        },
      });
    }

    if (id === 'bars' && s.bars.length) {
      const H = 220;
      blocks.push({
        h: 70 + H + 50,
        draw: (c, y) => {
          title(c, y, s.barsTitle);
          const max = Math.max(HOUR, ...s.bars.map((b) => b.ms));
          const best = Math.max(...s.bars.map((b) => b.ms));
          const n = s.bars.length;
          const gap = n > 14 ? 4 : 14;
          const bw = (CW - gap * (n - 1)) / n;
          const base = y + 70 + H;
          c.strokeStyle = rule;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(X0, base + 1);
          c.lineTo(X1, base + 1);
          c.stroke();
          s.bars.forEach((b, i) => {
            const x = X0 + i * (bw + gap);
            const h = (b.ms / max) * (H - 40);
            c.fillStyle = tomato;
            if (h > 0) {
              roundRect(c, x, base - h, bw, h, Math.min(8, bw / 2));
              c.fill();
            }
            if (b.ms && b.ms === best) {
              c.fillStyle = '#E9B949';
              c.font = '700 24px Nunito';
              const t = `★ ${formatHours(b.ms)}`;
              c.fillText(t, Math.min(X1 - c.measureText(t).width, Math.max(X0, x + bw / 2 - c.measureText(t).width / 2)), base - h - 10);
            }
            const every = n > 14 ? 5 : 1;
            if (i % every === 0 || i === n - 1) {
              muted(c, 0.5);
              c.font = '700 22px Nunito';
              const w = c.measureText(b.label).width;
              c.fillText(b.label, Math.min(X1 - w, x + bw / 2 - w / 2), base + 32);
              c.globalAlpha = 1;
            }
          });
        },
      });
    }

    if (id === 'periods' && s.periods.some((p) => p.blocks.length)) {
      const n = s.periods.length;
      const rowH = n <= 7 ? 40 : 16;
      const gap = n <= 7 ? 8 : 4;
      const LBL = 70;
      blocks.push({
        h: 70 + n * (rowH + gap) + 40,
        draw: (c, y) => {
          title(c, y, 'when the focus happened');
          s.periods.forEach((p, i) => {
            const yy = y + 70 + i * (rowH + gap);
            const x = X0 + LBL;
            const w = CW - LBL;
            c.fillStyle = css('paper');
            roundRect(c, x, yy, w, rowH, 5);
            c.fill();
            for (const b of p.blocks) {
              c.fillStyle = resolve(b.color);
              roundRect(c, x + (b.from / 1440) * w, yy, Math.max(3, ((b.to - b.from) / 1440) * w), rowH, 3);
              c.fill();
            }
            const d = localDate(p.day);
            const lbl = n <= 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : String(d.getDate());
            if (n <= 7 || i % 2 === 0 || i === n - 1) {
              muted(c, 0.5);
              c.font = `700 ${n <= 7 ? 24 : 18}px Nunito`;
              c.fillText(lbl, X0 + LBL - 14 - c.measureText(lbl).width, yy + rowH / 2 + 7);
              c.globalAlpha = 1;
            }
          });
          const base = y + 70 + n * (rowH + gap) + 26;
          muted(c, 0.5);
          c.font = '700 22px Nunito';
          ['12am', '6am', '12pm', '6pm', '12am'].forEach((t, i) => {
            const x = X0 + LBL + (i / 4) * (CW - LBL);
            const tw = c.measureText(t).width;
            c.fillText(t, i === 0 ? x : i === 4 ? x - tw : x - tw / 2, base);
          });
          c.globalAlpha = 1;
        },
      });
    }

    if (id === 'subjects' && s.slices.length) {
      const rows = s.slices.slice(0, 6);
      blocks.push({
        h: 70 + Math.max(280, rows.length * 56 + 20),
        draw: (c, y) => {
          title(c, y, 'where the time went');
          const total = rows.reduce((a, r) => a + r.ms, 0);
          const cx0 = X0 + 130;
          const cy0 = y + 70 + 130;
          let a = -Math.PI / 2;
          c.lineWidth = 46;
          for (const r of rows) {
            const da = (r.ms / total) * Math.PI * 2;
            c.strokeStyle = resolve(r.color);
            c.beginPath();
            c.arc(cx0, cy0, 100, a, a + Math.max(0.001, da - 0.02));
            c.stroke();
            a += da;
          }
          c.fillStyle = ink;
          c.font = '600 36px Fredoka';
          const t = formatDuration(total);
          c.fillText(t, cx0 - c.measureText(t).width / 2, cy0 + 12);
          const lx = X0 + 300;
          rows.forEach((r, i) => {
            const yy = y + 70 + 30 + i * 56;
            c.fillStyle = resolve(r.color);
            c.beginPath();
            c.arc(lx + 10, yy - 9, 10, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = ink;
            c.font = '400 36px "Patrick Hand"';
            c.fillText(clip(c, r.name, 330), lx + 34, yy);
            c.font = '600 30px Fredoka';
            const d = `${formatDuration(r.ms)}`;
            c.fillText(d, X1 - c.measureText(d).width, yy);
            muted(c, 0.5);
            c.font = '700 22px Nunito';
            const pct = `${Math.round((r.ms / total) * 100)}%`;
            c.fillText(pct, X1 - 150 - c.measureText(pct).width, yy - 2);
            c.globalAlpha = 1;
          });
        },
      });
    }

    if (id === 'goal' && s.goal.days.length) {
      const days = s.goal.days;
      const met = days.filter((d) => d.ratio >= 1).length;
      const lead = (localDate(days[0].day).getDay() + 6) % 7;
      const compact = days.length > 35;
      const weeks = compact ? Math.ceil((lead + days.length) / 7) : 0;
      const cell = compact ? Math.min(30, CW / weeks - 3) : 0;
      const rings = Math.ceil((lead + days.length) / 7);
      blocks.push({
        h: 70 + 56 + (compact ? 7 * (cell + 3) : 40 + rings * 104) + 10,
        draw: (c, y) => {
          title(c, y, 'daily goal');
          c.fillStyle = ink;
          c.font = '400 34px "Patrick Hand"';
          const line = `reached ${met} of ${days.length} days · ${formatDuration(s.goal.goalMs)} a day`;
          c.fillText(line, X0, y + 106);
          const top = y + 140;
          if (compact) {
            const byDay = new Map(days.map((d) => [d.day, d]));
            let w0 = weekStart(days[0].day);
            for (let wk = 0; wk < weeks; wk++, w0 = addDays(w0, 7)) {
              for (let j = 0; j < 7; j++) {
                const d = byDay.get(addDays(w0, j));
                if (!d) continue;
                c.fillStyle = d.ratio >= 1 ? tomato : d.ratio > 0 ? tomato : rule;
                c.globalAlpha = d.ratio >= 1 ? 1 : d.ratio > 0 ? 0.15 + 0.5 * d.ratio : 0.7;
                c.beginPath();
                c.arc(X0 + wk * (cell + 3) + cell / 2, top + j * (cell + 3) + cell / 2, cell / 2, 0, Math.PI * 2);
                c.fill();
                c.globalAlpha = 1;
              }
            }
            return;
          }
          const colW = CW / 7;
          muted(c, 0.5);
          c.font = '700 22px Nunito';
          ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((w, i) => c.fillText(w, X0 + i * colW + colW / 2 - c.measureText(w).width / 2, top + 22));
          c.globalAlpha = 1;
          days.forEach((d, i) => {
            const k = lead + i;
            const cx0 = X0 + (k % 7) * colW + colW / 2;
            const cy0 = top + 40 + Math.floor(k / 7) * 104 + 46;
            c.lineWidth = 8;
            c.strokeStyle = rule;
            c.beginPath();
            c.arc(cx0, cy0, 38, 0, Math.PI * 2);
            c.stroke();
            if (d.ratio >= 1) {
              c.fillStyle = tomato;
              c.globalAlpha = 0.14;
              c.fill();
              c.globalAlpha = 1;
            }
            if (d.ratio > 0) {
              c.strokeStyle = tomato;
              c.lineCap = 'round';
              c.beginPath();
              c.arc(cx0, cy0, 38, -Math.PI / 2, -Math.PI / 2 + Math.min(1, d.ratio) * Math.PI * 2);
              c.stroke();
              c.lineCap = 'butt';
            }
            c.fillStyle = ink;
            c.globalAlpha = d.ms ? 1 : 0.3;
            c.font = '600 24px Fredoka';
            const t = d.ms ? (d.ms / HOUR >= 10 ? String(Math.round(d.ms / HOUR)) : (d.ms / HOUR).toFixed(1)) : '0';
            c.fillText(t, cx0 - c.measureText(t).width / 2, cy0 + 9);
            c.globalAlpha = 1;
          });
        },
      });
    }

    if (id === 'rhythm' && s.hours.some((h) => h > 0)) {
      blocks.push({
        h: 70 + 60 + 170 + 40,
        draw: (c, y) => {
          title(c, y, 'my rhythm');
          const peak = s.hours.indexOf(Math.max(...s.hours));
          c.fillStyle = ink;
          c.font = '400 36px "Patrick Hand"';
          c.fillText(`I focus most around ${hourLabel(peak)}`, X0, y + 110);
          const base = y + 130 + 170;
          const max = Math.max(...s.hours);
          const bw = (CW - 23 * 6) / 24;
          s.hours.forEach((ms, h) => {
            const hh = (ms / max) * 160;
            if (!hh) return;
            c.fillStyle = tomato;
            roundRect(c, X0 + h * (bw + 6), base - hh, bw, hh, 6);
            c.fill();
          });
          muted(c, 0.5);
          c.font = '700 22px Nunito';
          ['12am', '6am', '12pm', '6pm', '12am'].forEach((t, i) => {
            const x = X0 + (i / 4) * CW;
            const tw = c.measureText(t).width;
            c.fillText(t, i === 0 ? x : i === 4 ? x - tw : x - tw / 2, base + 32);
          });
          c.globalAlpha = 1;
        },
      });
    }

    if (id === 'shape' && s.shape.count) {
      const lines: string[] = [];
      if (s.shape.targeted) lines.push(`${s.shape.ranFull} of ${s.shape.targeted} sessions ran to the bell`);
      if (s.shape.targeted) lines.push(`a typical session: ${formatDuration(s.shape.medianActualMs)} of a planned ${formatDuration(s.shape.medianPlannedMs)}`);
      lines.push(`longest sitting: ${formatDuration(s.shape.longestMs)}`);
      if (s.shape.breakMs) lines.push(`focus to rest: ${(s.shape.focusMs / s.shape.breakMs).toFixed(1)} : 1`);
      blocks.push({
        h: 70 + lines.length * 54 + 10,
        draw: (c, y) => {
          title(c, y, 'how my sessions went');
          c.fillStyle = ink;
          c.font = '400 36px "Patrick Hand"';
          lines.forEach((l, i) => c.fillText(clip(c, `✔ ${l}`, CW), X0, y + 110 + i * 54));
        },
      });
    }

    if (id === 'stickers' && s.stickers.length) {
      const defs = s.stickers.map(stickerDef).filter((d) => !!d).slice(0, 5);
      if (defs.length) {
        blocks.push({
          h: 70 + 210,
          draw: async (c, y) => {
            title(c, y, 'stickers I earned');
            let x = X0 + 90;
            for (const def of defs) {
              const img = await loadImg(STICKER_ART[def!.art]);
              c.save();
              c.translate(x, y + 70 + 95);
              c.rotate((def!.tilt * Math.PI) / 180);
              c.drawImage(img, -80, -80, 160, 160 * (img.height / img.width));
              c.restore();
              c.fillStyle = ink;
              c.globalAlpha = 0.6;
              c.font = '400 24px "Patrick Hand"';
              const t = clip(c, def!.title, 160);
              c.fillText(t, x - c.measureText(t).width / 2, y + 70 + 200);
              c.globalAlpha = 1;
              x += 175;
            }
          },
        });
      }
    }
  }

  const HEADER = 290;
  const GAP = 50;
  const FOOTER = 120;
  const H = HEADER + blocks.reduce((a, b) => a + b.h + GAP, 0) + FOOTER;
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  // paper, rules, margin, binder holes (as on the day page)
  c.fillStyle = css('creme');
  c.fillRect(0, 0, W, H);
  c.strokeStyle = rule;
  c.globalAlpha = 0.6;
  c.lineWidth = 2;
  for (let y = 250; y < H - 90; y += 64) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.globalAlpha = 1;
  c.strokeStyle = css('margin');
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(120, 0);
  c.lineTo(120, H);
  c.stroke();
  c.fillStyle = css('paper');
  for (let y = 180; y < H - 100; y += 420) {
    c.beginPath();
    c.arc(56, y, 18, 0, Math.PI * 2);
    c.fill();
  }

  // header: whose notebook, which range, and Pomo
  c.fillStyle = tomato;
  c.font = '400 76px "Patrick Hand"';
  c.fillText(clip(c, s.name ? `${s.name}'s focus` : 'my focus notebook', CW - 300), X0, 130);
  c.fillStyle = ink;
  c.font = '600 44px Fredoka';
  c.fillText(s.rangeLabel, X0, 200);
  // Only celebrate growth on a card meant for friends; a dip stays private on the Stats page.
  if (s.totals.prevFocusMs !== undefined && s.totals.focusMs - s.totals.prevFocusMs >= 60_000) {
    muted(c, 0.55);
    c.font = '700 26px Nunito';
    c.fillText(`+${formatDuration(s.totals.focusMs - s.totals.prevFocusMs)} more than ${s.vs}`, X0, 245);
    c.globalAlpha = 1;
  }
  const pomo = await loadImg(STICKER_ART[s.totals.focusMs ? 'smitten' : 'sleeping']);
  c.save();
  c.translate(W - 190, 140);
  c.rotate(0.08);
  c.drawImage(pomo, -125, -115, 250, 250 * (pomo.height / pomo.width));
  c.restore();

  // widgets on soft cards so the rules don't fight the charts
  let y = HEADER;
  for (const b of blocks) {
    c.fillStyle = css('sheet');
    c.globalAlpha = 0.85;
    roundRect(c, X0 - 26, y - 6, CW + 52, b.h + 24, 28);
    c.fill();
    c.globalAlpha = 1;
    c.textBaseline = 'alphabetic';
    await b.draw(c, y);
    c.globalAlpha = 1;
    y += b.h + GAP;
  }
  if (!blocks.length) {
    c.fillStyle = ink;
    c.globalAlpha = 0.5;
    c.font = '400 40px "Patrick Hand"';
    c.fillText('pick something to share ↑', X0, HEADER + 40);
    c.globalAlpha = 1;
  }

  // footer
  c.fillStyle = ink;
  c.globalAlpha = 0.55;
  c.font = '700 26px Nunito';
  c.fillText('made with Promodoro 🍅  ·  focus at your own pace', X0, H - 50);
  c.globalAlpha = 1;
}

/** Which widgets have something to draw for this snapshot (others are greyed out in the picker). */
function available(s: StatsSnapshot): Record<ShareWidgetId, boolean> {
  return {
    totals: true,
    bars: s.bars.some((b) => b.ms > 0),
    periods: s.periods.some((p) => p.blocks.length),
    subjects: s.slices.length > 0,
    goal: s.goal.days.length > 0,
    rhythm: s.hours.some((h) => h > 0),
    shape: s.shape.count > 0,
    stickers: s.stickers.some((id) => stickerDef(id)),
  };
}

export function ShareStatsSheet({ snapshot, onClose }: { snapshot: StatsSnapshot; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const settings = useSettings();
  const [name, setName] = useState(settings.profile.name);
  const picked = settings.shareWidgets;
  const can = available(snapshot);
  // Keep the canvas in the same order as the picker.
  const widgets = SHARE_WIDGETS.map((w) => w.id).filter((id) => picked.includes(id) && can[id]);
  const key = JSON.stringify([widgets, name, settings.theme, snapshot.rangeLabel, snapshot.totals]);

  useEffect(() => {
    if (!ref.current) return;
    setReady(false);
    let live = true;
    void renderStatsCard(ref.current, { ...snapshot, name: name.trim() }, widgets).then(() => live && setReady(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = (id: ShareWidgetId) => void updateSettings({ shareWidgets: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });
  const saveName = () => name.trim() !== settings.profile.name && void updateSettings({ profile: { ...settings.profile, name: name.trim() } });

  const save = async () => {
    const data = ref.current!.toDataURL('image/png').split(',')[1];
    const path = await platform().saveBinary(`promodoro-stats-${new Date().toISOString().slice(0, 10)}.png`, 'image/png', data);
    if (path) toast({ text: 'Card saved', tone: 'success' });
  };

  return (
    <Sheet open onClose={onClose} title="Share your stats" wide>
      <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,360px)]">
        <div className="space-y-4">
          <label className="block">
            <span className="label">name on the card</span>
            <input className="field font-hand !text-[19px]" value={name} placeholder="leave empty to stay anonymous" maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
          </label>
          <div>
            <span className="label">show on the card</span>
            <div className="flex flex-wrap gap-2">
              {SHARE_WIDGETS.map((w) => (
                <button
                  key={w.id}
                  className={cx('chip', picked.includes(w.id) && can[w.id] && 'chip-on', !can[w.id] && 'opacity-40')}
                  disabled={!can[w.id]}
                  title={can[w.id] ? undefined : 'Nothing to show for this range yet'}
                  onClick={() => toggle(w.id)}
                  aria-pressed={picked.includes(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-ink/50">The card is drawn on this device from {snapshot.rangeLabel}. Nothing is uploaded; you choose where it goes.</p>
          <button className="btn-primary" disabled={!ready} onClick={() => void save()}>
            <Download size={18} /> {platform().kind === 'android' ? 'Share image' : 'Save image'}
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto rounded-note border border-rule">
          <canvas ref={ref} className="block w-full" />
        </div>
      </div>
    </Sheet>
  );
}
