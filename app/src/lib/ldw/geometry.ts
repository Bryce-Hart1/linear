// Stroke geometry: the smooth curve a stroke is drawn as (the same for the
// canvas, SVG and PNG), steadying and thinning the pointer's points as a
// stroke is drawn, the shape tools' outlines, and finding strokes under a
// point or inside a lasso.

import { round1, type Drawing, type Stroke } from './model';

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function points(pts: readonly number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
  return out;
}

export function flat(ps: readonly Pt[]): number[] {
  return ps.flatMap((p) => [round1(p.x), round1(p.y)]);
}

/** One step of drawing a stroke's outline: move, a straight run, or a quadratic curve. */
export type Seg = { op: 'M' | 'L'; x: number; y: number } | { op: 'Q'; cx: number; cy: number; x: number; y: number } | { op: 'Z' };

/**
 * The curve through a stroke's points: quadratic curves from midpoint to
 * midpoint with each point as the control, which runs smoothly through the
 * middle of every run between points. A closed stroke goes all the way round.
 */
export function segments(pts: readonly number[], closed: boolean): Seg[] {
  const p = points(pts);
  if (p.length === 0) return [];
  if (p.length === 1) return [{ op: 'M', ...p[0] }, { op: 'L', ...p[0] }];
  if (p.length === 2) return [{ op: 'M', ...p[0] }, { op: 'L', ...p[1] }, ...(closed ? [{ op: 'Z' } as Seg] : [])];
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (closed) {
    const out: Seg[] = [{ op: 'M', ...mid(p[p.length - 1], p[0]) }];
    for (let i = 0; i < p.length; i++) {
      const m = mid(p[i], p[(i + 1) % p.length]);
      out.push({ op: 'Q', cx: p[i].x, cy: p[i].y, x: m.x, y: m.y });
    }
    out.push({ op: 'Z' });
    return out;
  }
  const out: Seg[] = [{ op: 'M', ...p[0] }];
  for (let i = 1; i < p.length - 1; i++) {
    const m = mid(p[i], p[i + 1]);
    out.push({ op: 'Q', cx: p[i].x, cy: p[i].y, x: m.x, y: m.y });
  }
  out.push({ op: 'L', ...p[p.length - 1] });
  return out;
}

const n = (v: number) => String(Math.round(v * 100) / 100);

/** The curve as SVG path data. */
export function pathData(segs: readonly Seg[]): string {
  return segs.map((s) => (s.op === 'Z' ? 'Z' : s.op === 'Q' ? `Q${n(s.cx)} ${n(s.cy)} ${n(s.x)} ${n(s.y)}` : `${s.op}${n(s.x)} ${n(s.y)}`)).join(' ');
}

export function tracePath(ctx: CanvasRenderingContext2D | Path2D, segs: readonly Seg[]) {
  for (const s of segs) {
    if (s.op === 'M') ctx.moveTo(s.x, s.y);
    else if (s.op === 'L') ctx.lineTo(s.x, s.y);
    else if (s.op === 'Q') ctx.quadraticCurveTo(s.cx, s.cy, s.x, s.y);
    else ctx.closePath();
  }
}

// ── Drawing a stroke ─────────────────────────────────────────────────────

/**
 * Steadies the pointer: the pen trails it on a string `radius` long, moving
 * only when pulled, so a shaky hand draws a smooth line. 0 follows exactly.
 */
export class LazyPen {
  private at: Pt | null = null;
  constructor(private radius: number) {}

