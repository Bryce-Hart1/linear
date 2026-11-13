// Drawing a drawing: onto the editor's canvas, and as a PNG, a JPEG, an SVG
// or a library thumbnail. All of them go through segments() in geometry.ts,
// so a stroke looks the same everywhere.

import { GRID_INK, PAPER, dotsAsSvg, dotsOnCanvas, inkOn, type ExportLook } from '../export-look';
import { boundsOf, pathData, segments, strokeBox, tracePath, type Box, type Pt } from './geometry';
import type { Drawing, Stroke } from './model';

/** Draws one stroke in page coordinates. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const segs = segments(s.pts, s.z);
  ctx.save();
  ctx.globalAlpha = s.o / 100;
  ctx.strokeStyle = s.c;
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  tracePath(ctx, segs);
  ctx.stroke();
  ctx.restore();
}

/** The page's background, then every stroke, back to front. */
export function drawDrawing(ctx: CanvasRenderingContext2D, d: Drawing, paper: string, skip?: ReadonlySet<number>) {
  ctx.fillStyle = d.bg === 'none' ? paper : d.bg;
  ctx.fillRect(0, 0, d.w, d.h);
  for (const s of d.items) if (!skip?.has(s.id)) drawStroke(ctx, s);
}

/** What an export covers: what's drawn plus a margin, or the whole page. */
export function exportBox(d: Drawing, whole: boolean): Box | null {
  if (whole) return { x: 0, y: 0, w: d.w, h: d.h };
  const b = boundsOf(d.items);
  if (!b) return null;
  const m = 32;
  return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
}

/** Grid marks on an exported page: a dot every 20 page pixels, 1.5 across. */
const GRID_STEP = 20;
const GRID_DOT = 1.5;

/** A stroke as it prints on the export's page (grey ink flips to stay visible). */
const printed = (s: Stroke, look?: ExportLook): Stroke => (look ? { ...s, c: inkOn(s.c, look.backdrop) } : s);

function render(d: Drawing, box: Box, scale: number, background: string | null, look?: ExportLook): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
  if (look?.grid) dotsOnCanvas(ctx, box, GRID_STEP, GRID_DOT, GRID_INK[look.backdrop]);
  for (const s of d.items) drawStroke(ctx, printed(s, look));
  return canvas;
}

async function bytesOf(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));
  if (!blob) throw new Error(`couldn't make the ${type.slice(6).toUpperCase()}`);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * A PNG or JPEG at twice the size: cropped to what's drawn (plus 32 px) or the
 * whole page. A PNG of a transparent page stays transparent; a JPEG can't, so it gets white.
 */
export async function exportImage(d: Drawing, kind: 'png' | 'jpeg', whole: boolean, look?: ExportLook): Promise<Uint8Array> {
  const box = exportBox(d, whole);
  if (!box) throw new Error('nothing to export: the page is empty');
  // A JPEG has no transparency, so it never has the "none" page.
  const l = look && kind === 'jpeg' && look.backdrop === 'none' ? { ...look, backdrop: 'light' as const } : look;
  const bg = l ? (l.backdrop === 'none' ? null : PAPER[l.backdrop]) : d.bg === 'none' ? (kind === 'jpeg' ? '#ffffff' : null) : d.bg;
  return kind === 'png' ? bytesOf(render(d, box, 2, bg, l), 'image/png') : bytesOf(render(d, box, 2, bg, l), 'image/jpeg', 0.92);
}

/** A small picture of the whole page for the library; null when nothing is drawn. */
export async function thumbnailLdw(d: Drawing, side: number): Promise<Uint8Array | null> {
  if (!d.items.length) return null;
  const scale = Math.min(1, side / Math.max(d.w, d.h));
  const canvas = render(d, { x: 0, y: 0, w: d.w, h: d.h }, scale, d.bg === 'none' ? null : d.bg);
  return d.bg === 'none' ? bytesOf(canvas, 'image/png') : bytesOf(canvas, 'image/jpeg', 0.85);
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const r2 = (v: number) => String(Math.round(v * 100) / 100);

/** The drawing as SVG: one path per stroke, cropped like the PNG (or the whole page). */
export function exportSvg(d: Drawing, whole: boolean, look?: ExportLook): string {
  const box = exportBox(d, whole);
  if (!box) throw new Error('nothing to export: the page is empty');
  const page = look ? (look.backdrop === 'none' ? 'none' : PAPER[look.backdrop]) : d.bg;
  const bg = page === 'none' ? '' : `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" fill="${xml(page)}"/>\n`;
  const grid = look?.grid ? dotsAsSvg(box, GRID_STEP, GRID_DOT, GRID_INK[look.backdrop]) : '';
  const paths = d.items
    .map((s) => printed(s, look))
    .map(
      (s) =>
        `<path d="${pathData(segments(s.pts, s.z))}" fill="none" stroke="${xml(s.c)}" stroke-width="${r2(s.w)}" stroke-linecap="round" stroke-linejoin="round"${s.o === 100 ? '' : ` stroke-opacity="${s.o / 100}"`}/>`,
    )
    .join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}" width="${r2(box.w)}" height="${r2(box.h)}">\n` +
    `${bg}${grid}${paths}\n</svg>\n`
  );
}

/** The selection's box on screen, a little outside what it covers. */
export function selectionBox(strokes: readonly Stroke[], pad: number): Box | null {
  const b = boundsOf(strokes);
  return b && { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

export { strokeBox };
export type { Pt };
