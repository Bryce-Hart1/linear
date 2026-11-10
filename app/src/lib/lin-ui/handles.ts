// The selected shape's resize handles and every shape's connector dots:
// where they are on the page, which one a point is on, and what dragging a
// handle makes of the shape.

import { outlinePoint, type Pt } from '../lin/geometry';
import { MAX_SIZE, MIN_SIZE, type Shape } from '../lin/model';

export type HandleId = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export const HANDLES: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Which way each handle pulls: -1 the left/top edge, 1 the right/bottom, 0 neither. */
const PULL: Record<HandleId, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};

export function handlePoint(s: Shape, h: HandleId): Pt {
  const [px, py] = PULL[h];
  return { x: s.x + (px * s.w) / 2, y: s.y + (py * s.h) / 2 };
}

/** The handle within `radius` of `p`, nearest first. */
export function handleAt(s: Shape, p: Pt, radius: number): HandleId | null {
  let best: HandleId | null = null;
  let bestD = radius;
  for (const h of HANDLES) {
    const q = handlePoint(s, h);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

export const CURSORS: Record<HandleId, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

const clampSize = (v: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, v));

/**
 * The shape `s` dragged by handle `h` to `p`: the opposite edge (or corner)
 * stays put, or, `fromCentre`, the centre does. A circle stays round, taking
 * whichever way the pointer pulled further. Sizes are kept to 24–800 here, so
 * the anchored edge really stays where it was.
 */
export function resizeTo(s: Shape, h: HandleId, p: Pt, fromCentre: boolean): { w: number; h: number; at: Pt } {
  const [px, py] = PULL[h];
  const left = s.x - s.w / 2;
  const right = s.x + s.w / 2;
  const top = s.y - s.h / 2;
  const bottom = s.y + s.h / 2;
  const span = (pull: number, near: number, far: number, centre: number, at: number, size: number) => {
    if (pull === 0) return size;
    if (fromCentre) return 2 * Math.abs(at - centre);
    return pull > 0 ? at - near : far - at;
  };
  let w = clampSize(span(px, left, right, s.x, p.x, s.w));
  let hh = clampSize(span(py, top, bottom, s.y, p.y, s.h));
  if (s.t === 'circle') {
    const grow = px === 0 ? hh : py === 0 ? w : Math.max(w, hh);
    w = hh = grow;
  }
  const centreOn = (pull: number, near: number, far: number, centre: number, size: number) => {
    if (fromCentre || (pull === 0 && s.t !== 'circle')) return centre;
    // A circle pulled from a side grows evenly about the other axis.
    if (pull === 0) return centre;
    return pull > 0 ? near + size / 2 : far - size / 2;
  };
  // Whole pixels: a dragged size has no use for tenths.
  w = Math.round(w);
  hh = Math.round(hh);
  return { w, h: hh, at: { x: centreOn(px, left, right, s.x, w), y: centreOn(py, top, bottom, s.y, hh) } };
}

export type Side = 'n' | 'e' | 's' | 'w';
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** Where a line drawn out of a shape starts: the middle of each side of its outline. */
export function dotPoint(s: Shape, side: Side): Pt {
  const far = 1e5;
  const toward = { n: { x: s.x, y: s.y - far }, s: { x: s.x, y: s.y + far }, e: { x: s.x + far, y: s.y }, w: { x: s.x - far, y: s.y } }[side];
  return outlinePoint(s, toward);
}

const OUTWARD: Record<Side, Pt> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };

/**
 * Where a dot is drawn and grabbed: `out` page pixels beyond the outline, so
 * it never sits on a resize handle. The line still starts on the outline.
 */
export function dotSpot(s: Shape, side: Side, out = 0): Pt {
  const p = dotPoint(s, side);
  return { x: p.x + OUTWARD[side].x * out, y: p.y + OUTWARD[side].y * out };
}

export function dotAt(s: Shape, p: Pt, radius: number, out = 0): Side | null {
  for (const side of SIDES) {
    const q = dotSpot(s, side, out);
    if (Math.hypot(q.x - p.x, q.y - p.y) <= radius) return side;
  }
  return null;
}
