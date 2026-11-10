// Changes to an image as a whole: its layers, its palette, its canvas. Each
// one checks it can be done, changes the image in place, and records itself in
// the history as one step. A refusal says why, like the .lin editor's do.

import { PixHistory, snapshot } from './history';
import { MAX_COLOURS, MAX_LAYERS, MAX_NAME, MAX_SIDE, TRANSPARENT, blankLayer, layerById, parseHex, type Layer, type Pix } from './model';
import { blit, flippedH, flippedV, resized, rotatedCW } from './raster';

export type Done = { ok: true; id?: number; note?: string } | { error: string };

/** Runs `change` (which may refuse with a string) as one step of history. */
function step(pix: Pix, hist: PixHistory, change: () => string | number | void, key?: string): Done {
  const before = snapshot(pix);
  const r = change();
  if (typeof r === 'string') {
    // Nothing changed: a refusal checks before it touches anything.
    return { error: r };
  }
  hist.image(before, snapshot(pix), key);
  return typeof r === 'number' ? { ok: true, id: r } : { ok: true };
}

const at = (pix: Pix, id: number) => pix.layers.findIndex((l) => l.id === id);

// ── Layers ───────────────────────────────────────────────────────────────

/** A new empty layer just above `above` (or on top). Returns its id. */
export function addLayer(pix: Pix, hist: PixHistory, above: number | null): Done {
  return step(pix, hist, () => {
    if (pix.layers.length >= MAX_LAYERS) return `an image can have at most ${MAX_LAYERS} layers`;
    const layer = blankLayer(pix.next, pix.w, pix.h);
    pix.next++;
    const i = above === null ? pix.layers.length - 1 : at(pix, above);
    pix.layers = [...pix.layers.slice(0, i + 1), layer, ...pix.layers.slice(i + 1)];
    return layer.id;
  });
}

export function duplicateLayer(pix: Pix, hist: PixHistory, id: number): Done {
  return step(pix, hist, () => {
    const i = at(pix, id);
    if (i < 0) return 'no such layer';
    if (pix.layers.length >= MAX_LAYERS) return `an image can have at most ${MAX_LAYERS} layers`;
    const from = pix.layers[i];
    const copy: Layer = { ...from, id: pix.next, name: [...`${from.name} copy`].slice(0, MAX_NAME).join(''), px: from.px.slice() };
    pix.next++;
    pix.layers = [...pix.layers.slice(0, i + 1), copy, ...pix.layers.slice(i + 1)];
    return copy.id;
  });
}

export function deleteLayer(pix: Pix, hist: PixHistory, id: number): Done {
  return step(pix, hist, () => {
    if (at(pix, id) < 0) return 'no such layer';
    if (pix.layers.length === 1) return 'an image needs at least one layer';
    pix.layers = pix.layers.filter((l) => l.id !== id);
  });
}

/** Lays a layer onto the one below it: its colours cover what's under them. Opacity isn't kept: palette colours can't blend. */
export function mergeDown(pix: Pix, hist: PixHistory, id: number): Done {
  return step(pix, hist, () => {
    const i = at(pix, id);
    if (i < 0) return 'no such layer';
    if (i === 0) return 'the bottom layer has nothing below it to merge into';
    const upper = pix.layers[i];
    const lower = pix.layers[i - 1];
    if (lower.lock) return `${lower.name} is locked`;
    const px = lower.px.slice();
    if (upper.show) blit(px, pix.w, pix.h, upper.px, pix.w, pix.h, 0, 0);
    pix.layers = pix.layers.flatMap((l, k) => (k === i ? [] : k === i - 1 ? [{ ...lower, px }] : [l]));
    return lower.id;
  });
}

