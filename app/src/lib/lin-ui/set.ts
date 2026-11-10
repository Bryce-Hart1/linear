// Edits the clickable .lin editor needs that the keyboard didn't: set a value
// outright (an inspector's segmented control) rather than step through them,
// and give a shape an exact size (a W/H field, a resize handle). Each is
// built on lib/lin/edit.ts or follows its rules: sizes stay 24–800, circles
// stay round, shapes stay on the page, and text that fits keeps fitting.
// Everything they make is plain .lin v1.

import { cycleHead, cyclePulse, cycleRoute, cycleStroke, toggleGlow, type Edited } from '../lin/edit';
import { fits, type Pt } from '../lin/geometry';
import { MAX_SIZE, MIN_SIZE, find, isLine, shapeById, type Doc, type Glow, type Head, type Line, type Part, type Pulse, type Route, type Stroke } from '../lin/model';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** As edit.ts keeps a shape on the page: centred if it's bigger than the page. */
function keepOn(centre: number, size: number, page: number): number {
  return size >= page ? page / 2 : clamp(centre, size / 2, page - size / 2);
}

/**
 * Gives a shape a size, centred on `at` (its own centre if not given). A
 * circle takes the width for both. Refused if the text would no longer fit.
 */
export function setSize(doc: Doc, id: number, w: number, h: number, at?: Pt): Edited {
  const s = shapeById(doc, id);
  if (!s) return { error: 'select a shape to size it' };
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { error: 'a size is a number of pixels' };
  w = round1(clamp(w, MIN_SIZE, MAX_SIZE));
  h = s.t === 'circle' ? w : round1(clamp(h, MIN_SIZE, MAX_SIZE));
  const x = round1(keepOn(at?.x ?? s.x, w, doc.w));
  const y = round1(keepOn(at?.y ?? s.y, h, doc.h));
  if (w === s.w && h === s.h && x === s.x && y === s.y) return { doc };
  const next = { ...s, w, h, x, y };
  // A shape that already overflows (a hand-edited file) may still be changed.
  if (!fits(next) && fits(s)) return { error: "the text wouldn't fit in a smaller shape" };
  return { doc: { ...doc, items: doc.items.map((p) => (p.id === id ? next : p)) } };
}

/** Steps `step` until the part's value is `want`: set-to-value from the keyboard's cycles. */
function cycleTo<T>(doc: Doc, id: number, step: (d: Doc, id: number) => Edited, get: (p: Part) => T | undefined, want: T): Edited {
  let now = doc;
  for (let i = 0; i < 6; i++) {
    const p = find(now, id);
    if (!p) return { error: 'nothing is selected' };
    const value = get(p);
    if (value === want) return { doc: now };
    const r = step(now, id);
    if ('error' in r) return r;
    now = r.doc;
  }
  return { error: `can't set that to ${String(want)}` };
}

const onLine = <K extends keyof Line>(key: K) => (p: Part) => (isLine(p) ? p[key] : undefined);

export const setHead = (doc: Doc, id: number, head: Head) => cycleTo(doc, id, cycleHead, onLine('head'), head);
export const setRoute = (doc: Doc, id: number, route: Route) => cycleTo(doc, id, cycleRoute, onLine('route'), route);
export const setPulse = (doc: Doc, id: number, pulse: Pulse) => cycleTo(doc, id, cyclePulse, onLine('pulse'), pulse);
export const setGlow = (doc: Doc, id: number, glow: Glow) => cycleTo(doc, id, toggleGlow, onLine('glow'), glow);
export const setStroke = (doc: Doc, id: number, ln: Stroke) => cycleTo(doc, id, cycleStroke, (p) => p.ln, ln);
