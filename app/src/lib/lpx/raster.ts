// Drawing on one layer's pixels: the brush, lines, rectangles and ellipses,
// flood fill, cutting and pasting regions, and whole-canvas changes. All of it
// works on a plain Uint8Array of palette indices, `w` × `h`, row by row, and
// says which rectangle it changed so history.ts can keep just that part.

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** `r` cut to the canvas (and to `clip`, if there's a selection); null if nothing is left. */
export function clipRect(r: Rect, w: number, h: number, clip?: Rect | null): Rect | null {
  let x0 = Math.max(0, r.x);
  let y0 = Math.max(0, r.y);
  let x1 = Math.min(w, r.x + r.w);
  let y1 = Math.min(h, r.y + r.h);
  if (clip) {
    x0 = Math.max(x0, clip.x);
    y0 = Math.max(y0, clip.y);
    x1 = Math.min(x1, clip.x + clip.w);
    y1 = Math.min(y1, clip.y + clip.h);
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The two corners as a rectangle, inclusive of both. */
export function rectFrom(a: Pt, b: Pt): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** The pixels a brush covers, relative to where it's put: a square, or a disc. */
export function brush(size: number, round: boolean): Pt[] {
  const s = Math.max(1, Math.round(size));
  // Even sizes reach one further right and down. (`|| 0`: no -0 offsets.)
  const lo = -Math.floor((s - 1) / 2) || 0;
  const out: Pt[] = [];
  // The brush's true centre relative to the put point, and the radius a pixel's centre must be within.
  const c = lo + (s - 1) / 2;
  const r2 = (s / 2 - 0.25) ** 2;
  for (let dy = lo; dy < lo + s; dy++) {
    for (let dx = lo; dx < lo + s; dx++) {
      if (round && (dx - c) ** 2 + (dy - c) ** 2 > r2) continue;
      out.push({ x: dx, y: dy });
    }
  }
  return out;
}

/** Every pixel on the straight line from a to b (Bresenham), both ends included. */
export function linePoints(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export function rectPoints(a: Pt, b: Pt, filled: boolean): Pt[] {
  const r = rectFrom(a, b);
  const out: Pt[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (filled || y === r.y || y === r.y + r.h - 1 || x === r.x || x === r.x + r.w - 1) out.push({ x, y });
    }
  }
  return out;
}

/** The ellipse that fills the box from a to b; its outline is the inside pixels next to an outside one. */
export function ellipsePoints(a: Pt, b: Pt, filled: boolean): Pt[] {
  const r = rectFrom(a, b);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = r.w / 2;
  const ry = r.h / 2;
  const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const out: Pt[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) out.push({ x, y });
    }
  }
  return out;
}

/** With ⇧: a line snaps to 45° steps, a box to a square. */
export function constrain(a: Pt, b: Pt, kind: 'line' | 'box'): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (kind === 'box') {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * d, y: a.y + Math.sign(dy || 1) * d };
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  const ux = Math.round(Math.cos(angle));
  const uy = Math.round(Math.sin(angle));
  return { x: a.x + ux * len, y: a.y + uy * len };
}

export interface Paint {
  /** The palette index to put down (0 erases). */
  value: number;
  size: number;
  round: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Only inside this, when there's a selection. */
  clip: Rect | null;
}

/**
 * Puts the brush down at every point (and at its mirror images). Returns the
 * rectangle it changed, or null if nothing changed.
 */
export function stamp(px: Uint8Array, w: number, h: number, points: readonly Pt[], p: Paint): Rect | null {
  const tip = brush(p.size, p.round);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (p.clip && (x < p.clip.x || y < p.clip.y || x >= p.clip.x + p.clip.w || y >= p.clip.y + p.clip.h)) return;
    const i = y * w + x;
    if (px[i] === p.value) return;
    px[i] = p.value;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  };
  for (const pt of points) {
    for (const t of tip) {
      const x = pt.x + t.x;
      const y = pt.y + t.y;
      put(x, y);
      if (p.mirrorX) put(w - 1 - x, y);
      if (p.mirrorY) put(x, h - 1 - y);
      if (p.mirrorX && p.mirrorY) put(w - 1 - x, h - 1 - y);
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A freehand stroke as the pointer moves: each move draws the line from the
 * last point. With `perfect` (1-pixel brushes), corners where the line steps
 * sideways and then on are taken back out, so diagonals stay one pixel thin.
 */
export class Stroke {
  readonly before: Uint8Array;
  dirty: Rect | null = null;
  private path: Pt[] = [];

  constructor(
    private px: Uint8Array,
    private w: number,
    private h: number,
    private paint: Paint,
    private perfect: boolean,
  ) {
    this.before = px.slice();
  }

  to(p: Pt) {
    const last = this.path.at(-1);
    const points = last ? linePoints(last, p).slice(1) : [p];
    for (const q of points) this.add(q);
  }

  private add(q: Pt) {
    const path = this.path;
    if (this.perfect && this.paint.size <= 1 && path.length >= 2) {
      const a = path[path.length - 2];
      const b = path[path.length - 1];
      // a → b → q turns a corner where a and q touch diagonally: b is the extra pixel.
      if (Math.abs(a.x - q.x) === 1 && Math.abs(a.y - q.y) === 1) {
        this.restore(b);
        path.pop();
      }
    }
    path.push(q);
    this.dirty = union(this.dirty, stamp(this.px, this.w, this.h, [q], this.paint));
  }

  /** Puts a pixel (and its mirror images) back as it was before the stroke. */
  private restore(p: Pt) {
    const { w, h, px, before } = this;
    const back = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = before[y * w + x];
    };
    back(p.x, p.y);
    if (this.paint.mirrorX) back(w - 1 - p.x, p.y);
    if (this.paint.mirrorY) back(p.x, h - 1 - p.y);
    if (this.paint.mirrorX && this.paint.mirrorY) back(w - 1 - p.x, h - 1 - p.y);
  }
}

/** The part of `px` inside `r`, as its own w × h array. */
export function extract(px: Uint8Array, w: number, r: Rect): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(px.subarray((r.y + y) * w + r.x, (r.y + y) * w + r.x + r.w), y * r.w);
  return out;
}

