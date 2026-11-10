// A stand-in backend for working on the UI in a plain browser: preferences
// and the library in memory (lost on reload), checked roughly the way
// linear-store checks them (mock-library.ts), and the menu bar imitated from
// the keyboard. The app itself never uses this (see api.ts).

import type { Backend } from './api';
import { menuIdFor } from './menu-ids';
import { thumbnail as linThumbnail } from './lin/draw';
import { parseLin } from './lin/format';
import { MockLibrary, importFromFile } from './mock-library';
import { thumbnailLpx } from './lpx/render';
import { parseLpx } from './lpx/format';
import type { Import, Palette, Prefs } from './types';

/** The same defaults as linear-store's `Prefs::default()`. */
export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  library: { view: 'grid', sort: 'updated', kind: null },
  ui: { sidebarWidth: 240, sidebarOpen: true, inspectorOpen: true, showHints: true },
  window: { bounds: null },
  versions: { keep: 50 },
  draft: { delayMs: 2000 },
  lin: { openIn: 'view', playOnOpen: true, grid: false },
  lpx: { defaultSize: [32, 32], defaultPalette: 'linear16', showGrid: true, exportScale: 8 },
  ldw: { page: [1600, 1000], pen: { color: '#111111', width: 3, opacity: 100 }, smoothing: 0.5 },
  export: { lastDir: null },
};

const ENUMS: Record<string, readonly unknown[]> = {
  theme: ['system', 'light', 'dark'],
  'library.view': ['grid', 'list'],
  'library.sort': ['updated', 'created', 'name'],
  'library.kind': ['lin', 'lpx', 'ldw', null],
  'lin.openIn': ['view', 'edit'],
};

/** The ranges linear-store's `Prefs::validate` enforces. */
const RANGES: Record<string, [number, number]> = {
  'ui.sidebarWidth': [160, 480],
  'versions.keep': [1, 1000],
  'draft.delayMs': [250, 60_000],
  'lpx.defaultSize': [1, 512],
  'lpx.exportScale': [1, 32],
  'ldw.page': [200, 8000],
  'ldw.pen.width': [0.5, 64],
  'ldw.pen.opacity': [1, 100],
  'ldw.smoothing': [0, 1],
};

const clone = <T>(v: T): T => structuredClone(v);

function checkRanges(prefs: Prefs) {
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const v = getIn(prefs, key);
    const values = Array.isArray(v) ? v : [v];
    if (Array.isArray(v) && v.length !== (getIn(DEFAULT_PREFS, key) as unknown[]).length) {
      throw { code: 'invalid', message: `${key} must have ${(getIn(DEFAULT_PREFS, key) as unknown[]).length} values` };
    }
    for (const n of values) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) {
        throw { code: 'invalid', message: `${key} must be ${lo}–${hi}, not ${n}` };
      }
    }
  }
}

/** Sets `key` in `prefs` like linear-store does: only where a default exists, with a value of the same shape. */
export function setIn(prefs: Prefs, key: string, value: unknown): Prefs {
  const path = key.split('.');
  const next = clone(prefs) as unknown as Record<string, unknown>;
  let node: Record<string, unknown> = next;
  for (const [i, part] of path.entries()) {
    if (!node || typeof node !== 'object' || !(part in node)) throw { code: 'invalid', message: `no preference called "${key}"` };
    if (i === path.length - 1) {
      const old = node[part];
      const sameShape =
        old === null || value === null
          ? key in ENUMS || key === 'window.bounds' || key === 'export.lastDir'
          : typeof old === typeof value && Array.isArray(old) === Array.isArray(value);
      if (!sameShape || (key in ENUMS && !ENUMS[key].includes(value))) {
        throw { code: 'invalid', message: `${key}: ${JSON.stringify(value)} isn't allowed` };
      }
      node[part] = clone(value);
    } else {
      node = node[part] as Record<string, unknown>;
    }
  }
  checkRanges(next as unknown as Prefs);
  return next as unknown as Prefs;
}

function getIn(prefs: Prefs, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], prefs);
}

/** Runs a mock call the way `invoke` would: async, and failing with a command error. */
function call<T>(f: () => T): Promise<T> {
  try {
    return Promise.resolve(structuredClone(f()));
  } catch (e) {
    return Promise.reject(e);
  }
}

