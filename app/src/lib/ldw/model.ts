// What a .ldw drawing is: pen and highlighter strokes on a page, back to
// front. A stroke is a list of points with a colour, a width and an
// opacity; it's drawn as a smooth curve through them (geometry.ts). Strokes are
// replaced, never changed in place, so undo keeps the old drawing (as .lin does).

export const MIN_SIDE = 200;
export const MAX_SIDE = 8000;
export const MIN_WIDTH = 0.5;
export const MAX_WIDTH = 64;

export type StrokeKind = 'pen' | 'hl';

export interface Stroke {
  id: number;
  t: StrokeKind;
  /** `#rrggbb`. */
  c: string;
  /** Width in page pixels. */
  w: number;
  /** Opacity, 1–100. */
  o: number;
  /** A closed path (a rectangle or an ellipse drawn with the shape tools). */
  z: boolean;
  /** x, y, x, y, … in page pixels, a tenth at most. At least one point. */
  pts: number[];
}

export interface Drawing {
  ldw: 1;
  w: number;
  h: number;
  /** `#rrggbb`, or `none` for a transparent page. */
  bg: string;
  next: number;
  items: Stroke[];
}

export const DEFAULT_PAGE: [number, number] = [1600, 1000];

export function blankDrawing(w = DEFAULT_PAGE[0], h = DEFAULT_PAGE[1]): Drawing {
  return { ldw: 1, w, h, bg: '#ffffff', next: 1, items: [] };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** `#rgb` or `#rrggbb`, any case, as lowercase `#rrggbb`; null if it isn't one. */
export function parseRgb(s: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
}

/** The pen colours offered first: ink, white, then the nine .lin colours. */
export const INKS: readonly string[] = [
  '#111111',
  '#ffffff',
  '#e5484d',
  '#f76b15',
  '#f7c948',
  '#46a758',
  '#12a594',
  '#3e63dd',
  '#8e4ec6',
  '#d6409f',
  '#30343b',
];

export const WIDTHS: readonly number[] = [1, 2, 4, 8, 16, 32];

/** The highlighter starts wide, yellow and see-through. */
export const HIGHLIGHTER = { color: '#f7c948', width: 16, opacity: 35 };
