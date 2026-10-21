/** Subjects, folders, and the tasks & notes that live in them. */
import { canMoveFolder, descendantIds } from '@/engine/folders';
import { layoutChanges, type Layout } from '@/engine/treeLayout';
import { uid } from '@/engine/time';
import type { Board, Folder, Note, Task } from '@/engine/types';
import { db } from './schema';
import { getSettings, updateSettings } from './settings';

/** What a task or note is attached to. */
export type Owner = { kind: 'subject'; id: string } | { kind: 'folder'; id: string };

export const ownerFields = (o: Owner | null) => (o?.kind === 'subject' ? { boardId: o.id } : o?.kind === 'folder' ? { folderId: o.id } : {});

export const SWATCHES = ['#EE6B6E', '#F4A261', '#E9B949', '#52B788', '#4FB0C6', '#8FB8E8', '#9B8FE8', '#D98BC4', '#A3A3A3'];

export async function addSubject(p: { name: string; color: string; folderId?: string }): Promise<string> {
  const id = uid('b');
  const order = await db.boards.count();
  await db.boards.put({ id, name: p.name, color: p.color, folderId: p.folderId, order });
  return id;
}

export async function addFolder(p: { name: string; color: string; parentId?: string }): Promise<string> {
  const id = uid('f');
  const order = await db.folders.count();
  await db.folders.put({ id, name: p.name, color: p.color, parentId: p.parentId, order });
  return id;
}

export const moveSubject = (id: string, folderId: string | undefined) => db.boards.update(id, { folderId });

export async function moveFolder(id: string, parentId: string | undefined): Promise<boolean> {
  return db.transaction('rw', db.folders, async () => {
    if (!canMoveFolder(id, parentId, await db.folders.toArray())) return false;
    await db.folders.update(id, { parentId });
    return true;
  });
}

/** Save a drag-and-drop result: where every folder and subject now sits, and in what order. */
export async function saveLayout(l: Layout): Promise<void> {
  await db.transaction('rw', db.folders, db.boards, async () => {
    const { folderPatches, subjectPatches } = layoutChanges(l, await db.folders.toArray(), await db.boards.toArray());
    for (const p of folderPatches) await db.folders.update(p.id, { parentId: p.parentId, order: p.order });
    for (const p of subjectPatches) await db.boards.update(p.id, { folderId: p.folderId, order: p.order });
  });
}

/**
 * Delete a folder.
 *  lift:    everything inside moves up one level (subfolders, subjects, tasks, notes).
 *  archive: the folder, its subfolders and their subjects are archived instead; nothing is removed.
 * Sessions are never touched either way.
 */
export async function removeFolder(id: string, mode: 'lift' | 'archive'): Promise<void> {
  await db.transaction('rw', [db.folders, db.boards, db.tasks, db.notes], async () => {
    const folders = await db.folders.toArray();
    const f = folders.find((x) => x.id === id);
    if (!f) return;
    if (mode === 'archive') {
      const ids = descendantIds(id, folders);
      await db.folders.where('id').anyOf(ids).modify({ archived: true });
      await db.boards.where('folderId').anyOf(ids).modify({ archived: true });
      return;
    }
    const up = f.parentId;
    await db.folders.where('parentId').equals(id).modify((x: Folder) => void (x.parentId = up));
    await db.boards.where('folderId').equals(id).modify((x: Board) => void (x.folderId = up));
    await db.tasks.where('folderId').equals(id).modify((x: Task) => void (x.folderId = up));
    await db.notes.where('folderId').equals(id).modify((x: Note) => void (x.folderId = up));
    await db.folders.delete(id);
  });
}

/** Unarchiving a folder brings back what archiving it put away. */
export async function setFolderArchived(id: string, archived: boolean): Promise<void> {
  await db.transaction('rw', db.folders, db.boards, async () => {
    const ids = archived ? [id] : descendantIds(id, await db.folders.toArray());
    await db.folders.where('id').anyOf(ids).modify({ archived });
    if (!archived) await db.boards.where('folderId').anyOf(ids).modify({ archived: false });
    // An archived parent hides its subfolders too, so un-archive the parent when a child comes back.
    const f = await db.folders.get(id);
    if (!archived && f?.parentId) await db.folders.update(f.parentId, { archived: false });
  });
}

/** Delete a subject. Past sessions keep their time (just without the label); its tasks & notes move to its folder. */
export async function removeSubject(id: string): Promise<void> {
  await db.transaction('rw', [db.boards, db.tasks, db.notes, db.settings], async () => {
    const b = await db.boards.get(id);
    if (!b) return;
    const to = b.folderId ? { boardId: undefined, folderId: b.folderId } : { boardId: undefined };
    await db.tasks.where('boardId').equals(id).modify(to);
    await db.notes.where('boardId').equals(id).modify(to);
    await db.boards.delete(id);
    if ((await getSettings()).boardId === id) await updateSettings({ boardId: null });
  });
}

export async function addTask(title: string, owner: Owner | null): Promise<void> {
  await db.tasks.put({ id: uid('task'), title, done: false, createdAt: Date.now(), ...ownerFields(owner) });
}

export async function addNote(owner: Owner): Promise<string> {
  const id = uid('note');
  const now = Date.now();
  await db.notes.put({ id, title: '', body: '', createdAt: now, updatedAt: now, order: now, ...ownerFields(owner) });
  return id;
}

export const saveNote = (id: string, patch: Partial<Pick<Note, 'title' | 'body'>>) => db.notes.update(id, { ...patch, updatedAt: Date.now() });
