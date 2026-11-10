// Every change to a drawing, as a function from one drawing to the next (as
// lib/lin/edit.ts does for diagrams), so undo is keeping the old one.

import { boundsOf, flat, points, type Pt } from './geometry';
import { MAX_SIDE, MAX_WIDTH, MIN_SIDE, MIN_WIDTH, clamp, round1, type Drawing, type Stroke, type StrokeKind } from './model';

export type Result = { d: Drawing; ids?: number[] } | { error: string };

export interface Ink {
  t: StrokeKind;
  c: string;
  w: number;
  o: number;
}

/** A new stroke on top. Returns its id. */
export function addStroke(d: Drawing, ink: Ink, pts: readonly Pt[], closed = false): { d: Drawing; id: number } {
  const s: Stroke = {
    id: d.next,
    t: ink.t,
    c: ink.c,
    w: round1(clamp(ink.w, MIN_WIDTH, MAX_WIDTH)),
    o: Math.round(clamp(ink.o, 1, 100)),
    z: closed,
    pts: flat(pts.length ? pts : [{ x: 0, y: 0 }]),
  };
  return { d: { ...d, next: d.next + 1, items: [...d.items, s] }, id: s.id };
}

export function removeStrokes(d: Drawing, ids: readonly number[]): Drawing {
  const gone = new Set(ids);
  return gone.size ? { ...d, items: d.items.filter((s) => !gone.has(s.id)) } : d;
}

export function moveStrokes(d: Drawing, ids: readonly number[], dx: number, dy: number): Drawing {
  if (dx === 0 && dy === 0) return d;
  const set = new Set(ids);
  return {
    ...d,
    items: d.items.map((s) => (set.has(s.id) ? { ...s, pts: s.pts.map((v, i) => round1(v + (i % 2 ? dy : dx))) } : s)),
  };
}

/** Changes the colour, width or opacity of strokes. */
export function restyle(d: Drawing, ids: readonly number[], change: Partial<Pick<Stroke, 'c' | 'w' | 'o'>>): Drawing {
  const set = new Set(ids);
  const fix = (s: Stroke): Stroke => ({
    ...s,
    ...(change.c !== undefined ? { c: change.c } : {}),
    ...(change.w !== undefined ? { w: round1(clamp(change.w, MIN_WIDTH, MAX_WIDTH)) } : {}),
    ...(change.o !== undefined ? { o: Math.round(clamp(change.o, 1, 100)) } : {}),
  });
  return { ...d, items: d.items.map((s) => (set.has(s.id) ? fix(s) : s)) };
}

/** To the front or the back, keeping the moved strokes' order among themselves. */
export function reorder(d: Drawing, ids: readonly number[], to: 'front' | 'back'): Drawing {
  const set = new Set(ids);
  const moved = d.items.filter((s) => set.has(s.id));
  const rest = d.items.filter((s) => !set.has(s.id));
  return { ...d, items: to === 'front' ? [...rest, ...moved] : [...moved, ...rest] };
}

/** Copies of strokes on top with new ids, moved by (dx, dy). Returns the new ids. */
export function pasteStrokes(d: Drawing, strokes: readonly Stroke[], dx: number, dy: number): { d: Drawing; ids: number[] } {
  let next = d.next;
  const copies = strokes.map((s) => ({ ...s, id: next++, pts: s.pts.map((v, i) => round1(v + (i % 2 ? dy : dx))) }));
  return { d: { ...d, next, items: [...d.items, ...copies] }, ids: copies.map((s) => s.id) };
}

/** Scales strokes about the centre of what they cover, widths too. */
export function scaleStrokes(d: Drawing, ids: readonly number[], k: number): Drawing {
  const set = new Set(ids);
  const box = boundsOf(d.items.filter((s) => set.has(s.id)));
  if (!box || k <= 0) return d;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    ...d,
    items: d.items.map((s) =>
      set.has(s.id)
        ? { ...s, w: round1(clamp(s.w * k, MIN_WIDTH, MAX_WIDTH)), pts: flat(points(s.pts).map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }))) }
        : s,
    ),
  };
}

export function setPage(d: Drawing, change: { w?: number; h?: number; bg?: string }): Result {
  const w = change.w ?? d.w;
  const h = change.h ?? d.h;
  if (![w, h].every((v) => Number.isInteger(v) && v >= MIN_SIDE && v <= MAX_SIDE)) return { error: `a page side is ${MIN_SIDE} to ${MAX_SIDE} pixels` };
  return { d: { ...d, w, h, bg: change.bg ?? d.bg } };
}

/** Earlier drawings to go back to, and the ones undone to go forward to: 200 each. */
export class History {
  private past: Drawing[] = [];
  private future: Drawing[] = [];

  push(before: Drawing) {
    this.past.push(before);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
  }

  undo(now: Drawing): Drawing | null {
    const back = this.past.pop();
    if (back) this.future.push(now);
    return back ?? null;
  }

  redo(now: Drawing): Drawing | null {
    const ahead = this.future.pop();
    if (ahead) this.past.push(now);
    return ahead ?? null;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
