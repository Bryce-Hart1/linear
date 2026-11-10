import { describe, expect, it } from 'vitest';
import {
  Stroke,
  blit,
  brush,
  constrain,
  ellipsePoints,
  extract,
  fillRect,
  flippedH,
  floodFill,
  linePoints,
  rectPoints,
  resized,
  rotatedCW,
  stamp,
  type Paint,
} from './raster';

/** A canvas drawn as rows of digits, and back. */
const grid = (rows: string[]) => Uint8Array.from(rows.join('').split('').map(Number));
const show = (px: Uint8Array, w: number) => Array.from({ length: px.length / w }, (_, y) => [...px.subarray(y * w, y * w + w)].join(''));
const paint = (over: Partial<Paint> = {}): Paint => ({ value: 1, size: 1, round: false, mirrorX: false, mirrorY: false, clip: null, ...over });

describe('brushes', () => {
  it('are squares, or discs when round', () => {
    expect(brush(1, false)).toEqual([{ x: 0, y: 0 }]);
    expect(brush(2, false)).toHaveLength(4);
    expect(brush(3, true)).toHaveLength(5); // a plus
    expect(brush(4, true)).toHaveLength(12); // corners off
    expect(brush(4, false)).toHaveLength(16);
  });
});

describe('lines and shapes', () => {
  it('draws Bresenham lines, ends included', () => {
    expect(linePoints({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
    expect(linePoints({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });

  it('draws rectangles and ellipses, outlined or filled', () => {
    expect(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }, false)).toHaveLength(8);
    expect(rectPoints({ x: 2, y: 2 }, { x: 0, y: 0 }, true)).toHaveLength(9);
    const px = new Uint8Array(25);
    stamp(px, 5, 5, ellipsePoints({ x: 0, y: 0 }, { x: 4, y: 4 }, false), paint());
    expect(show(px, 5)).toEqual(['01110', '10001', '10001', '10001', '01110']);
  });

  it('snaps with ⇧: lines to 45°, boxes to squares', () => {
    expect(constrain({ x: 0, y: 0 }, { x: 5, y: 1 }, 'line')).toEqual({ x: 5, y: 0 });
    expect(constrain({ x: 0, y: 0 }, { x: 5, y: 4 }, 'line')).toEqual({ x: 5, y: 5 });
    expect(constrain({ x: 0, y: 0 }, { x: -3, y: 7 }, 'box')).toEqual({ x: -7, y: 7 });
  });
});

describe('stamp', () => {
  it('mirrors, clips to the selection, and reports what it changed', () => {
    const px = new Uint8Array(16);
    const r = stamp(px, 4, 4, [{ x: 0, y: 1 }], paint({ mirrorX: true, mirrorY: true }));
    expect(show(px, 4)).toEqual(['0000', '1001', '1001', '0000']);
    expect(r).toEqual({ x: 0, y: 1, w: 4, h: 2 });
    const q = new Uint8Array(16);
    // A 2-pixel brush covers the point and the pixels right and below it; the selection cuts the rest off.
    stamp(q, 4, 4, [{ x: 0, y: 0 }, { x: 2, y: 2 }], paint({ size: 2, clip: { x: 1, y: 1, w: 2, h: 2 } }));
    expect(show(q, 4)).toEqual(['0000', '0100', '0010', '0000']);
    expect(stamp(q, 4, 4, [{ x: 1, y: 1 }], paint())).toBeNull();
  });
});

describe('strokes', () => {
  it('join the points they pass through', () => {
    const px = new Uint8Array(25);
    const s = new Stroke(px, 5, 5, paint(), false);
    s.to({ x: 0, y: 0 });
    s.to({ x: 4, y: 0 });
    expect(show(px, 5)[0]).toBe('11111');
    expect(s.dirty).toEqual({ x: 0, y: 0, w: 5, h: 1 });
    expect([...s.before].every((v) => v === 0)).toBe(true);
  });

  it('take out the L-corners when pixel-perfect', () => {
    const steps = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const rough = new Uint8Array(9);
    const a = new Stroke(rough, 3, 3, paint(), false);
    steps.forEach((p) => a.to(p));
    expect(show(rough, 3)).toEqual(['110', '011', '001']);
    const clean = new Uint8Array(9);
    const b = new Stroke(clean, 3, 3, paint(), true);
    steps.forEach((p) => b.to(p));
    expect(show(clean, 3)).toEqual(['100', '010', '001']);
  });

  it("puts back what was there, not blank, when a corner comes out", () => {
    const px = grid(['222', '222', '222']);
    const s = new Stroke(px, 3, 3, paint(), true);
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }].forEach((p) => s.to(p));
    expect(show(px, 3)).toEqual(['122', '212', '222']);
  });
});

describe('flood fill', () => {
  const start = () => grid(['1100', '1001', '0011', '0000']);

  it('fills what touches, side by side', () => {
    const px = start();
    expect(floodFill(px, 4, 4, 0, 0, 2, true)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(show(px, 4)).toEqual(['2200', '2001', '0011', '0000']);
  });

  it('or every pixel of that colour', () => {
    const px = start();
    floodFill(px, 4, 4, 0, 0, 2, false);
    expect(show(px, 4)).toEqual(['2200', '2002', '0022', '0000']);
  });

  it('stays in the selection, and does nothing on its own colour', () => {
    const px = start();
    floodFill(px, 4, 4, 3, 3, 3, true, { x: 2, y: 2, w: 2, h: 2 });
    expect(show(px, 4)).toEqual(['1100', '1001', '0011', '0033']);
    expect(floodFill(px, 4, 4, 0, 0, 1, true)).toBeNull();
  });
});

describe('regions', () => {
  it('extract, clear and lay down blocks; transparent pixels let the layer show through', () => {
    const px = grid(['1234', '5678', '1234']);
    expect(show(extract(px, 4, { x: 1, y: 0, w: 2, h: 2 }), 2)).toEqual(['23', '67']);
    fillRect(px, 4, 3, { x: 2, y: 1, w: 5, h: 5 }, 0);
    expect(show(px, 4)).toEqual(['1234', '5600', '1200']);
    blit(px, 4, 3, grid(['90', '09']), 2, 2, 2, 1);
    expect(show(px, 4)).toEqual(['1234', '5690', '1209']);
  });
});

describe('the whole canvas', () => {
  const px = grid(['12', '34', '56']);

  it('resizes around an anchor', () => {
    expect(show(resized(px, 2, 3, 4, 3, 0.5, 0), 4)).toEqual(['0120', '0340', '0560']);
    expect(show(resized(px, 2, 3, 1, 1, 1, 1), 1)).toEqual(['6']);
  });

  it('flips and turns', () => {
    expect(show(flippedH(px, 2, 3), 2)).toEqual(['21', '43', '65']);
    expect(show(rotatedCW(px, 2, 3), 3)).toEqual(['531', '642']);
  });
});