/** Writes a w × h block into `px` at `r`, every pixel of it. */
export function place(px: Uint8Array, w: number, r: Rect, block: Uint8Array) {
  for (let y = 0; y < r.h; y++) px.set(block.subarray(y * r.w, y * r.w + r.w), (r.y + y) * w + r.x);
}

/** Sets every pixel in `r` (cut to the canvas) to `value`. Returns what it changed. */
export function fillRect(px: Uint8Array, w: number, h: number, r: Rect, value: number): Rect | null {
  const c = clipRect(r, w, h);
  if (!c) return null;
  for (let y = c.y; y < c.y + c.h; y++) px.fill(value, y * w + c.x, y * w + c.x + c.w);
  return c;
}

/**
 * Lays a block over `px` with its top-left at (x, y): transparent pixels in
 * the block leave what's under them. Returns what it changed.
 */
export function blit(px: Uint8Array, w: number, h: number, block: Uint8Array, bw: number, bh: number, x: number, y: number): Rect | null {
  const c = clipRect({ x, y, w: bw, h: bh }, w, h);
  if (!c) return null;
  for (let yy = c.y; yy < c.y + c.h; yy++) {
    for (let xx = c.x; xx < c.x + c.w; xx++) {
      const v = block[(yy - y) * bw + (xx - x)];
      if (v !== 0) px[yy * w + xx] = v;
    }
  }
  return c;
}

/**
 * Fills from (x, y): the pixels of its colour that touch it, side by side
 * (`contiguous`), or every pixel of its colour. Inside `clip` if given.
 */
export function floodFill(px: Uint8Array, w: number, h: number, x: number, y: number, value: number, contiguous: boolean, clip?: Rect | null): Rect | null {
  const area = clipRect({ x: 0, y: 0, w, h }, w, h, clip);
  if (!area || x < area.x || y < area.y || x >= area.x + area.w || y >= area.y + area.h) return null;
  const from = px[y * w + x];
  if (from === value) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const mark = (xx: number, yy: number) => {
    px[yy * w + xx] = value;
    if (xx < x0) x0 = xx;
    if (yy < y0) y0 = yy;
    if (xx > x1) x1 = xx;
    if (yy > y1) y1 = yy;
  };
  if (!contiguous) {
    for (let yy = area.y; yy < area.y + area.h; yy++) for (let xx = area.x; xx < area.x + area.w; xx++) if (px[yy * w + xx] === from) mark(xx, yy);
  } else {
    const stack = [x, y];
    while (stack.length) {
      const yy = stack.pop()!;
      const xx = stack.pop()!;
      if (xx < area.x || yy < area.y || xx >= area.x + area.w || yy >= area.y + area.h || px[yy * w + xx] !== from) continue;
      mark(xx, yy);
      stack.push(xx + 1, yy, xx - 1, yy, xx, yy + 1, xx, yy - 1);
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ── The whole canvas ─────────────────────────────────────────────────────

/** A new w × h canvas with the old one placed by `ax`, `ay` (0 left/top, 0.5 centre, 1 right/bottom). */
export function resized(px: Uint8Array, w: number, h: number, nw: number, nh: number, ax: number, ay: number): Uint8Array {
  const out = new Uint8Array(nw * nh);
  const ox = Math.round((nw - w) * ax);
  const oy = Math.round((nh - h) * ay);
  for (let y = 0; y < h; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= nh) continue;
    for (let x = 0; x < w; x++) {
      const tx = x + ox;
      if (tx >= 0 && tx < nw) out[ty * nw + tx] = px[y * w + x];
    }
  }
  return out;
}

export function flippedH(px: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + (w - 1 - x)] = px[y * w + x];
  return out;
}

export function flippedV(px: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) out.set(px.subarray(y * w, y * w + w), (h - 1 - y) * w);
  return out;
}

/** Turned a quarter clockwise: the new canvas is h wide and w tall. */
export function rotatedCW(px: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = px[y * w + x];
  return out;
}
