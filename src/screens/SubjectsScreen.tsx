/**
 * Subjects: folders (two levels deep) of subjects, each with its own tasks and notes.
 * Desktop: tree on the left, details on the right. Phones: tap a row to open its details in a sheet.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ChevronDown, ChevronRight, Folder as FolderIcon, FolderPlus, GripVertical, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { db } from '@/db/schema';
import { append } from '@/db/repo';
import { useSettings } from '@/db/settings';
import {
  addFolder,
  addNote,
  addSubject,
  addTask,
  moveFolder,
  moveSubject,
  removeFolder,
  removeSubject,
  saveLayout,
  saveNote,
  setFolderArchived,
  SWATCHES,
  type Owner,
} from '@/db/folders';
import { canMoveFolder, childFolders, descendantIds, folderPath } from '@/engine/folders';
import { buildLayout, canPlaceFolder, containerOf, layoutChanges, LOOSE, moveItem, ROOT, type Kind, type Layout } from '@/engine/treeLayout';
import { DAY, formatDuration, today, weekStart } from '@/engine/time';
import type { PendingEvent } from '@/engine/timer';
import type { Board, Folder, Note, Task } from '@/engine/types';
import { toast } from '@/features/toasts';
import { SoundSelect } from '@/components/PromodoroCard';
import { FolderSelect } from '@/components/QuickAdd';
import { cx, Empty, Sheet } from '@/components/ui';

type Sel = Owner | null;

export function SubjectsScreen() {
  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), [], []);
  const boards = useLiveQuery(() => db.boards.orderBy('order').toArray(), [], []);
  const week = useWeekTotals();
  const [sel, setSel] = useState<Sel>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const wide = useWide();

  const live = folders.filter((f) => !f.archived);
  const liveBoards = boards.filter((b) => !b.archived);
  const archivedFolders = folders.filter((f) => f.archived && !(f.parentId && folders.find((p) => p.id === f.parentId)?.archived));
  const archivedBoards = boards.filter((b) => b.archived && !(b.folderId && folders.find((f) => f.id === b.folderId)?.archived));

  // Drop the selection if what it pointed at went away.
  useEffect(() => {
    if (sel && !(sel.kind === 'folder' ? folders : boards).some((x) => x.id === sel.id)) setSel(null);
  }, [sel, folders, boards]);

  const select = (s: Sel, isNew = false) => {
    setSel(s);
    setFresh(isNew && s ? s.id : null);
  };
  const newFolder = async (parentId?: string) => select({ kind: 'folder', id: await addFolder({ name: parentId ? 'New subfolder' : 'New folder', color: '#E9B949', parentId }) }, true);
  const newSubject = async (folderId?: string) =>
    select({ kind: 'subject', id: await addSubject({ name: 'New subject', color: SWATCHES[(boards.length * 3) % SWATCHES.length], folderId }) }, true);

  const dnd = useTreeDnd(live, liveBoards);
  const ctx: TreeCtx = {
    folders: new Map(live.map((f) => [f.id, f])),
    boards: new Map(liveBoards.map((b) => [b.id, b])),
    layout: dnd.layout,
    week,
    sel,
    select,
    newFolder,
    newSubject,
    dragging: dnd.dragging,
    overBox: dnd.overBox,
    landed: dnd.landed,
  };
  const detail = sel && <Detail key={sel.id} sel={sel} fresh={fresh === sel.id} folders={folders} boards={boards} week={week} bare={!wide} onClose={() => setSel(null)} />;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div data-tour="subjects-intro">
          <h2 className="font-display text-2xl font-semibold">Subjects</h2>
          <p className="text-sm text-ink/60">Group subjects into folders, and keep tasks and notes right where they belong.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft" onClick={() => void newFolder()} data-tour="new-folder">
            <FolderPlus size={16} /> New folder
          </button>
          <button className="btn-primary !py-2.5 !text-sm" onClick={() => void newSubject()}>
            <Plus size={16} /> New subject
          </button>
        </div>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="flex flex-col gap-3">
          <DndContext {...dnd.context}>
            <SortableContext items={dnd.layout.folders[ROOT].map(fid)} strategy={verticalListSortingStrategy}>
              {dnd.layout.folders[ROOT].map((id) => (
                <FolderCard key={id} id={id} ctx={ctx} />
              ))}
            </SortableContext>
            <LooseZone ctx={ctx} />
            <DragOverlay {...dnd.overlay}>{dnd.dragging && <DragGhost what={dnd.dragging} ctx={ctx} />}</DragOverlay>
          </DndContext>

          {(archivedFolders.length > 0 || archivedBoards.length > 0) && (
            <div className="card p-3">
              <button className="flex w-full items-center gap-2 text-left" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="label !mb-0">Archived ({archivedFolders.length + archivedBoards.length})</span>
              </button>
              {showArchived && (
                <ul className="mt-2 space-y-1">
                  {archivedFolders.map((f) => (
                    <ArchivedRow key={f.id} color={f.color} name={folderPath(f.id, folders)} folder onRestore={() => void setFolderArchived(f.id, false)} />
                  ))}
                  {archivedBoards.map((b) => (
                    <ArchivedRow key={b.id} color={b.color} name={b.name} onRestore={() => void db.boards.update(b.id, { archived: false })} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {wide ? (
          <aside className="sticky top-4">{detail ?? <div className="card p-5"><Empty>pick a folder or subject</Empty></div>}</aside>
        ) : (
          <Sheet
            open={!!sel}
            onClose={() => setSel(null)}
            title={
              sel && fresh === sel.id
                ? sel.kind === 'subject'
                  ? 'New subject'
                  : 'New folder'
                : undefined
            }
          >
            {detail}
          </Sheet>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tree                                                                */

