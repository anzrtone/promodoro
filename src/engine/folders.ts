/**
 * Folder tree rules. Pure functions so they're easy to test.
 * Two levels at most: top-level folders, and subfolders inside them. Subjects sit in either (or loose).
 */
import type { Board, Folder } from './types';

export const MAX_DEPTH = 2;

/** 1 for a top-level folder, 2 for a subfolder. */
export function depthOf(id: string, folders: Folder[]): number {
  const f = folders.find((x) => x.id === id);
  if (!f) return 0;
  return f.parentId && folders.some((x) => x.id === f.parentId) ? 2 : 1;
}

export function childFolders(parentId: string | undefined, folders: Folder[]): Folder[] {
  return folders
    .filter((f) => (parentId ? f.parentId === parentId : !f.parentId || !folders.some((p) => p.id === f.parentId)))
    .sort((a, b) => a.order - b.order);
}

/** Can `id` be moved under `parentId` (undefined = top level) without going three deep? */
export function canMoveFolder(id: string, parentId: string | undefined, folders: Folder[]): boolean {
  if (!parentId) return true;
  if (parentId === id) return false;
  // The target must be a top-level folder, and the folder being moved can't bring subfolders along.
  if (depthOf(parentId, folders) !== 1) return false;
  return !folders.some((f) => f.parentId === id);
}

/** Every folder id inside `id`, including itself. */
export function descendantIds(id: string, folders: Folder[]): string[] {
  return [id, ...folders.filter((f) => f.parentId === id).map((f) => f.id)];
}

/** "School / Semester 1" */
export function folderPath(id: string | undefined, folders: Folder[]): string {
  const f = id ? folders.find((x) => x.id === id) : undefined;
  if (!f) return '';
  const parent = f.parentId ? folders.find((x) => x.id === f.parentId) : undefined;
  return parent ? `${parent.name} / ${f.name}` : f.name;
}

/** Folders in display order (each folder followed by its subfolders), for pickers. */
export function flattenFolders(folders: Folder[]): Array<{ folder: Folder; depth: 1 | 2 }> {
  const out: Array<{ folder: Folder; depth: 1 | 2 }> = [];
  for (const top of childFolders(undefined, folders)) {
    out.push({ folder: top, depth: 1 });
    for (const sub of childFolders(top.id, folders)) out.push({ folder: sub, depth: 2 });
  }
  return out;
}

/**
 * Subjects grouped for the Focus screen: loose ones first, then one group per folder that has any,
 * labelled with the folder's path.
 */
export function groupSubjects(boards: Board[], folders: Folder[]): Array<{ label: string | null; boards: Board[] }> {
  const known = new Set(folders.map((f) => f.id));
  const groups: Array<{ label: string | null; boards: Board[] }> = [];
  const loose = boards.filter((b) => !b.folderId || !known.has(b.folderId));
  if (loose.length) groups.push({ label: null, boards: loose });
  for (const { folder } of flattenFolders(folders)) {
    const inside = boards.filter((b) => b.folderId === folder.id);
    if (inside.length) groups.push({ label: folderPath(folder.id, folders), boards: inside });
  }
  return groups;
}
