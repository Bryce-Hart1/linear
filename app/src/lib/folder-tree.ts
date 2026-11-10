// The folder list as the sidebar shows it: depth-first, each folder's
// children right under it by name, with how deep each one is.

import type { Folder } from './types';

export interface TreeRow {
  folder: Folder;
  depth: number;
}

export function folderTree(folders: readonly Folder[]): TreeRow[] {
  const byParent = new Map<number | null, Folder[]>();
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    // A folder whose parent isn't listed shows at the top rather than vanishing.
    const parent = f.parentId !== null && ids.has(f.parentId) ? f.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), f]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id);
  const out: TreeRow[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    for (const f of byParent.get(parent) ?? []) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The folder's name with the names of the folders it's in: "Work / Archive". */
export function folderPath(folders: readonly Folder[], id: number | null): string {
  const parts: string[] = [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (let f = id === null ? undefined : byId.get(id); f && parts.length < 64; f = f.parentId === null ? undefined : byId.get(f.parentId)) {
    parts.unshift(f.name);
  }
  return parts.join(' / ');
}