interface TreeCtx {
  folders: Map<string, Folder>;
  boards: Map<string, Board>;
  /** Where everything sits (a draft while dragging). */
  layout: Layout;
  week: Map<string, number>;
  sel: Sel;
  select: (s: Sel) => void;
  newFolder: (parentId?: string) => Promise<void>;
  newSubject: (folderId?: string) => Promise<void>;
  /** What's being dragged right now, if anything. */
  dragging: Owner | null;
  /** The drop box the dragged item is currently headed for, e.g. "c:loose" or "fc:<folderId>". */
  overBox: string | null;
  /** The id of whatever was just dropped somewhere new, so it can play its landing animation. */
  landed: string | null;
}

/*
 * Ids inside the drag-and-drop context:
 *   s:<id>  a subject row (sortable)        c:<key>   a box subjects can go into (folder, subfolder, or "loose")
 *   f:<id>  a folder (sortable)             fc:<key>  a box folders can go into (a top-level folder's body)
 * Top-level folders sort in the implicit ROOT box, which is everything that isn't inside a folder body.
 */
const sid = (id: string) => `s:${id}`;
const fid = (id: string) => `f:${id}`;
const split = (x: UniqueIdentifier) => {
  const s = String(x);
  const i = s.indexOf(':');
  return [s.slice(0, i), s.slice(i + 1)] as const;
};
const kindOf = (o: Owner): Kind => o.kind;
const listsOf = (l: Layout, k: Kind) => (k === 'folder' ? l.folders : l.subjects);