/** One step up (+1, toward the top) or down (-1). */
export function moveLayer(pix: Pix, hist: PixHistory, id: number, dir: 1 | -1): Done {
  return step(pix, hist, () => {
    const i = at(pix, id);
    const j = i + dir;
    if (i < 0) return 'no such layer';
    if (j < 0 || j >= pix.layers.length) return dir > 0 ? 'already the top layer' : 'already the bottom layer';
    const layers = [...pix.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    pix.layers = layers;
  });
}

export function setLayer(pix: Pix, hist: PixHistory, id: number, change: Partial<Pick<Layer, 'name' | 'show' | 'lock' | 'op'>>): Done {
  return step(
    pix,
    hist,
    () => {
      const i = at(pix, id);
      if (i < 0) return 'no such layer';
      const next = { ...pix.layers[i], ...change };
      if (change.name !== undefined) {
        const name = [...change.name.trim()].slice(0, MAX_NAME).join('');
        if (!name) return "a layer's name can't be empty";
        next.name = name;
      }
      if (change.op !== undefined) next.op = Math.round(Math.min(100, Math.max(0, change.op)));
      pix.layers = pix.layers.map((l, k) => (k === i ? next : l));
    },
    // Dragging the opacity slider is one step, not one per frame.
    change.op !== undefined ? `op:${id}` : undefined,
  );
}

// ── The palette ──────────────────────────────────────────────────────────

/** The highest palette index any layer uses (0 if every pixel is transparent). */
export function highestUsed(pix: Pix): number {
  let top = 0;
  for (const l of pix.layers) for (let i = 0; i < l.px.length; i++) if (l.px[i] > top) top = l.px[i];
  return top;
}

export function countUses(pix: Pix, index: number): number {
  let n = 0;
  for (const l of pix.layers) for (let i = 0; i < l.px.length; i++) if (l.px[i] === index) n++;
  return n;
}

/** Changes a colour: every pixel of it changes with it. */
export function setColour(pix: Pix, hist: PixHistory, index: number, colour: string): Done {
  return step(
    pix,
    hist,
    () => {
      if (index === 0) return 'colour 0 is always transparent';
      if (index < 0 || index >= pix.pal.length) return 'no such colour';
      const hex = parseHex(colour);
      if (!hex) return `not a colour: ${colour}`;
      pix.pal = pix.pal.map((c, i) => (i === index ? hex : c));
    },
    `colour:${index}`,
  );
}

/** Adds a colour at the end. Returns its index. */
export function addColour(pix: Pix, hist: PixHistory, colour: string): Done {
  return step(pix, hist, () => {
    if (pix.pal.length >= MAX_COLOURS) return `a palette holds at most ${MAX_COLOURS} colours`;
    const hex = parseHex(colour);
    if (!hex) return `not a colour: ${colour}`;
    pix.pal = [...pix.pal, hex];
    return pix.pal.length - 1;
  });
}

/** Takes out a colour no pixel uses; the ones after it move down one place. */
export function removeColour(pix: Pix, hist: PixHistory, index: number): Done {
  if (index <= 0 || index >= pix.pal.length) return { error: index === 0 ? "transparent can't be taken out" : 'no such colour' };
  const used = countUses(pix, index);
  if (used) return { error: `${used} pixel${used === 1 ? ' uses' : 's use'} that colour` };
  return step(pix, hist, () => {
    pix.pal = pix.pal.filter((_, i) => i !== index);
    pix.layers = pix.layers.map((l) => {
      const px = l.px.slice();
      for (let i = 0; i < px.length; i++) if (px[i] > index) px[i]--;
      return { ...l, px };
    });
  });
}

/** Replaces the palette's colours, place by place. Refused if a used colour would have nowhere to go. */
export function usePalette(pix: Pix, hist: PixHistory, colours: readonly string[]): Done {
  const pal = [TRANSPARENT, ...colours.map((c) => parseHex(c) ?? '')];
  if (pal.some((c) => !c)) return { error: 'that palette has something that isn’t a colour' };
  const top = highestUsed(pix);
  if (top >= pal.length) return { error: `the image uses colour ${top}, but that palette has only ${pal.length - 1}` };
  return step(pix, hist, () => {
    pix.pal = pal;
  });
}

// ── The canvas ───────────────────────────────────────────────────────────

/** A new size, with the pixels placed by the anchor: `ax`, `ay` are 0 (left/top), 0.5 (centre) or 1. */
export function resizeCanvas(pix: Pix, hist: PixHistory, w: number, h: number, ax: number, ay: number): Done {
  return step(pix, hist, () => {
    if (![w, h].every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE)) return `a side is 1 to ${MAX_SIDE} pixels`;
    if (w === pix.w && h === pix.h) return 'that is the size it is';
    pix.layers = pix.layers.map((l) => ({ ...l, px: resized(l.px, pix.w, pix.h, w, h, ax, ay) }));
    pix.w = w;
    pix.h = h;
  });
}

export function flipCanvas(pix: Pix, hist: PixHistory, axis: 'h' | 'v'): Done {
  return step(pix, hist, () => {
    pix.layers = pix.layers.map((l) => ({ ...l, px: (axis === 'h' ? flippedH : flippedV)(l.px, pix.w, pix.h) }));
  });
}

export function rotateCanvas(pix: Pix, hist: PixHistory): Done {
  return step(pix, hist, () => {
    pix.layers = pix.layers.map((l) => ({ ...l, px: rotatedCW(l.px, pix.w, pix.h) }));
    [pix.w, pix.h] = [pix.h, pix.w];
  });
}

export { layerById };
