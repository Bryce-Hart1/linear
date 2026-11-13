// Turning palette indices into colours: one layer onto a canvas while
// editing, every visible layer flattened for export and thumbnails, and the
// colour on top at a pixel for the eyedropper.

import { GRID_INK, PAPER, type ExportLook } from '../export-look';
import { rgba, type Pix } from './model';
import type { Rect } from './raster';

/** The palette as RGBA bytes, four per colour. */
export function paletteRGBA(pal: readonly string[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(256 * 4);
  pal.forEach((c, i) => out.set(rgba(c), i * 4));
  return out;
}

/** Writes a layer's colours into `out` (RGBA, the canvas's size), all of it or just `rect`. */
export function paintLayer(px: Uint8Array, w: number, h: number, colours: Uint8ClampedArray, out: Uint8ClampedArray, rect?: Rect) {
  const r = rect ?? { x: 0, y: 0, w, h };
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = y * w + x;
      const c = px[i] * 4;
      out[i * 4] = colours[c];
      out[i * 4 + 1] = colours[c + 1];
      out[i * 4 + 2] = colours[c + 2];
      out[i * 4 + 3] = colours[c + 3];
    }
  }
}

/** Every visible layer, bottom to top, with its opacity, as straight RGBA. */
export function flatten(pix: Pix): Uint8ClampedArray<ArrayBuffer> {
  const { w, h } = pix;
  const colours = paletteRGBA(pix.pal);
  const out = new Uint8ClampedArray(w * h * 4);
  for (const layer of pix.layers) {
    if (!layer.show || layer.op === 0) continue;
    const op = layer.op / 100;
    for (let i = 0; i < w * h; i++) {
      const c = layer.px[i] * 4;
      const sa = (colours[c + 3] / 255) * op;
      if (sa === 0) continue;
      const da = out[i * 4 + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) out[i * 4 + k] = (colours[c + k] * sa + out[i * 4 + k] * da * (1 - sa)) / oa;
      out[i * 4 + 3] = oa * 255;
    }
  }
  return out;
}

/** The palette index on top at (x, y), among visible layers; 0 if every one is transparent there. */
export function indexAt(pix: Pix, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= pix.w || y >= pix.h) return 0;
  for (let k = pix.layers.length - 1; k >= 0; k--) {
    const l = pix.layers[k];
    if (!l.show) continue;
    const v = l.px[y * pix.w + x];
    if (v !== 0) return v;
  }
  return 0;
}

/** Whether every pixel of every layer is transparent. */
export function isEmpty(pix: Pix): boolean {
  return pix.layers.every((l) => l.px.every((v) => v === 0));
}

/** The flattened image `scale` times its size, sharp, on a transparent background. Browser only. */
export function imageCanvas(pix: Pix, scale: number): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = pix.w;
  small.height = pix.h;
  small.getContext('2d')!.putImageData(new ImageData(flatten(pix), pix.w, pix.h), 0, 0);
  if (scale === 1) return small;
  const big = document.createElement('canvas');
  big.width = pix.w * scale;
  big.height = pix.h * scale;
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

async function pngOf(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!blob) throw new Error("couldn't make the PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The smallest scale at which grid marks between pixels leave the pixels readable. */
export const MIN_GRID_SCALE = 4;

/**
 * A PNG of the image at a whole-number scale (1–32). With no `look` it is
 * transparent where the image is; a look puts it on a light or dark page and
 * can draw the pixel grid over it (only from MIN_GRID_SCALE up).
 */
export function exportPng(pix: Pix, scale: number, look?: ExportLook): Promise<Uint8Array> {
  const s = Math.max(1, Math.min(32, Math.round(scale)));
  const image = imageCanvas(pix, s);
  const grid = !!look?.grid && s >= MIN_GRID_SCALE;
  if (!look || (look.backdrop === 'none' && !grid)) return pngOf(image);
  const out = document.createElement('canvas');
  out.width = image.width;
  out.height = image.height;
  const ctx = out.getContext('2d')!;
  if (look.backdrop !== 'none') {
    ctx.fillStyle = PAPER[look.backdrop];
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(image, 0, 0);
  if (grid) {
    // Lines on the pixel edges, a little thicker as the picture gets bigger.
    const t = Math.max(1, Math.floor(s / 16));
    ctx.fillStyle = GRID_INK[look.backdrop];
    for (let x = 1; x < pix.w; x++) ctx.fillRect(x * s - Math.floor(t / 2), 0, t, out.height);
    for (let y = 1; y < pix.h; y++) ctx.fillRect(0, y * s - Math.floor(t / 2), out.width, t);
  }
  return pngOf(out);
}

/** A PNG for the library, up to `side` pixels across at a whole-number scale; null for an empty image. */
export async function thumbnailLpx(pix: Pix, side: number): Promise<Uint8Array | null> {
  if (isEmpty(pix)) return null;
  return pngOf(imageCanvas(pix, Math.max(1, Math.floor(side / Math.max(pix.w, pix.h)))));
}