function useTreeDnd(folders: Folder[], boards: Board[]) {
  const base = useMemo(() => buildLayout(folders, boards), [folders, boards]);
  const [draft, setDraft] = useState<Layout | null>(null);
  const layout = draft ?? base;
  const latest = useRef(layout);
  latest.current = layout;
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const [dragging, setDragging] = useState<Owner | null>(null);
  const [overBox, setOverBox] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const startBox = useRef<string | undefined>();

  // Mouse drags after a few pixels; touch after a short press, so scrolling still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  // Once the saved tree catches up with a drop, let go of the draft.
  useEffect(() => {
    if (!dragging) setDraft(null);
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 800);
    return () => clearTimeout(t);
  }, [landed]);

  /**
   * First find the box under the pointer (the innermost one, since boxes nest), then the nearest
   * item inside it. Pointer in a gap between cards? Keep the last answer instead of flickering.
   */
  const collision: CollisionDetection = (args) => {
    const [ak, aid] = split(args.active.id);
    const l = latest.current;
    const area = (id: UniqueIdentifier) => {
      const r = args.droppableRects.get(id);
      return r ? r.width * r.height : Infinity;
    };
    const innermost = (prefix: string, ok: (key: string) => boolean = () => true) =>
      pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(prefix) && ok(split(c.id)[1])) }).sort(
        (a, b) => area(a.id) - area(b.id),
      )[0];
    const nearest = (ids: string[], box: UniqueIdentifier | undefined) => {
      const want = new Set(ids);
      const items = args.droppableContainers.filter((c) => want.has(String(c.id)));
      const hit = items.length ? closestCenter({ ...args, droppableContainers: items })[0] : box !== undefined ? { id: box } : undefined;
      if (hit) lastOver.current = hit.id;
      return hit ? [hit] : lastOver.current ? [{ id: lastOver.current }] : [];
    };
    if (ak === 's') {
      const box = innermost('c:');
      if (!box) return lastOver.current ? [{ id: lastOver.current }] : [];
      const key = split(box.id)[1];
      return nearest((l.subjects[key] ?? []).filter((x) => x !== aid).map(sid), box.id);
    }
    const box = innermost('fc:', (key) => canPlaceFolder(l, aid, key));
    const key = box ? split(box.id)[1] : ROOT;
    return nearest((l.folders[key] ?? []).filter((x) => x !== aid).map(fid), box?.id);
  };

  /** Which box and position the pointer is aiming at. */
  const aim = (e: DragOverEvent | DragEndEvent): { kind: Kind; id: string; to: string; index: number } | null => {
    if (!e.over) return null;
    const [ak, id] = split(e.active.id);
    const kind: Kind = ak === 's' ? 'subject' : 'folder';
    const [ok, oid] = split(e.over.id);
    const l = latest.current;
    if (ok === 's' || ok === 'f') {
      const to = containerOf(l, kind, oid);
      if (!to) return null;
      const r = e.active.rect.current.translated;
      const below = !!r && r.top + r.height / 2 > e.over.rect.top + e.over.rect.height / 2;
      return { kind, id, to, index: listsOf(l, kind)[to].indexOf(oid) + (below ? 1 : 0) };
    }
    return { kind, id, to: oid, index: listsOf(l, kind)[oid]?.length ?? 0 };
  };

  const onDragStart = (e: DragStartEvent) => {
    const what = e.active.data.current as Owner;
    lastOver.current = null;
    startBox.current = containerOf(latest.current, kindOf(what), what.id);
    setDraft(latest.current);
    setDragging(what);
  };

  // Moving into a different box updates the draft right away, so the rows there slide apart to make room.
  const onDragOver = (e: DragOverEvent) => {
    const a = aim(e);
    if (!a) return;
    setOverBox(`${a.kind === 'subject' ? 'c' : 'fc'}:${a.to}`);
    const l = latest.current;
    if (containerOf(l, a.kind, a.id) === a.to) return;
    if (a.kind === 'folder' && !canPlaceFolder(l, a.id, a.to)) return;
    setDraft(moveItem(l, a.kind, a.id, a.to, a.index));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const a = aim(e);
    let l = latest.current;
    // Within one box, the sortable list already shows the new spot; make it real.
    if (a && e.over && split(e.over.id)[1] !== a.id && containerOf(l, a.kind, a.id) === a.to && ['s', 'f'].includes(split(e.over.id)[0])) {
      l = moveItem(l, a.kind, a.id, a.to, listsOf(l, a.kind)[a.to].indexOf(split(e.over.id)[1]));
    }
    setDraft(l);
    setDragging(null);
    setOverBox(null);
    const { folderPatches, subjectPatches } = layoutChanges(l, folders, boards);
    if (!folderPatches.length && !subjectPatches.length) return setDraft(null);
    const what = e.active.data.current as Owner;
    const endBox = containerOf(l, kindOf(what), what.id);
    if (endBox !== startBox.current) {
      setLanded(what.id);
      if (endBox && endBox !== ROOT && endBox !== LOOSE) setClosed(endBox, false);
    }
    await saveLayout(l);
  };

  const context = {
    sensors,
    collisionDetection: collision,
    onDragStart,
    onDragOver,
    onDragEnd: (e: DragEndEvent) => void onDragEnd(e),
    onDragCancel: () => {
      setDraft(null);
      setDragging(null);
      setOverBox(null);
    },
  };
  // The lifted copy glides into the item's new spot as you let go.
  const overlay = {
    dropAnimation: { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1)', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.3' } } }) },
  };
  return { context, overlay, layout, dragging, overBox, landed };
}

/** Sortable item + drop box on the same element. */
function useItem(what: Owner, box: string, ctx: TreeCtx, opts: { disabled?: boolean } = {}) {
  const sort = useSortable({ id: what.kind === 'folder' ? fid(what.id) : sid(what.id), data: what });
  const drop = useDroppable({ id: box, disabled: opts.disabled });
  return {
    ref: (el: HTMLElement | null) => {
      sort.setNodeRef(el);
      drop.setNodeRef(el);
    },
    handle: { ref: sort.setActivatorNodeRef, ...sort.listeners, ...sort.attributes },
    style: { transform: CSS.Translate.toString(sort.transform), transition: sort.transition },
    isDragging: sort.isDragging,
    isOver: ctx.overBox === box,
  };
}

/** How a box looks while something is being dragged: dashed where it could go, lit up where it's headed. */
function boxCls(ctx: TreeCtx, box: string, kind: Kind) {
  return cx(
    'outline outline-2 outline-offset-2 transition-[outline-color,background-color,box-shadow] duration-150',
    ctx.dragging?.kind !== kind ? 'outline-transparent' : ctx.overBox === box ? 'bg-tomato/[0.06] outline-tomato/70' : 'outline-dashed outline-tomato/20',
  );
}

