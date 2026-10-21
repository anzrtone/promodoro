import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { addFolder, addSubject, saveLayout } from '@/db/folders';
import { buildLayout, canPlaceFolder, containerOf, layoutChanges, LOOSE, moveItem, ROOT } from '@/engine/treeLayout';
import type { Board, Folder } from '@/engine/types';

const F = (id: string, order: number, parentId?: string): Folder => ({ id, name: id, color: '#000', parentId, order });
const B = (id: string, order: number, folderId?: string): Board => ({ id, name: id, color: '#000', folderId, order });

const folders = [F('school', 0), F('sem1', 0, 'school'), F('work', 1)];
const boards = [B('math', 1, 'sem1'), B('physics', 0, 'sem1'), B('code', 0, 'work'), B('read', 0)];

describe('tree layout', () => {
  it('builds ordered lists per box', () => {
    const l = buildLayout(folders, boards);
    expect(l.folders).toEqual({ [ROOT]: ['school', 'work'], school: ['sem1'], work: [] });
    expect(l.subjects.sem1).toEqual(['physics', 'math']);
    expect(l.subjects[LOOSE]).toEqual(['read']);
  });

  it('reorders inside one box like arrayMove', () => {
    const l = moveItem(buildLayout(folders, boards), 'subject', 'math', 'sem1', 0);
    expect(l.subjects.sem1).toEqual(['math', 'physics']);
  });

  it('moves between boxes at a position', () => {
    const l = moveItem(buildLayout(folders, boards), 'subject', 'read', 'sem1', 1);
    expect(l.subjects.sem1).toEqual(['physics', 'read', 'math']);
    expect(l.subjects[LOOSE]).toEqual([]);
    expect(containerOf(l, 'subject', 'read')).toBe('sem1');
  });

  it('keeps folders two levels deep', () => {
    const l = buildLayout(folders, boards);
    expect(canPlaceFolder(l, 'work', 'school')).toBe(true);
    expect(canPlaceFolder(l, 'school', 'work')).toBe(false); // has a subfolder
    expect(canPlaceFolder(l, 'work', 'sem1')).toBe(false); // not a top-level folder
    expect(canPlaceFolder(l, 'work', 'work')).toBe(false);
    expect(canPlaceFolder(l, 'sem1', ROOT)).toBe(true);
  });

  it('only writes what changed', () => {
    const l = moveItem(buildLayout(folders, boards), 'subject', 'math', 'sem1', 0);
    const { folderPatches, subjectPatches } = layoutChanges(l, folders, boards);
    expect(folderPatches).toEqual([]);
    expect(subjectPatches).toEqual([
      { id: 'math', folderId: 'sem1', order: 0 },
      { id: 'physics', folderId: 'sem1', order: 1 },
    ]);
  });
});

describe('saving a layout', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('persists order and parents, and reads back the same', async () => {
    const a = await addFolder({ name: 'A', color: '#000' });
    const b = await addFolder({ name: 'B', color: '#000' });
    const x = await addSubject({ name: 'X', color: '#000', folderId: a });
    const y = await addSubject({ name: 'Y', color: '#000', folderId: a });
    let l = buildLayout(await db.folders.toArray(), await db.boards.toArray());
    l = moveItem(l, 'subject', y, a, 0);
    l = moveItem(l, 'folder', b, a, 0);
    await saveLayout(l);
    const back = buildLayout(await db.folders.toArray(), await db.boards.toArray());
    expect(back.subjects[a]).toEqual([y, x]);
    expect(back.folders[ROOT]).toEqual([a]);
    expect(back.folders[a]).toEqual([b]);
  });
});
