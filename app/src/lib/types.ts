// Shapes of what crosses between the page and Rust. These mirror the Rust
// types field for field (serde camelCase); linear-store's prefs.rs is the source of truth.

export type Kind = 'lin' | 'lpx' | 'ldw';
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  theme: Theme;
  library: { view: 'grid' | 'list'; sort: 'updated' | 'created' | 'name'; kind: Kind | null };
  ui: { sidebarWidth: number; sidebarOpen: boolean; inspectorOpen: boolean; showHints: boolean };
  window: { bounds: { x: number; y: number; w: number; h: number } | null };
  versions: { keep: number };
  draft: { delayMs: number };
  lin: { openIn: 'view' | 'edit'; playOnOpen: boolean; grid: boolean };
  lpx: { defaultSize: [number, number]; defaultPalette: string; showGrid: boolean; exportScale: number };
  ldw: { page: [number, number]; pen: { color: string; width: number; opacity: number }; smoothing: number };
  export: { lastDir: string | null };
}

/** A document as the library lists it (linear-store's docs.rs `DocMeta`). */
export interface DocMeta {
  id: number;
  folderId: number | null;
  name: string;
  kind: Kind;
  hasThumbnail: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  trashedAt: number | null;
}

export interface Folder {
  id: number;
  parentId: number | null;
  name: string;
  createdAt: number;
}

export interface VersionMeta {
  id: number;
  bytes: number;
  createdAt: number;
}

export interface Draft {
  baseVersionId: number;
  content: string;
  updatedAt: number;
}

export interface Opened {
  meta: DocMeta;
  version: VersionMeta;
  content: string;
  draft: Draft | null;
}

export type Saved = { status: 'saved'; meta: DocMeta; version: VersionMeta } | { status: 'unchanged' };

export type View = 'all' | 'recent' | 'pinned' | 'trash' | 'folder';
export type Sort = Prefs['library']['sort'];

export interface Query {
  view: View;
  /** For `folder`: which one; null is the documents in no folder. */
  folder?: number | null;
  kind?: Kind | null;
  search?: string;
  sort?: Sort;
}

export interface NewDoc {
  name: string;
  kind: Kind;
  folder: number | null;
  content: string;
  thumbnail?: number[] | null;
}

/** A pixel-art palette the user saved: its colours after transparent. */
export interface Palette {
  id: number;
  name: string;
  colours: string[];
  createdAt: number;
}

/** A file read for importing, not yet checked. */
export interface Import {
  name: string;
  kind: Kind;
  text: string;
}

/** How a command fails (src-tauri/src/error.rs). */
export interface CmdError {
  code: string;
  message: string;
}

/** Something to show for any thrown value: a command's message, an Error's, or the value itself. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return String(e);
}