function FolderCard({ id, ctx }: { id: string; ctx: TreeCtx }) {
  const folder = ctx.folders.get(id)!;
  const [open, setOpen] = useCollapsed(id);
  const subs = ctx.layout.folders[id] ?? [];
  const subjects = ctx.layout.subjects[id] ?? [];
  const item = useItem({ kind: 'folder', id }, `c:${id}`, ctx);
  // While a folder is dragged, this folder's body is where it would go to become a subfolder.
  const folderDrag = ctx.dragging?.kind === 'folder' && canPlaceFolder(ctx.layout, ctx.dragging.id, id);
  const body = useDroppable({ id: `fc:${id}`, disabled: !folderDrag });
  useHoverOpen(open, () => setOpen(true), item.isOver || ctx.overBox === `fc:${id}`);
  const total = sumWeek([id, ...subs], ctx);
  return (
    <div
      ref={item.ref}
      style={item.style}
      className={cx('card relative', boxCls(ctx, `c:${id}`, 'subject'), item.isDragging && 'opacity-30', ctx.landed === id && 'animate-land')}
      data-tour={`folder:${id}`}
    >
      <FolderHeader folder={folder} ctx={ctx} open={open} onToggle={() => setOpen(!open)} total={total} count={subjects.length + subs.length} handle={item.handle} top />
      {open ? (
        <div ref={body.setNodeRef} className={cx('space-y-1 rounded-b-card px-3 pb-3', folderDrag && boxCls(ctx, `fc:${id}`, 'folder'))}>
          <SortableContext items={subs.map(fid)} strategy={verticalListSortingStrategy}>
            {subs.map((s) => (
              <SubfolderBlock key={s} id={s} ctx={ctx} />
            ))}
          </SortableContext>
          <SortableContext items={subjects.map(sid)} strategy={verticalListSortingStrategy}>
            {subjects.map((b) => (
              <SubjectRow key={b} id={b} ctx={ctx} />
            ))}
          </SortableContext>
          {!subs.length && !subjects.length && <DropHint ctx={ctx} active={item.isOver}>Empty. Add a subject, or drag one in.</DropHint>}
          {folderDrag && !subs.length && <DropHint ctx={ctx} active={ctx.overBox === `fc:${id}`}>Drop to make it a subfolder</DropHint>}
        </div>
      ) : (
        folderDrag && (
          <div ref={body.setNodeRef}>
            <DropHint ctx={ctx} active={ctx.overBox === `fc:${id}`}>Drop inside {folder.name}</DropHint>
          </div>
        )
      )}
      {!open && ctx.dragging?.kind === 'subject' && item.isOver && <DropHint ctx={ctx} active>Drop into {folder.name}</DropHint>}
    </div>
  );
}

function SubfolderBlock({ id, ctx }: { id: string; ctx: TreeCtx }) {
  const folder = ctx.folders.get(id)!;
  const [open, setOpen] = useCollapsed(id);
  const subjects = ctx.layout.subjects[id] ?? [];
  const item = useItem({ kind: 'folder', id }, `c:${id}`, ctx);
  useHoverOpen(open, () => setOpen(true), item.isOver);
  return (
    <div
      ref={item.ref}
      style={item.style}
      className={cx('rounded-note border border-rule bg-creme/60', boxCls(ctx, `c:${id}`, 'subject'), item.isDragging && 'opacity-30', ctx.landed === id && 'animate-land')}
    >
      <FolderHeader folder={folder} ctx={ctx} open={open} onToggle={() => setOpen(!open)} total={sumWeek([id], ctx)} count={subjects.length} handle={item.handle} />
      {open && (
        <div className="space-y-1 px-2 pb-2">
          <SortableContext items={subjects.map(sid)} strategy={verticalListSortingStrategy}>
            {subjects.map((b) => (
              <SubjectRow key={b} id={b} ctx={ctx} />
            ))}
          </SortableContext>
          {!subjects.length && <DropHint ctx={ctx} active={item.isOver}>Empty.</DropHint>}
        </div>
      )}
      {!open && ctx.dragging?.kind === 'subject' && item.isOver && <DropHint ctx={ctx} active>Drop into {folder.name}</DropHint>}
    </div>
  );
}

/** Hovering a closed folder with something in hand opens it. */
function useHoverOpen(isOpen: boolean, open: () => void, hovering: boolean) {
  useEffect(() => {
    if (isOpen || !hovering) return;
    const t = setTimeout(open, 550);
    return () => clearTimeout(t);
  }, [isOpen, hovering]); // eslint-disable-line react-hooks/exhaustive-deps
}

function DropHint({ ctx, active, children }: { ctx: TreeCtx; active: boolean; children: ReactNode }) {
  if (!ctx.dragging) return <p className="px-2 py-1 text-sm text-ink/45">{children}</p>;
  return (
    <div
      className={cx(
        'mx-2 my-1 rounded-note border-2 border-dashed px-3 py-3 text-center text-sm transition-colors duration-150',
        active ? 'border-tomato/70 bg-tomato/10 text-tomato' : 'border-ink/15 text-ink/40',
      )}
    >
      {active ? 'Let go to drop here' : children}
    </div>
  );
}

type Handle = ReturnType<typeof useItem>['handle'];

