/**
 * "Today's focus tasks" — a deliberately tiny task layer on a sticky note.
 * Shows loose tasks, the tasks of whichever subject is selected, and every task put on
 * the note (so moving one to another subject keeps it here). Drag to reorder, tap to rename.
 */
import { useEffect, useState } from 'react';
import { useCachedLiveQuery } from '@/hooks/useCachedLiveQuery';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { append } from '@/db/repo';
import { addTask, byTaskOrder } from '@/db/folders';
import { DAY } from '@/engine/time';
import type { PendingEvent } from '@/engine/timer';
import { RemoveTaskButton, SortableRow, SortableTasks, TaskTitle } from './TaskList';
import { cx } from './ui';

export function TaskNote() {
  const { boardId } = useSettings();
  const boards = useCachedLiveQuery('boards:live', () => db.boards.orderBy('order').filter((b) => !b.archived).toArray(), [], []);
  const boardMap = new Map(boards.map((b) => [b.id, b]));
  // Open tasks, plus ones finished in the last day so the ticks feel good.
  const tasks = useCachedLiveQuery(
    `tasknote:${boardId}`,
    async () =>
      (
        await db.tasks
          .filter((t) => (t.today || (t.boardId ? t.boardId === boardId : !t.folderId)) && (!t.done || (t.doneAt ?? 0) > Date.now() - DAY))
          .toArray()
      ).sort(byTaskOrder),
    [boardId],
    [],
  );
  const [text, setText] = useState('');
  // Which subject new tasks will be assigned to. Follows the active focus subject by default.
  const [addBoardId, setAddBoardId] = useState<string | null>(boardId ?? null);
  const addBoard = addBoardId ? boardMap.get(addBoardId) : undefined;

  // Stay in sync when the user changes their focus subject elsewhere.
  useEffect(() => { setAddBoardId(boardId ?? null); }, [boardId]);

  const add = async () => {
    const title = text.trim();
    if (!title) return;
    // Clear first, so whatever is typed while saving starts the next task.
    setText('');
    setAddBoardId(boardId ?? null); // reset to the active subject for the next task
    await addTask(title, addBoardId ? { kind: 'subject', id: addBoardId } : null, { today: true });
  };
  const toggle = (id: string, done: boolean) => append([{ type: 'task.done', ts: Date.now(), data: { taskId: id, done } } as PendingEvent]);

  return (
    <div className="sticky-note relative mx-auto w-full max-w-[560px] rotate-[0.4deg] overflow-hidden">
      <div className="bg-lined px-4 pb-3 pt-3 [--pm-line:34px]" style={{ backgroundPositionY: '6px' }}>
        <h3 className="mb-1 font-display text-[15px] font-semibold text-ink/80">Today's focus tasks</h3>
        <ul>
          <SortableTasks tasks={tasks}>
            {(ordered) => ordered.map((t) => {
              const taskBoard = t.boardId ? boardMap.get(t.boardId) : undefined;
              return (
                <SortableRow key={t.id} id={t.id} className="flex h-[34px] items-center gap-2">
                  <button
                    onClick={() => void toggle(t.id, !t.done)}
                    className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition', t.done ? 'border-leaf bg-leaf text-white' : 'border-ink/40')}
                    aria-label={t.done ? 'Mark not done' : 'Mark done'}
                  >
                    {t.done && '✓'}
                  </button>
                  <TaskTitle task={t} className={cx('min-w-0 flex-1 truncate font-hand text-[20px] leading-none', t.done && 'text-ink/40 line-through decoration-tomato/70')} />
                  <label
                    className="relative shrink-0 cursor-pointer"
                    title={taskBoard ? `"${taskBoard.name}" — tap to change` : 'No subject — tap to assign'}
                  >
                    <span
                      className={cx('block h-2.5 w-2.5 rounded-full border-2 transition', taskBoard ? 'border-transparent' : 'border-dashed border-ink/30')}
                      style={taskBoard ? { background: taskBoard.color } : {}}
                    />
                    <select
                      className="absolute -inset-2 cursor-pointer opacity-0"
                      value={t.boardId ?? ''}
                      onChange={(e) => {
                        const next = e.target.value;
                        // Keep it on the note: moving a task to another subject shouldn't make it vanish.
                        void db.tasks.update(t.id, { boardId: next || undefined, today: true });
                      }}
                      tabIndex={-1}
                      aria-label="Move task to subject"
                    >
                      <option value="">No subject</option>
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                  <RemoveTaskButton id={t.id} />
                </SortableRow>
              );
            })}
          </SortableTasks>
          <li className="flex h-[34px] items-center gap-2">
            <span className="h-5 w-5 shrink-0 rounded-[6px] border-2 border-dashed border-ink/25" />
            <input
              className="flex-1 bg-transparent font-hand text-[20px] leading-none outline-none placeholder:text-ink/30"
              placeholder="add a task…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              onBlur={() => void add()}
            />
            {/* Subject dot — same size & column as the board dots on rows above.
                A wider invisible select (-inset-2) keeps the tap target comfortable. */}
            <label
              className="relative shrink-0 cursor-pointer"
              title={addBoard ? `Goes to "${addBoard.name}" — tap to change` : 'No subject — tap to assign'}
            >
              <span
                className={cx('block h-2.5 w-2.5 rounded-full border-2 transition', addBoard ? 'border-transparent' : 'border-dashed border-ink/30')}
                style={addBoard ? { background: addBoard.color } : {}}
              />
              <select
                className="absolute -inset-2 cursor-pointer opacity-0"
                value={addBoardId ?? ''}
                onChange={(e) => setAddBoardId(e.target.value || null)}
                tabIndex={-1}
                aria-label="Assign task to subject"
              >
                <option value="">No subject</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            {/* Spacer matching the 14 px delete-button column so the dot stays aligned */}
            <span className="w-3.5 shrink-0" aria-hidden />
          </li>
        </ul>
      </div>
    </div>
  );
}
