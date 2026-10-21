import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, PromodoroDB } from '@/db/schema';
import { addFolder, addNote, addSubject, addTask, moveFolder, removeFolder, removeSubject, setFolderArchived } from '@/db/folders';
import { exportJSON, importJSON } from '@/db/backup';
import { canMoveFolder, depthOf, folderPath, groupSubjects } from '@/engine/folders';
import type { Board, Folder } from '@/engine/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const F = (id: string, parentId?: string): Folder => ({ id, name: id, color: '#000', parentId, order: 0 });

describe('folder rules', () => {
  const folders = [F('school'), F('sem1', 'school'), F('work')];

  it('knows depth and paths', () => {
    expect(depthOf('school', folders)).toBe(1);
    expect(depthOf('sem1', folders)).toBe(2);
    expect(folderPath('sem1', folders)).toBe('school / sem1');
  });

  it('never allows a third level', () => {
    expect(canMoveFolder('work', 'school', folders)).toBe(true);
    expect(canMoveFolder('work', 'sem1', folders)).toBe(false); // into a subfolder
    expect(canMoveFolder('school', 'work', folders)).toBe(false); // brings its subfolder along
    expect(canMoveFolder('sem1', undefined, folders)).toBe(true);
    expect(canMoveFolder('work', 'work', folders)).toBe(false);
  });

  it('groups subjects for the Focus screen', () => {
    const b = (id: string, folderId?: string): Board => ({ id, name: id, color: '#000', folderId, order: 0 });
    const g = groupSubjects([b('loose'), b('math', 'sem1'), b('code', 'work'), b('orphan', 'gone')], folders);
    expect(g.map((x) => [x.label, x.boards.map((y) => y.id)])).toEqual([
      [null, ['loose', 'orphan']],
      ['school / sem1', ['math']],
      ['work', ['code']],
    ]);
  });
});

describe('folder storage', () => {
  it('deleting a folder moves its contents up a level', async () => {
    const school = await addFolder({ name: 'School', color: '#000' });
    const sem = await addFolder({ name: 'Sem 1', color: '#000', parentId: school });
    const math = await addSubject({ name: 'Math', color: '#000', folderId: sem });
    await addTask('read ch 3', { kind: 'folder', id: sem });
    await addNote({ kind: 'folder', id: sem });

    await removeFolder(sem, 'lift');
    expect(await db.folders.get(sem)).toBeUndefined();
    expect((await db.boards.get(math))?.folderId).toBe(school);
    expect((await db.tasks.toArray())[0].folderId).toBe(school);
    expect((await db.notes.toArray())[0].folderId).toBe(school);

    await removeFolder(school, 'lift');
    expect((await db.boards.get(math))?.folderId).toBeUndefined();
  });

  it('archiving a folder archives what is inside, and unarchiving brings it back', async () => {
    const school = await addFolder({ name: 'School', color: '#000' });
    const sem = await addFolder({ name: 'Sem 1', color: '#000', parentId: school });
    const math = await addSubject({ name: 'Math', color: '#000', folderId: sem });
    await removeFolder(school, 'archive');
    expect((await db.folders.get(sem))?.archived).toBe(true);
    expect((await db.boards.get(math))?.archived).toBe(true);
    await setFolderArchived(school, false);
    expect((await db.folders.get(sem))?.archived).toBe(false);
    expect((await db.boards.get(math))?.archived).toBe(false);
  });

  it('refuses moves that would go three deep', async () => {
    const a = await addFolder({ name: 'A', color: '#000' });
    const b = await addFolder({ name: 'B', color: '#000' });
    const sub = await addFolder({ name: 'Sub', color: '#000', parentId: b });
    expect(await moveFolder(a, sub)).toBe(false);
    expect(await moveFolder(b, a)).toBe(false);
    expect(await moveFolder(sub, a)).toBe(true);
  });

  it("deleting a subject hands its tasks to its folder", async () => {
    const f = await addFolder({ name: 'Projects', color: '#000' });
    const code = await addSubject({ name: 'Coding', color: '#000', folderId: f });
    await addTask('fix bug', { kind: 'subject', id: code });
    await removeSubject(code);
    const [t] = await db.tasks.toArray();
    expect(t.boardId).toBeUndefined();
    expect(t.folderId).toBe(f);
  });
});

describe('backups and upgrades', () => {
  it('backs up and restores folders and notes', async () => {
    const f = await addFolder({ name: 'School', color: '#000' });
    await addNote({ kind: 'folder', id: f });
    const json = await exportJSON();
    await Promise.all(db.tables.map((t) => t.clear()));
    await importJSON(json, 'replace');
    expect(await db.folders.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
  });

  it('restores an older backup that has no folders or notes', async () => {
    const old = { format: 'promodoro-backup', version: 1, exportedAt: '', events: [], sessions: [], presets: [], boards: [{ id: 'b1', name: 'Study', color: '#000', order: 0 }], tasks: [], stickers: [], settings: [] };
    await importJSON(JSON.stringify(old), 'replace');
    expect(await db.boards.count()).toBe(1);
    expect(await db.folders.count()).toBe(0);
  });

  it('upgrades a v1 database; existing subjects become loose', async () => {
    const name = 'upgrade-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({ boards: 'id, order', tasks: 'id, createdAt, boardId' });
    await v1.table('boards').put({ id: 'b1', name: 'Study', color: '#000', order: 0 });
    v1.close();
    const v2 = new PromodoroDB(name);
    expect((await v2.boards.get('b1'))?.folderId).toBeUndefined();
    expect(await v2.folders.count()).toBe(0);
    await v2.folders.put({ id: 'f', name: 'F', color: '#000', order: 0 });
    expect(await v2.boards.where('folderId').equals('f').count()).toBe(0);
    v2.close();
  });
});
