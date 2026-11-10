// A stand-in backend for working on the UI in a plain browser: preferences in
// memory (lost on reload), checked roughly the way linear-store checks them,
// and the menu bar imitated from the keyboard. The app itself never uses this
// (see api.ts).

import type { Backend } from './api';
import { menuIdFor } from './menu-ids';
import type { Prefs } from './types';

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

export function mockBackend(): Backend {
  let prefs = clone(DEFAULT_PREFS);
  const mac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
  return {
    isApp: false,
    getPrefs: async () => clone(prefs),
    setPref: async (key, value) => {
      prefs = setIn(prefs, key, value);
      return clone(prefs);
    },
    resetPref: async (key) => {
      prefs = setIn(prefs, key, clone(getIn(DEFAULT_PREFS, key)));
      return clone(prefs);
    },
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
  };
}
