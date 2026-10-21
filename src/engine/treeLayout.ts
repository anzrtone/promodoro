/**
 * The Subjects tree as ordered lists, for drag-and-drop.
 *  folders:  'root' → top-level folder ids; <topId> → its subfolder ids
 *  subjects: 'loose' → loose subject ids;   <folderId> → that folder's subject ids
 * While dragging, the screen works on a draft copy of this; on drop the draft is saved.
 */
import { childFolders } from './folders';
import type { Board, Folder } from './types';

export const ROOT = 'root';
export const LOOSE = 'loose';

export interface Layout {
  folders: Record<string, string[]>;
  subjects: Record<string, string[]>;
}

export type Kind = 'folder' | 'subject';

export function buildLayout(folders: Folder[], boards: Board[]): Layout {
  const out: Layout = { folders: { [ROOT]: [] }, subjects: { [LOOSE]: [] } };
  for (const top of childFolders(undefined, folders)) {
    out.folders[ROOT].push(top.id);
    out.folders[top.id] = childFolders(top.id, folders).map((f) => f.id);
  }
  const known = new Set(folders.map((f) => f.id));
  for (const f of folders) out.subjects[f.id] = [];
  for (const b of [...boards].sort((x, y) => x.order - y.order)) out.subjects[b.folderId && known.has(b.folderId) ? b.folderId : LOOSE].push(b.id);
  return out;
}

const lists = (l: Layout, kind: Kind) => (kind === 'folder' ? l.folders : l.subjects);

export function containerOf(l: Layout, kind: Kind, id: string): string | undefined {
  return Object.entries(lists(l, kind)).find(([, ids]) => ids.includes(id))?.[0];
}

/** May this folder go into `container` (ROOT or a top-level folder) without going three deep? */
export function canPlaceFolder(l: Layout, id: string, container: string): boolean {
  if (container === ROOT) return true;
  if (container === id || !l.folders[ROOT].includes(container)) return false;
  return !(l.folders[id]?.length ?? 0);
}

/** Move an item to `index` in `container` (clamped). Returns a new layout; the input is untouched. */
export function moveItem(l: Layout, kind: Kind, id: string, container: string, index: number): Layout {
  const src = lists(l, kind);
  const next: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(src)) next[k] = ids.filter((x) => x !== id);
  const target = next[container] ?? [];
  target.splice(Math.max(0, Math.min(index, target.length)), 0, id);
  next[container] = target;
  // A folder that just became top-level needs its own (empty) subfolder list.
  if (kind === 'folder' && container === ROOT && !next[id]) next[id] = [];
  return kind === 'folder' ? { ...l, folders: next } : { ...l, subjects: next };
}

/** The writes needed to make the stored tree match `l`: only rows whose parent or order changed. */
export function layoutChanges(l: Layout, folders: Folder[], boards: Board[]) {
  const folderPatches: Array<{ id: string; parentId: string | undefined; order: number }> = [];
  const subjectPatches: Array<{ id: string; folderId: string | undefined; order: number }> = [];
  const byFolder = new Map(folders.map((f) => [f.id, f]));
  const byBoard = new Map(boards.map((b) => [b.id, b]));
  for (const [k, ids] of Object.entries(l.folders)) {
    ids.forEach((id, order) => {
      const parentId = k === ROOT ? undefined : k;
      const f = byFolder.get(id);
      if (f && (f.parentId !== parentId || f.order !== order)) folderPatches.push({ id, parentId, order });
    });
  }
  for (const [k, ids] of Object.entries(l.subjects)) {
    ids.forEach((id, order) => {
      const folderId = k === LOOSE ? undefined : k;
      const b = byBoard.get(id);
      if (b && (b.folderId !== folderId || b.order !== order)) subjectPatches.push({ id, folderId, order });
    });
  }
  return { folderPatches, subjectPatches };
}