  /** Where the pen is after the pointer moves to `p`. */
  to(p: Pt): Pt {
    if (!this.at || this.radius <= 0) return (this.at = { ...p });
    const dx = p.x - this.at.x;
    const dy = p.y - this.at.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      const k = (d - this.radius) / d;
      this.at = { x: this.at.x + dx * k, y: this.at.y + dy * k };
    }
    return { ...this.at };
  }
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of the line drawn. */
export function simplify(ps: readonly Pt[], tolerance: number): Pt[] {
  if (ps.length <= 2) return [...ps];
  const keep = new Uint8Array(ps.length);
  keep[0] = keep[ps.length - 1] = 1;
  const stack: [number, number][] = [[0, ps.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let farD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(ps[i], ps[a], ps[b]);
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return ps.filter((_, i) => keep[i]);
}

// ── Shapes ───────────────────────────────────────────────────────────────

/** A straight line's points; ⇧ snaps it to 45° steps. */
export function linePts(a: Pt, b: Pt, snap: boolean): Pt[] {
  if (!snap) return [a, b];
  const angle = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return [a, { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len }];
}

/** The box from a to b, a square with ⇧. */
export function boxFrom(a: Pt, b: Pt, square: boolean): Box {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * d;
    dy = Math.sign(dy || 1) * d;
  }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

/**
 * A rectangle's corners for a closed stroke. Each corner is doubled, so the
 * midpoint curve keeps it sharp instead of rounding it off.
 */
export function rectPts(b: Box): Pt[] {
  const c = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
  return c.flatMap((p) => [p, p]);
}

/** Points round an ellipse filling the box: the midpoint curve through them is an ellipse to the eye. */
export function ellipsePts(b: Box, count = 32): Pt[] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 2;
    return { x: cx + (Math.cos(t) * b.w) / 2, y: cy + (Math.sin(t) * b.h) / 2 };
  });
}

// ── Finding strokes ─────────────────────────────────────────────────────

/** The box around a stroke's points, grown by half its width. */
export function strokeBox(s: Stroke): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < s.pts.length; i += 2) {
    x0 = Math.min(x0, s.pts[i]);
    y0 = Math.min(y0, s.pts[i + 1]);
    x1 = Math.max(x1, s.pts[i]);
    y1 = Math.max(y1, s.pts[i + 1]);
  }
  const r = s.w / 2;
  return { x: x0 - r, y: y0 - r, w: x1 - x0 + s.w, h: y1 - y0 + s.w };
}

/** What all of `strokes` cover; null if there are none. */
export function boundsOf(strokes: readonly Stroke[]): Box | null {
  if (!strokes.length) return null;
  const boxes = strokes.map(strokeBox);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** How far `p` is from the middle of a stroke's line (its points joined straight, near enough). */
export function distToStroke(s: Stroke, p: Pt): number {
  const ps = points(s.pts);
  if (ps.length === 1) return Math.hypot(p.x - ps[0].x, p.y - ps[0].y);
  let best = Infinity;
  for (let i = 1; i < ps.length; i++) best = Math.min(best, distToSegment(p, ps[i - 1], ps[i]));
  if (s.z && ps.length > 2) best = Math.min(best, distToSegment(p, ps[ps.length - 1], ps[0]));
  return best;
}

/** Whether `p` is on the stroke: within half its width, plus `slop`. */
export function onStroke(s: Stroke, p: Pt, slop: number): boolean {
  const b = strokeBox(s);
  if (p.x < b.x - slop || p.y < b.y - slop || p.x > b.x + b.w + slop || p.y > b.y + b.h + slop) return false;
  return distToStroke(s, p) <= s.w / 2 + slop;
}

/** The front-most stroke under `p`, if any. */
export function strokeAt(d: Drawing, p: Pt, slop: number): Stroke | null {
  for (let i = d.items.length - 1; i >= 0; i--) if (onStroke(d.items[i], p, slop)) return d.items[i];
  return null;
}

/** Even-odd: whether `p` is inside the polygon. */
export function inPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The strokes a lasso catches: any with at least half its points inside. */
export function lassoed(d: Drawing, poly: readonly Pt[]): number[] {
  if (poly.length < 3) return [];
  return d.items
    .filter((s) => {
      const ps = points(s.pts);
      const inside = ps.filter((p) => inPolygon(p, poly)).length;
      return inside > 0 && inside * 2 >= ps.length;
    })
    .map((s) => s.id);
}
