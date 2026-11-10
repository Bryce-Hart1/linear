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
