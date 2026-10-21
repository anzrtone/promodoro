/** The Sticker Book: collectible, gentle milestones. Nothing here can be lost. */
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { STICKER_ART, STICKERS } from '@/features/stickers';
import { cx } from '@/components/ui';

export function StickerScreen() {
  const earned = useLiveQuery(() => db.stickers.toArray(), [], []);
  const got = new Map(earned.map((s) => [s.id, s]));
  useEffect(() => {
    // Opening the book marks new stickers as seen.
    void db.stickers.filter((s) => !s.seen).modify({ seen: true });
  }, [earned.length]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-semibold">Sticker book</h2>
        <span className="font-hand text-[20px] text-tomato">
          {got.size} of {STICKERS.length}
        </span>
      </div>
      <p className="mb-5 max-w-prose text-sm text-ink/65">
        No streaks to break here. Stickers celebrate the things that actually help: coming back, resting, finishing early, and owning every minute you worked.
      </p>
      <div className="grid grid-cols-2 gap-4 rounded-sheet border border-rule bg-paper p-4 sm:grid-cols-3 md:grid-cols-4">
        {STICKERS.map((s) => {
          const e = got.get(s.id);
          return (
            <div key={s.id} className="flex flex-col items-center rounded-card bg-sheet/60 p-3 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                {e ? (
                  <img
                    src={STICKER_ART[s.art]}
                    alt={s.title}
                    className={cx('h-28 w-28 object-contain drop-shadow-[0_4px_6px_rgba(45,49,46,0.18)]', !e.seen && 'animate-pop')}
                    style={{ transform: `rotate(${s.tilt}deg)` }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-ink/20 font-hand text-3xl text-ink/25">?</div>
                )}
              </div>
              <div className="mt-1 font-display font-semibold">{s.title}</div>
              <div className="font-hand text-[16px] leading-5 text-ink/60">{e ? s.blurb : s.hint}</div>
              {e && <div className="mt-1 text-[11px] text-ink/40">{new Date(e.earnedAt).toLocaleDateString()}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
