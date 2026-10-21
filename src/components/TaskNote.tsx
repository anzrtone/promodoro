/** "Today's focus tasks" — a deliberately tiny task layer on a sticky note. */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '@/db/schema';
import { append } from '@/db/repo';
import { DAY, uid } from '@/engine/time';
import type { PendingEvent } from '@/engine/timer';
import { cx } from './ui';

export function TaskNote() {
  // Open tasks, plus ones finished in the last day so the ticks feel good.
  const tasks = useLiveQuery(
    () => db.tasks.orderBy('createdAt').filter((t) => !t.done || (t.doneAt ?? 0) > Date.now() - DAY).toArray(),
    [],
    [],
  );
  const [text, setText] = useState('');

  const add = async () => {
    const title = text.trim();
    if (!title) return;
    await db.tasks.put({ id: uid('task'), title, done: false, createdAt: Date.now() });
    setText('');
  };
  const toggle = (id: string, done: boolean) => append([{ type: 'task.done', ts: Date.now(), data: { taskId: id, done } } as PendingEvent]);

  return (
    <div className="sticky-note relative mx-auto w-full max-w-[560px] rotate-[0.4deg] overflow-hidden">
      <div className="bg-lined px-4 pb-3 pt-3 [--pm-line:34px]" style={{ backgroundPositionY: '6px' }}>
        <h3 className="mb-1 font-display text-[15px] font-semibold text-ink/80">Today's focus tasks</h3>
        <ul>
          {tasks.map((t) => (
            <li key={t.id} className="group flex h-[34px] items-center gap-2">
              <button
                onClick={() => void toggle(t.id, !t.done)}
                className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition', t.done ? 'border-leaf bg-leaf text-white' : 'border-ink/40')}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done && '✓'}
              </button>
              <span className={cx('flex-1 truncate font-hand text-[24px] leading-none', t.done && 'text-ink/40 line-through decoration-tomato/70')}>{t.title}</span>
              <button className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-60" onClick={() => db.tasks.delete(t.id)} aria-label="Delete task">
                <X size={14} className="text-ink/40" />
              </button>
            </li>
          ))}
          <li className="flex h-[34px] items-center gap-2">
            <span className="h-5 w-5 shrink-0 rounded-[6px] border-2 border-dashed border-ink/25" />
            <input
              className="flex-1 bg-transparent font-hand text-[24px] leading-none outline-none placeholder:text-ink/30"
              placeholder="add a task…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              onBlur={() => void add()}
            />
          </li>
        </ul>
      </div>
    </div>
  );
}
