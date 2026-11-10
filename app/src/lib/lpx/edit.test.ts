import { describe, expect, it } from 'vitest';
import { addColour, addLayer, deleteLayer, mergeDown, moveLayer, removeColour, resizeCanvas, rotateCanvas, setColour, setLayer, usePalette } from './edit';
import { parseLpx, serializeLpx } from './format';
import { PixHistory } from './history';
import { blankPix } from './model';
import { Stroke, extract, type Paint } from './raster';
import { flatten, indexAt } from './render';

const paint = (value: number): Paint => ({ value, size: 1, round: false, mirrorX: false, mirrorY: false, clip: null });
const start = () => blankPix(3, 2, ['#000000', '#ff0000', '#0000ff']);
const ok = (r: { ok?: true; error?: string }) => {
  if ('error' in r) throw new Error(r.error);
  return r as { ok: true; id?: number };
};

/** One stroke from a to b on a layer, recorded the way the editor records it. */
function draw(pix: ReturnType<typeof start>, hist: PixHistory, layer: number, value: number, pts: { x: number; y: number }[]) {
  const l = pix.layers.find((x) => x.id === layer)!;
  const s = new Stroke(l.px, pix.w, pix.h, paint(value), false);
  pts.forEach((p) => s.to(p));
  hist.pixels(layer, s.dirty!, extract(s.before, pix.w, s.dirty!), extract(l.px, pix.w, s.dirty!));
}

describe('history', () => {
  it('undoes and redoes strokes and layer changes in order', () => {
    const pix = start();
    const hist = new PixHistory();
    draw(pix, hist, 1, 1, [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
    const top = ok(addLayer(pix, hist, 1)).id!;
    draw(pix, hist, top, 2, [{ x: 1, y: 1 }]);
    const saved = serializeLpx(pix);
    expect(pix.layers).toHaveLength(2);

    hist.undo(pix);
    expect(indexAt(pix, 1, 1)).toBe(0);
    hist.undo(pix);
    expect(pix.layers).toHaveLength(1);
    hist.undo(pix);
    expect(indexAt(pix, 0, 0)).toBe(0);
    expect(hist.canUndo).toBe(false);

    hist.redo(pix);
    hist.redo(pix);
    hist.redo(pix);
    expect(serializeLpx(pix)).toBe(saved);
  });

  it('marks where the image is, so "modified" survives an undo back to the save', () => {
    const pix = start();
    const hist = new PixHistory();
    draw(pix, hist, 1, 1, [{ x: 0, y: 0 }]);
    const saved = hist.mark;
    draw(pix, hist, 1, 2, [{ x: 1, y: 0 }]);
    expect(hist.mark).not.toBe(saved);
    hist.undo(pix);
    expect(hist.mark).toBe(saved);
  });

  it('makes a dragged opacity slider one step', () => {
    const pix = start();
    const hist = new PixHistory();
    for (const op of [90, 70, 40]) setLayer(pix, hist, 1, { op });
    expect(pix.layers[0].op).toBe(40);
    hist.undo(pix);
    expect(pix.layers[0].op).toBe(100);
  });
});

describe('layers', () => {
  it('refuse to go below one, or past the ends', () => {
    const pix = start();
    const hist = new PixHistory();
    expect(deleteLayer(pix, hist, 1)).toEqual({ error: 'an image needs at least one layer' });
    expect(moveLayer(pix, hist, 1, 1)).toEqual({ error: 'already the top layer' });
    expect(mergeDown(pix, hist, 1)).toHaveProperty('error');
    expect(hist.canUndo).toBe(false);
  });

  it('merge down: the upper layer covers the lower where it has colour', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px.set([1, 1, 1, 1, 1, 1]);
    const top = ok(addLayer(pix, hist, null)).id!;
    pix.layers[1].px.set([0, 2, 0, 0, 3, 0]);
    ok(mergeDown(pix, hist, top));
    expect(pix.layers).toHaveLength(1);
    expect([...pix.layers[0].px]).toEqual([1, 2, 1, 1, 3, 1]);
    hist.undo(pix);
    expect(pix.layers).toHaveLength(2);
    expect([...pix.layers[0].px]).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('the palette', () => {
  it('changes a colour everywhere it is used', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px[0] = 2;
    ok(setColour(pix, hist, 2, '#00ff00'));
    expect([...flatten(pix).subarray(0, 4)]).toEqual([0, 255, 0, 255]);
    expect(setColour(pix, hist, 0, '#fff')).toHaveProperty('error');
  });

  it('takes out only unused colours, moving later ones down', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px.set([3, 0, 0, 0, 0, 0]);
    expect(removeColour(pix, hist, 3)).toEqual({ error: '1 pixel uses that colour' });
    ok(removeColour(pix, hist, 1));
    expect(pix.pal).toHaveLength(3);
    expect(pix.layers[0].px[0]).toBe(2);
    expect(pix.pal[2]).toBe('#0000ffff');
  });

  it('swaps in another palette only if every used colour has a place', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px[0] = 3;
    expect(usePalette(pix, hist, ['#000', '#fff'])).toHaveProperty('error');
    ok(usePalette(pix, hist, ['#111', '#222', '#333']));
    ok(addColour(pix, hist, '#444'));
    expect(pix.pal).toEqual(['#00000000', '#111111ff', '#222222ff', '#333333ff', '#444444ff']);
  });
});

describe('the canvas', () => {
  it('resizes and turns every layer, and still writes a valid file', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px.set([1, 2, 3, 0, 0, 0]);
    ok(rotateCanvas(pix, hist));
    expect([pix.w, pix.h]).toEqual([2, 3]);
    expect([...pix.layers[0].px]).toEqual([0, 1, 0, 2, 0, 3]);
    ok(resizeCanvas(pix, hist, 4, 3, 0, 0));
    const back = parseLpx(serializeLpx(pix));
    expect([back.w, back.h]).toEqual([4, 3]);
    hist.undo(pix);
    hist.undo(pix);
    expect([pix.w, pix.h, ...pix.layers[0].px]).toEqual([3, 2, 1, 2, 3, 0, 0, 0]);
  });
});

describe('flatten', () => {
  it('lays visible layers over each other with their opacity', () => {
    const pix = start();
    const hist = new PixHistory();
    pix.layers[0].px[0] = 1; // black
    const top = ok(addLayer(pix, hist, null)).id!;
    pix.layers[1].px[0] = 2; // red
    setLayer(pix, hist, top, { op: 50 });
    expect([...flatten(pix).subarray(0, 4)]).toEqual([128, 0, 0, 255]);
    setLayer(pix, hist, top, { show: false });
    expect([...flatten(pix).subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(indexAt(pix, 0, 0)).toBe(1);
  });
});