export function mockBackend(seed = true): Backend {
  let prefs = clone(DEFAULT_PREFS);
  const lib = new MockLibrary(seed);
  let palettes: Palette[] = [];
  let paletteId = 1;
  // Thumbnails as blob: URLs, by document id. The samples' are drawn once, before the first listing.
  const thumbs = new Map<number, string>();
  const keepThumb = (id: number, bytes: Uint8Array | number[] | null | undefined) => {
    // Never revoked: a duplicate shares its original's URL, and the mock is short-lived.
    thumbs.delete(id);
    if (bytes) thumbs.set(id, URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })));
    lib.setHasThumbnail(id, !!bytes);
  };
  const drawn: Promise<unknown> =
    typeof document === 'undefined'
      ? Promise.resolve()
      : Promise.all(
          lib
            .everything()
            .filter((d) => d.meta.kind !== 'ldw')
            .map(async (d) =>
              keepThumb(
                d.meta.id,
                await (d.meta.kind === 'lin' ? linThumbnail(parseLin(d.content), 480) : thumbnailLpx(parseLpx(d.content), 480)).catch(() => null),
              ),
            ),
        );
  // Files picked in the browser, by the fake path pickImports hands out.
  const picked = new Map<string, File>();
  const mac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
  return {
    isApp: false,
    getPrefs: async () => clone(prefs),
    setPref: async (key, value) => {
      prefs = setIn(prefs, key, value);
      lib.keep = prefs.versions.keep;
      return clone(prefs);
    },
    resetPref: async (key) => {
      prefs = setIn(prefs, key, clone(getIn(DEFAULT_PREFS, key)));
      lib.keep = prefs.versions.keep;
      return clone(prefs);
    },

    listDocuments: async (q) => (await drawn, call(() => lib.listDocuments(q))),
    listFolders: () => call(() => lib.listFolders()),
    createFolder: (parent, name) => call(() => lib.createFolder(parent, name)),
    renameFolder: (id, name) => call(() => lib.renameFolder(id, name)),
    moveFolder: (id, parent) => call(() => lib.moveFolder(id, parent)),
    deleteFolder: (id) => call(() => lib.deleteFolder(id)),

    createDocument: (doc) =>
      call(() => {
        const made = lib.createDocument(doc);
        if (doc.thumbnail) keepThumb(made.id, doc.thumbnail);
        return { ...made, hasThumbnail: !!doc.thumbnail };
      }),
    openDocument: (id) => call(() => lib.openDocument(id)),
    saveDocument: (id, content, thumbnail) =>
      call(() => {
        const r = lib.saveDocument(id, content);
        if (r.status === 'saved') {
          keepThumb(id, thumbnail);
          r.meta.hasThumbnail = !!thumbnail;
        }
        return r;
      }),
    documentContent: (id) => call(() => lib.documentContent(id)),
    renameDocument: (id, name) => call(() => lib.renameDocument(id, name)),
    moveDocument: (id, folder) => call(() => lib.moveDocument(id, folder)),
    duplicateDocument: (id) =>
      call(() => {
        const copy = lib.duplicateDocument(id);
        if (thumbs.has(id)) {
          thumbs.set(copy.id, thumbs.get(id)!);
          lib.setHasThumbnail(copy.id, true);
          copy.hasThumbnail = true;
        }
        return copy;
      }),
    setPinned: (id, pinned) => call(() => lib.setPinned(id, pinned)),
    trashDocument: (id) => call(() => lib.trashDocument(id)),
    restoreDocument: (id) => call(() => lib.restoreDocument(id)),
    deleteDocument: (id) => call(() => lib.deleteDocument(id)),
    emptyTrash: () => call(() => lib.emptyTrash()),

    listVersions: (id) => call(() => lib.listVersions(id)),
    readVersion: (v) => call(() => lib.readVersion(v)),
    restoreVersion: (v) => call(() => lib.restoreVersion(v)),
    putDraft: (id, base, content) => call(() => lib.putDraft(id, base, content)),
    discardDraft: (id) => call(() => lib.discardDraft(id)),

    listPalettes: async () => structuredClone(palettes),
    savePalette: async (name, colours) => {
      if (!name.trim()) throw { code: 'invalid', message: 'a palette needs a name' };
      const p: Palette = { id: paletteId++, name: name.trim(), colours: [...colours], createdAt: Date.now() };
      palettes = [...palettes, p].sort((a, b) => a.name.localeCompare(b.name));
      return structuredClone(p);
    },
    deletePalette: async (id) => {
      palettes = palettes.filter((p) => p.id !== id);
    },

    pickImports: () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.lin,.lpx,.ldw';
        input.onchange = () => {
          const paths = [...(input.files ?? [])].map((f) => {
            const path = `mock:/${picked.size}/${f.name}`;
            picked.set(path, f);
            return path;
          });
          resolve(paths.length ? paths : null);
        };
        input.oncancel = () => resolve(null);
        input.click();
      }),
    readImport: async (path): Promise<Import> => {
      const file = picked.get(path);
      if (!file) throw { code: 'invalid', message: `${path}: not found` };
      return importFromFile(file);
    },
    pickSavePath: async (name) => name.split('/').pop() ?? name,
    writeExport: async (path, bytes) => {
      // A browser can't write a path; download the file instead.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart]));
      a.download = path;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    thumbUrl: (doc) => (doc.hasThumbnail ? (thumbs.get(doc.id) ?? null) : null),

    setWindowTheme: async () => {},
    onMenu: async (cb) => {
      // The app's menu bar takes these keys before the page sees them; here the page takes them first.
      const onKey = (e: KeyboardEvent) => {
        const id = menuIdFor(e, mac);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        cb(id);
      };
      window.addEventListener('keydown', onKey, true);
      return () => window.removeEventListener('keydown', onKey, true);
    },
    onDragDrop: async () => () => {},
  };
}
