import { describe, expect, it } from 'vitest';
import { folderPath, folderTree } from './folder-tree';
import type { Folder } from './types';

const f = (id: number, parentId: number | null, name: string): Folder => ({ id, parentId, name, createdAt: 0 });

describe('folderTree', () => {
  it('lists depth-first, children by name under their parent', () => {
    const rows = folderTree([f(1, null, 'work'), f(2, 1, 'b'), f(3, 1, 'A'), f(4, null, 'Home'), f(5, 3, 'deep')]);
    expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.folder.name}`)).toEqual(['Home', 'work', '  A', '    deep', '  b']);
  });

  it('shows a folder whose parent is missing at the top', () => {
    expect(folderTree([f(2, 99, 'Orphan')]).map((r) => [r.folder.name, r.depth])).toEqual([['Orphan', 0]]);
  });
});

describe('folderPath', () => {
  it('names the folders a folder is in', () => {
    const all = [f(1, null, 'Work'), f(2, 1, 'Archive'), f(3, 2, '2025')];
    expect(folderPath(all, 3)).toBe('Work / Archive / 2025');
    expect(folderPath(all, null)).toBe('');
  });
});