function FolderHeader({ folder, ctx, open, onToggle, total, count, top, handle }: { folder: Folder; ctx: TreeCtx; open: boolean; onToggle: () => void; total: number; count: number; top?: boolean; handle: Handle }) {
  const on = ctx.sel?.kind === 'folder' && ctx.sel.id === folder.id;
  return (
    <div
      {...handle}
      className={cx('group flex cursor-grab touch-manipulation select-none items-center gap-1.5 active:cursor-grabbing', top ? 'rounded-t-card px-2 py-2' : 'rounded-t-note px-1.5 py-1.5', on && 'bg-halo/60')}
    >
      <button className="btn-ghost !p-1" onClick={onToggle} aria-label={open ? 'Collapse' : 'Expand'}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => ctx.select({ kind: 'folder', id: folder.id })}>
        <FolderIcon size={top ? 19 : 16} style={{ color: folder.color }} fill={folder.color} fillOpacity={0.25} className="shrink-0" />
        <span className={cx('truncate font-bold', top ? 'text-[16px]' : 'text-[14px]')}>{folder.name}</span>
        <span className="shrink-0 text-xs text-ink/45">{count}</span>
      </button>
      {total > 0 && <span className="shrink-0 text-xs text-ink/50" title="Focus time this week">{formatDuration(total)}</span>}
      <div className="flex shrink-0 opacity-70 transition group-hover:opacity-100">
        {top && (
          <button className="btn-ghost !p-1.5" onClick={() => void ctx.newFolder(folder.id)} title="New subfolder" aria-label="New subfolder">
            <FolderPlus size={15} />
          </button>
        )}
        <button className="btn-ghost !p-1.5" onClick={() => void ctx.newSubject(folder.id)} title="New subject here" aria-label="New subject here" data-tour={`folder-add:${folder.id}`}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function SubjectRow({ id, ctx }: { id: string; ctx: TreeCtx }) {
  const board = ctx.boards.get(id)!;
  const what: Owner = { kind: 'subject', id };
  const sort = useSortable({ id: sid(id), data: what });
  const on = ctx.sel?.kind === 'subject' && ctx.sel.id === id;
  const ms = ctx.week.get(id) ?? 0;
  return (
    <div
      ref={sort.setNodeRef}
      style={{ transform: CSS.Translate.toString(sort.transform), transition: sort.transition }}
      {...sort.listeners}
      {...sort.attributes}
      className={cx(
        'group relative flex cursor-grab touch-manipulation select-none items-center gap-2 rounded-note px-2 py-1.5 hover:bg-paper active:cursor-grabbing',
        on && 'bg-halo hover:bg-halo',
        sort.isDragging && 'z-10 opacity-30 outline-dashed outline-1 outline-ink/30',
        ctx.landed === id && 'animate-land',
      )}
      onClick={() => ctx.select(what)}
      data-tour={`subject:${id}`}
    >
      <GripVertical size={14} className="shrink-0 text-ink/25 transition-colors group-hover:text-ink/50" />
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: board.color }} />
      <span className="min-w-0 flex-1 truncate text-[15px]">{board.name}</span>
      <span className="shrink-0 text-xs text-ink/50">{ms > 0 ? formatDuration(ms) : ''}</span>
    </div>
  );
}

/** The lifted copy that follows the pointer while dragging. */
function DragGhost({ what, ctx }: { what: Owner; ctx: TreeCtx }) {
  const item = what.kind === 'folder' ? ctx.folders.get(what.id) : ctx.boards.get(what.id);
  if (!item) return null;
  return (
    <div className="flex w-max max-w-[280px] rotate-[-2deg] scale-105 cursor-grabbing items-center gap-2 rounded-note border border-rule bg-sheet px-3 py-2 shadow-lift">
      {what.kind === 'folder' ? (
        <FolderIcon size={17} style={{ color: item.color }} fill={item.color} fillOpacity={0.25} />
      ) : (
        <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
      )}
      <span className="truncate text-[15px] font-bold">{item.name}</span>
    </div>
  );
}

function ArchivedRow({ color, name, folder, onRestore }: { color: string; name: string; folder?: boolean; onRestore: () => void }) {
  return (
    <li className="flex items-center gap-2 px-2 py-1 text-ink/60">
      {folder ? <FolderIcon size={15} style={{ color }} /> : <span className="h-3 w-3 rounded-full" style={{ background: color }} />}
      <span className="flex-1 truncate text-sm">{name}</span>
      <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={onRestore}>
        Unarchive
      </button>
    </li>
  );
}

function LooseZone({ ctx }: { ctx: TreeCtx }) {
  const box = `c:${LOOSE}`;
  const drop = useDroppable({ id: box });
  const subjects = ctx.layout.subjects[LOOSE] ?? [];
  return (
    <div ref={drop.setNodeRef} className={cx('card p-3', boxCls(ctx, box, 'subject'))}>
      <div className="mb-1 flex items-center justify-between">
        <span className="label !mb-0">Loose</span>
        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={() => void ctx.newSubject()}>
          <Plus size={13} /> subject
        </button>
      </div>
      <SortableContext items={subjects.map(sid)} strategy={verticalListSortingStrategy}>
        {subjects.map((b) => (
          <SubjectRow key={b} id={b} ctx={ctx} />
        ))}
      </SortableContext>
      {!subjects.length && (
        <DropHint ctx={ctx} active={ctx.overBox === box}>
          Drop subjects here to take them out of a folder.
        </DropHint>
      )}
    </div>
  );
}

