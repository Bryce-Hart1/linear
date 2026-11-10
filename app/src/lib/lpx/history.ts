// Undo and redo for an image that's changed in place. A stroke (or a fill, a
// shape, a paste) keeps only the rectangle it changed, before and after.
// Changes to the image as a whole (layers, the palette, the canvas size) keep
// a snapshot of its structure: each layer's settings, with its pixels shared,
// not copied. That works because history is strictly last-in first-out:
// by the time a snapshot comes back, every stroke after it has been undone,
// so the pixels it points at are as they were.
//
// History keeps at most 200 steps and about 64 MB of pixels, dropping the oldest.

import type { Layer, Pix } from './model';
import { place, type Rect } from './raster';

export interface Snapshot {
  w: number;
  h: number;
  next: number;
  pal: string[];
  layers: Layer[];
}

export function snapshot(pix: Pix): Snapshot {
  return { w: pix.w, h: pix.h, next: pix.next, pal: [...pix.pal], layers: pix.layers.map((l) => ({ ...l })) };
}

export function restore(pix: Pix, s: Snapshot) {
  pix.w = s.w;
  pix.h = s.h;
  pix.next = s.next;
  pix.pal = [...s.pal];
  pix.layers = s.layers.map((l) => ({ ...l }));
}

export type Entry =
  | { id: number; kind: 'pixels'; layer: number; rect: Rect; before: Uint8Array; after: Uint8Array }
  | { id: number; kind: 'image'; before: Snapshot; after: Snapshot; key?: string; at: number };

const STEPS = 200;
const BYTES = 64 * 1024 * 1024;
/** Changes with the same key this close together (a slider being dragged) are one step. */
const MERGE_MS = 800;

const size = (e: Entry) => (e.kind === 'pixels' ? e.before.length * 2 : 0);

export class PixHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private n = 0;
  private bytes = 0;

  /** A change to one layer's pixels inside `rect`. */
  pixels(layer: number, rect: Rect, before: Uint8Array, after: Uint8Array) {
    this.push({ id: ++this.n, kind: 'pixels', layer, rect, before, after });
  }

  /** A change to the image as a whole. Same-key changes in quick succession merge into one step. */
  image(before: Snapshot, after: Snapshot, key?: string) {
    const last = this.past.at(-1);
    const now = Date.now();
    if (key && last?.kind === 'image' && last.key === key && now - last.at < MERGE_MS && this.future.length === 0) {
      last.after = after;
      last.at = now;
      last.id = ++this.n;
      return;
    }
    this.push({ id: ++this.n, kind: 'image', before, after, key, at: now });
  }

  private push(e: Entry) {
    this.past.push(e);
    this.bytes += size(e);
    for (const f of this.future) this.bytes -= size(f);
    this.future = [];
    while (this.past.length > 1 && (this.past.length > STEPS || this.bytes > BYTES)) this.bytes -= size(this.past.shift()!);
  }

  undo(pix: Pix): Entry | null {
    const e = this.past.pop();
    if (!e) return null;
    apply(pix, e, 'before');
    this.future.push(e);
    return e;
  }

  redo(pix: Pix): Entry | null {
    const e = this.future.pop();
    if (!e) return null;
    apply(pix, e, 'after');
    this.past.push(e);
    return e;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  /** Which step the image is at: compare with the one saved to know if it's changed. */
  get mark(): number {
    return this.past.at(-1)?.id ?? 0;
  }
}

function apply(pix: Pix, e: Entry, side: 'before' | 'after') {
  if (e.kind === 'image') {
    restore(pix, e[side]);
    return;
  }
  const layer = pix.layers.find((l) => l.id === e.layer);
  if (layer) place(layer.px, pix.w, e.rect, e[side]);
}
