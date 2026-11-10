// What a .lpx image is: a small canvas of pixels in layers, each pixel an
// index into one palette. Index 0 is always transparent. Layers run bottom
// to top. Unlike a .lin, an image is changed in place (a 512 × 512 layer is
// too big to copy for every stroke); history.ts keeps what each change
// overwrote so it can be undone.

export const MAX_SIDE = 512;
export const MAX_LAYERS = 16;
export const MAX_COLOURS = 256;
export const MAX_NAME = 40;
export const TRANSPARENT = '#00000000';

export interface Layer {
  id: number;
  name: string;
  show: boolean;
  lock: boolean;
  /** Opacity, 0–100. */
  op: number;
  /** One palette index per pixel, row by row: w × h of them. */
  px: Uint8Array;
}

export interface Pix {
  lpx: 1;
  w: number;
  h: number;
  /** The id the next new layer gets. */
  next: number;
  /** `#rrggbbaa`; entry 0 is always transparent. */
  pal: string[];
  /** Bottom to top. */
  layers: Layer[];
}

export function blankLayer(id: number, w: number, h: number, name = `Layer ${id}`): Layer {
  return { id, name, show: true, lock: false, op: 100, px: new Uint8Array(w * h) };
}

/** A new image: one empty layer called Background, with `colours` after the transparent entry. */
export function blankPix(w: number, h: number, colours: readonly string[]): Pix {
  return { lpx: 1, w, h, next: 2, pal: [TRANSPARENT, ...colours.map(normalHex)], layers: [blankLayer(1, w, h, 'Background')] };
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa`, any case, as lowercase `#rrggbbaa`; null if it isn't one. */
export function parseHex(s: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length === 6) h += 'ff';
  return `#${h}`;
}

function normalHex(s: string): string {
  const h = parseHex(s);
  if (!h) throw new Error(`not a colour: ${s}`);
  return h;
}

/** [r, g, b, a] of a `#rrggbbaa`. */
export function rgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16) >>> 0;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

export function layerById(pix: Pix, id: number): Layer | undefined {
  return pix.layers.find((l) => l.id === id);
}

export interface Preset {
  id: string;
  name: string;
  colours: readonly string[];
}

/** The palettes linear comes with. A palette here is its colours after transparent. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'linear16',
    name: 'linear 16',
    colours: [
      '#000000', '#ffffff', '#6b6b6b', '#b5b5b5',
      '#e5484d', '#f76b15', '#f7c948', '#46a758',
      '#12a594', '#3e63dd', '#8e4ec6', '#d6409f',
      '#30343b', '#8b5a2b', '#f2c6a0', '#2a0047',
    ],
  },
  { id: 'grey8', name: 'Greyscale', colours: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff'] },
  { id: 'onebit', name: '1-bit', colours: ['#000000', '#ffffff'] },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
