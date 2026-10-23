/**
 * Shared bits for the task lists (Today note, subject boards, focus mode):
 * drag to reorder by a grip in the left margin, titles that turn into an input to rename,
 * and rows that write themselves in when added and slide away when deleted.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, X } from 'lucide-react';
import { reorderTasks, renameTask } from '@/db/folders';
import { db } from '@/db/schema';
import type { Task } from '@/engine/types';
import { cx } from './ui';

const LEAVE_MS = 320;

interface ListMotion {
  /** Tasks created just now (not merely loaded): these write themselves in. */
  fresh: Set<string>;
  leaving: Set<string>;
  remove(id: string): void;
}
const Motion = createContext<ListMotion | null>(null);

/** The row's ✕: inside a SortableTasks list the row slides away first, then the task is deleted. */
export function RemoveTaskButton({ id }: { id: string }) {
  const m = useContext(Motion);
  return (
    <button className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-60" onClick={() => (m ? m.remove(id) : void db.tasks.delete(id))} aria-label="Delete task">
      <X size={14} className="text-ink/40" />
    </button>
  );
}

/**
 * A reorderable list. `tasks` comes already in list order. The dropped order shows at
 * once and is saved in the background.
 */
export function SortableTasks({ tasks, children }: { tasks: Task[]; children: (ordered: Task[]) => ReactNode }) {
  const [local, setLocal] = useState<string[] | null>(null);
  // A new order from the database (our own save included) replaces the optimistic one.
  const stamp = tasks.map((t) => `${t.id}:${t.order ?? t.createdAt}`).join();
  useEffect(() => setLocal(null), [stamp]);
  const ordered = useMemo(() => {
    if (!local) return tasks;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const placed = local.map((id) => byId.get(id)).filter((t): t is Task => !!t);
    return [...placed, ...tasks.filter((t) => !local.includes(t.id))];
  }, [tasks, local]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((t) => t.id === active.id);
    const to = ordered.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(ordered, from, to);
    setLocal(next.map((t) => t.id));
    void reorderTasks(next);
  };
  // Judged by creation time, not by "first seen": a list's first render is often still loading.
  const [mountedAt] = useState(() => Date.now());
  const fresh = useMemo(() => new Set(tasks.filter((t) => t.createdAt >= mountedAt - 2000).map((t) => t.id)), [tasks, mountedAt]);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const remove = useCallback((id: string) => {
    setLeaving((l) => new Set(l).add(id));
    setTimeout(() => void db.tasks.delete(id), LEAVE_MS);
  }, []);
  const motion = useMemo(() => ({ fresh, leaving, remove }), [fresh, leaving, remove]);
  return (
    <Motion.Provider value={motion}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {children(ordered)}
        </SortableContext>
      </DndContext>
    </Motion.Provider>
  );
}

/**
 * One row of a SortableTasks list. The grip sits in the margin to the left of the row
 * (shown on hover, always faintly on touch screens), so dragging never fights with taps.
 */
export function SortableRow({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const s = useSortable({ id });
  const m = useContext(Motion);
  // Decided once, when the row first appears.
  const [fresh] = useState(() => !!m?.fresh.has(id));
  const leaving = !!m?.leaving.has(id);
  const y = s.transform?.y ?? 0;
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: s.isDragging ? `translate3d(0, ${y}px, 0) rotate(-0.8deg)` : y ? `translate3d(0, ${y}px, 0)` : undefined, transition: s.transition }}
      className={cx(
        'group relative',
        className,
        s.isDragging && 'z-10 rounded-note bg-sheet shadow-lift',
        leaving ? 'pointer-events-none animate-task-out overflow-hidden' : fresh && 'animate-task-in',
      )}
    >
      <button
        ref={s.setActivatorNodeRef}
        {...s.listeners}
        {...s.attributes}
        className={cx(
          'absolute -left-4 top-0 flex h-full w-4 cursor-grab touch-none items-center justify-center text-ink/35 opacity-0 transition-opacity hover:text-ink/70 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-60',
          s.isDragging && '!opacity-100',
        )}
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      {children}
    </li>
  );
}

/**
 * A task title you can rename in place. `tap`: a tap starts editing. `hold`: a tap calls
 * `onPick`, and a long press (or double click) starts editing.
 */
export function TaskTitle({ task, className, trigger = 'tap', onPick, title }: { task: Task; className?: string; trigger?: 'tap' | 'hold'; onPick?: () => void; title?: string }) {
  const [editing, setEditing] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancel = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(() => cancel, []);

  if (editing)
    return (
      <input
        autoFocus
        defaultValue={task.title}
        aria-label="Rename task"
        className={cx(className, 'min-w-0 border-b border-dashed border-ink/30 bg-transparent outline-none')}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            e.currentTarget.value = task.title;
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          setEditing(false);
          if (e.currentTarget.value.trim() !== task.title) void renameTask(task.id, e.currentTarget.value);
        }}
      />
    );

  const props =
    trigger === 'tap'
      ? { onClick: () => setEditing(true), title: title ?? 'Tap to rename' }
      : {
          onPointerDown: () => {
            held.current = false;
            cancel();
            hold.current = setTimeout(() => {
              held.current = true;
              setEditing(true);
            }, 500);
          },
          onPointerUp: cancel,
          onPointerLeave: cancel,
          onPointerCancel: cancel,
          onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
          onDoubleClick: () => setEditing(true),
          onClick: () => {
            if (!held.current) onPick?.();
          },
          title: title ?? 'Hold to rename',
        };
  return (
    <button type="button" className={cx(className, 'text-left', trigger === 'tap' && 'cursor-text')} {...props}>
      {task.title}
    </button>
  );
}