function sumWeek(folderIds: string[], ctx: TreeCtx): number {
  return folderIds.flatMap((f) => ctx.layout.subjects[f] ?? []).reduce((n, b) => n + (ctx.week.get(b) ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* Details                                                             */

function Detail({ sel, fresh, folders, boards, week, bare, onClose }: { sel: Owner; fresh: boolean; folders: Folder[]; boards: Board[]; week: Map<string, number>; bare: boolean; onClose: () => void }) {
  const folder = sel.kind === 'folder' ? folders.find((f) => f.id === sel.id) : undefined;
  const board = sel.kind === 'subject' ? boards.find((b) => b.id === sel.id) : undefined;
  const item = folder ?? board;
  if (!item) return null;

  const save = (patch: Partial<Folder & Board>) => (folder ? db.folders.update(folder.id, patch) : db.boards.update(board!.id, patch));

  // Folders show their own tasks & notes first, then those of everything inside them.
  const inside: Owner[] = folder
    ? [
        ...childFolders(folder.id, folders).map((f) => ({ kind: 'folder' as const, id: f.id })),
        ...boards.filter((b) => b.folderId && descendantIds(folder.id, folders).includes(b.folderId)).map((b) => ({ kind: 'subject' as const, id: b.id })),
      ]
    : [];
  const nameOf = (o: Owner) => (o.kind === 'folder' ? folders.find((f) => f.id === o.id)?.name : boards.find((b) => b.id === o.id)?.name) ?? '';

  return (
    <div className={cx(!bare && 'card relative p-4 sm:p-5')}>
      <div className="mb-3 flex items-center gap-2">
        <ColorDot color={item.color} onChange={(color) => void save({ color })} />
        <DraftInput
          className="min-w-0 flex-1 rounded-note bg-transparent px-1 font-display text-xl font-semibold outline-none focus:bg-sheet"
          value={item.name}
          autoFocus={fresh}
          onSave={(name) => void save({ name: name.trim() || item.name })}
          aria-label="Name"
        />
        <button className="btn-ghost !p-2 max-md:hidden" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SWATCHES.map((c) => (
          <button key={c} className={cx('h-6 w-6 rounded-full border-2', item.color.toLowerCase() === c.toLowerCase() ? 'border-ink/60' : 'border-transparent')} style={{ background: c }} onClick={() => void save({ color: c })} aria-label={`Colour ${c}`} />
        ))}
      </div>

      {board && <SubjectFields board={board} folders={folders} week={week.get(board.id) ?? 0} />}
      {folder && <FolderFields folder={folder} folders={folders} />}

      <TasksBlock owner={sel} inside={inside} nameOf={nameOf} />
      <NotesBlock owner={sel} inside={inside} nameOf={nameOf} />
    </div>
  );
}

function SubjectFields({ board, folders, week }: { board: Board; folders: Folder[]; week: number }) {
  const settings = useSettings();
  const [confirm, setConfirm] = useState(false);
  const sessionCount = useLiveQuery(
    () => db.sessions.where('boardId').equals(board.id).filter((s) => !s.deleted).count(),
    [board.id],
    0,
  );
  return (
    <div className="space-y-3 border-b border-rule pb-4">
      <p className="text-sm text-ink/60">{week > 0 ? `${formatDuration(week)} of focus this week` : 'No focus time this week yet'}</p>
      <label className="block">
        <span className="label">Folder</span>
        <FolderSelect value={board.folderId} folders={folders.filter((f) => !f.archived)} onChange={(id) => void moveSubject(board.id, id)} noneLabel="Loose (no folder)" />
      </label>
      <label className="block">
        <span className="label">Alarm sound</span>
        <SoundSelect value={board.soundId} allowDefault onChange={(v) => void db.boards.update(board.id, { soundId: v })} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost !px-2.5 !text-xs" onClick={() => void db.boards.update(board.id, { archived: !board.archived })}>
          <Archive size={14} /> {board.archived ? 'Unarchive' : 'Archive'}
        </button>
        {confirm ? (
          <div className="w-full rounded-note border border-rule bg-creme p-3 text-sm">
            <p className="mb-2 text-ink/80">
              {sessionCount > 0
                ? `This will permanently delete this subject and its ${sessionCount} session${sessionCount !== 1 ? 's' : ''} of focus history.`
                : 'This will permanently delete this subject.'}
            </p>
            <p className="mb-3 text-xs text-ink/60">Tasks and notes will move to the folder.</p>
            <div className="flex flex-wrap gap-2">
              <button className="chip !border-tomato !text-tomato" onClick={() => void removeSubject(board.id)}>
                Delete permanently
              </button>
              <button className="chip" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost !px-2.5 !text-xs" onClick={() => setConfirm(true)}>
            <Trash2 size={14} /> Delete
          </button>
        )}
        {settings.boardId === board.id && <span className="chip chip-on !cursor-default">selected on Focus</span>}
      </div>
    </div>
  );
}

function FolderFields({ folder, folders }: { folder: Folder; folders: Folder[] }) {
  const [confirm, setConfirm] = useState(false);
  const hasSubs = folders.some((f) => f.parentId === folder.id);
  const parents = childFolders(undefined, folders).filter((f) => !f.archived && f.id !== folder.id && canMoveFolder(folder.id, f.id, folders));
  return (
    <div className="space-y-3 border-b border-rule pb-4">
      <label className="block">
        <span className="label">Inside</span>
        <div className="relative">
          <select
            className="field appearance-none pr-8"
            value={folder.parentId ?? ''}
            disabled={hasSubs}
            onChange={(e) => void moveFolder(folder.id, e.target.value || undefined)}
          >
            <option value="">Top level</option>
            {parents.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3 text-ink/50" />
        </div>
        {hasSubs && <span className="mt-1 block text-xs text-ink/50">This folder has subfolders, so it stays at the top level.</span>}
      </label>
      {confirm ? (
        <div className="rounded-note border border-rule bg-creme p-3 text-sm">
          <p className="mb-2">What should happen to subjects inside?</p>
          <div className="flex flex-wrap gap-2">
            <button className="chip" onClick={() => void removeFolder(folder.id, 'lift')}>
              Keep contents
            </button>
            <button className="chip" onClick={() => void removeFolder(folder.id, 'archive')}>
              Archive everything
            </button>
            <button className="chip" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-ink/50">
            “Keep contents” moves subjects out of the folder. “Archive everything” hides the folder and all subjects inside.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost !px-2.5 !text-xs" onClick={() => void setFolderArchived(folder.id, !folder.archived)}>
            <Archive size={14} /> {folder.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button className="btn-ghost !px-2.5 !text-xs" onClick={() => setConfirm(true)}>
            <Trash2 size={14} /> Delete folder
          </button>
        </div>
      )}
    </div>
  );
}

const ownerKey = (o: Owner) => `${o.kind}:${o.id}`;
const ownedBy = (x: { boardId?: string; folderId?: string }, o: Owner) => (o.kind === 'subject' ? x.boardId === o.id : x.folderId === o.id && !x.boardId);

function TasksBlock({ owner, inside, nameOf }: { owner: Owner; inside: Owner[]; nameOf: (o: Owner) => string }) {
  const all = [owner, ...inside];
  const tasks = useLiveQuery(() => db.tasks.orderBy('createdAt').toArray(), [], []);
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const recent = Date.now() - DAY;
  const groups = all
    .map((o) => ({ o, items: tasks.filter((t) => ownedBy(t, o) && (showDone || !t.done || (t.doneAt ?? 0) > recent)) }))
    .filter((g, i) => i === 0 || g.items.length);
  const doneCount = tasks.filter((t) => t.done && all.some((o) => ownedBy(t, o))).length;

  const add = async () => {
    const title = text.trim();
    if (!title) return;
    await addTask(title, owner);
    setText('');
  };

  return (
    <div className="border-b border-rule py-4">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-hand text-[20px] leading-none text-tomato">Tasks</h4>
        {doneCount > 0 && (
          <button className="text-xs text-ink/50 underline decoration-dotted" onClick={() => setShowDone(!showDone)}>
            {showDone ? 'hide finished' : `show all finished (${doneCount})`}
          </button>
        )}
      </div>
      {groups.map(({ o, items }, i) => (
        <div key={ownerKey(o)}>
          {i > 0 && <span className="label mt-2">{nameOf(o)}</span>}
          <ul>
            {items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      ))}
      <div className="flex h-[34px] items-center gap-2">
        <span className="h-5 w-5 shrink-0 rounded-[6px] border-2 border-dashed border-ink/25" />
        <input
          className="flex-1 bg-transparent font-hand text-[19px] leading-none outline-none placeholder:text-ink/30"
          placeholder="add a task…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          onBlur={() => void add()}
        />
      </div>
    </div>
  );
}

export function TaskRow({ task: t, tag }: { task: Task; tag?: ReactNode }) {
  const toggle = () => append([{ type: 'task.done', ts: Date.now(), data: { taskId: t.id, done: !t.done } } as PendingEvent]);
  return (
    <li className="group flex h-[34px] items-center gap-2">
      <button
        onClick={() => void toggle()}
        className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition', t.done ? 'border-leaf bg-leaf text-white' : 'border-ink/40')}
        aria-label={t.done ? 'Mark not done' : 'Mark done'}
      >
        {t.done && '✓'}
      </button>
      <span className={cx('flex-1 truncate font-hand text-[19px] leading-none', t.done && 'text-ink/40 line-through decoration-tomato/70')}>{t.title}</span>
      {tag}
      <button className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-60" onClick={() => db.tasks.delete(t.id)} aria-label="Delete task">
        <X size={14} className="text-ink/40" />
      </button>
    </li>
  );
}

function NotesBlock({ owner, inside, nameOf }: { owner: Owner; inside: Owner[]; nameOf: (o: Owner) => string }) {
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), [], []);
  const [focusId, setFocusId] = useState<string | null>(null);
  const groups = [owner, ...inside].map((o) => ({ o, items: notes.filter((n) => ownedBy(n, o)) })).filter((g, i) => i === 0 || g.items.length);
  // Keep the order stable while typing (updatedAt changes on every keystroke).
  const order = useMemo(() => new Map(notes.map((n) => [n.id, n.createdAt])), [notes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-hand text-[20px] leading-none text-tomato">Notes</h4>
        <button className="btn-ghost !px-2 !py-1 !text-xs" onClick={async () => setFocusId(await addNote(owner))}>
          <Plus size={13} /> note
        </button>
      </div>
      {groups.map(({ o, items }, i) => (
        <div key={ownerKey(o)} className="space-y-2">
          {i > 0 && <span className="label mt-3">{nameOf(o)}</span>}
          {i === 0 && !items.length && (
            <p className="flex items-center gap-2 text-sm text-ink/45">
              <StickyNote size={15} /> Nothing jotted down yet.
            </p>
          )}
          {[...items]
            .sort((a, b) => (order.get(b.id) ?? b.createdAt) - (order.get(a.id) ?? a.createdAt))
            .map((n) => (
              <NoteCard key={n.id} note={n} autoFocus={focusId === n.id} />
            ))}
        </div>
      ))}
    </div>
  );
}

function NoteCard({ note, autoFocus }: { note: Note; autoFocus: boolean }) {
  return (
    <div className="sticky-note group relative p-3">
      <DraftInput
        className="w-full bg-transparent pr-6 font-display text-[15px] font-semibold outline-none placeholder:text-ink/35"
        value={note.title}
        placeholder="Title"
        autoFocus={autoFocus}
        onSave={(title) => void saveNote(note.id, { title })}
      />
      <DraftInput
        multiline
        className="mt-1 min-h-[72px] w-full resize-y bg-transparent font-hand text-[18px] leading-6 outline-none placeholder:text-ink/30"
        value={note.body}
        placeholder="write anything…"
        onSave={(body) => void saveNote(note.id, { body })}
      />
      <button
        className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 max-sm:opacity-60"
        onClick={() => {
          void db.notes.delete(note.id);
          toast({ text: 'Note deleted', action: { label: 'Undo', run: () => void db.notes.put(note) } });
        }}
        aria-label="Delete note"
      >
        <X size={14} className="text-ink/40" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */

/** A text field that keeps its own draft and saves shortly after you stop typing (and on blur). */
function DraftInput({
  value,
  onSave,
  multiline,
  autoFocus,
  ...rest
}: { value: string; onSave: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string; autoFocus?: boolean; 'aria-label'?: string }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  // Focus (and select) whenever asked to, even if the field mounted before the request came in.
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.select();
  }, [autoFocus]);
  useEffect(() => {
    if (!editing || draft === value) return;
    const t = setTimeout(() => onSave(draft), 400);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const props = {
    ...rest,
    ref,
    value: draft,
    onFocus: () => setEditing(true),
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      setEditing(false);
      if (draft !== value) onSave(draft);
    },
  };
  return multiline ? (
    <textarea {...props} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <input type="color" value={color} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer appearance-none overflow-hidden rounded-full border border-rule bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0" aria-label="Colour" />
  );
}

/** Focus minutes per subject since Monday. */
function useWeekTotals(): Map<string, number> {
  const from = weekStart(today());
  return useLiveQuery(
    async () => {
      const m = new Map<string, number>();
      await db.sessions
        .where('day')
        .aboveOrEqual(from)
        .each((s) => {
          if (s.deleted || s.phase !== 'focus' || !s.boardId) return;
          m.set(s.boardId, (m.get(s.boardId) ?? 0) + s.actualMs);
        });
      return m;
    },
    [from],
    new Map(),
  );
}

function useWide(): boolean {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Folder open/closed state is a per-device convenience, shared so a drop can open its target. */
const CLOSED_KEY = 'promodoro:folders-closed';
let closed: Set<string> = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]'));
  } catch {
    return new Set<string>();
  }
})();
const closedSubs = new Set<() => void>();

function setClosed(id: string, isClosed: boolean) {
  if (closed.has(id) === isClosed) return;
  closed = new Set(closed);
  if (isClosed) closed.add(id);
  else closed.delete(id);
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed]));
  } catch {
    /* storage unavailable */
  }
  closedSubs.forEach((f) => f());
}

function useCollapsed(id: string): [boolean, (open: boolean) => void] {
  const set = useSyncExternalStore(
    (f) => {
      closedSubs.add(f);
      return () => void closedSubs.delete(f);
    },
    () => closed,
  );
  return [!set.has(id), (open) => setClosed(id, !open)];
}
