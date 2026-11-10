import { describe, expect, it } from 'vitest';
import { LazyPen, boxFrom, ellipsePts, inPolygon, lassoed, linePts, onStroke, pathData, rectPts, segments, simplify, strokeAt, strokeBox } from './geometry';
import { blankDrawing, type Stroke } from './model';

const stroke = (id: number, pts: number[], w = 4, z = false): Stroke => ({ id, t: 'pen', c: '#111111', w, o: 100, z, pts });

describe('the curve through a stroke', () => {
  it('is a dot for one point, a line for two, and midpoint curves for more', () => {
    expect(pathData(segments([5, 5], false))).toBe('M5 5 L5 5');
    expect(pathData(segments([0, 0, 10, 0], false))).toBe('M0 0 L10 0');
    expect(pathData(segments([0, 0, 10, 0, 10, 10], false))).toBe('M0 0 Q10 0 10 5 L10 10');
  });

  it('goes all the way round when closed', () => {
    expect(pathData(segments([0, 0, 10, 0, 10, 10], true))).toBe('M5 5 Q0 0 5 0 Q10 0 10 5 Q10 10 5 5 Z');
  });
});

describe('drawing a stroke', () => {
  it('steadies the pointer on a string', () => {
    const pen = new LazyPen(10);
    expect(pen.to({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(pen.to({ x: 6, y: 0 })).toEqual({ x: 0, y: 0 }); // within the string: no pull
    expect(pen.to({ x: 25, y: 0 })).toEqual({ x: 15, y: 0 });
    expect(new LazyPen(0).to({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('keeps only the points that matter', () => {
    const wobbly = [0, 0.2, 1, 2, 2.3, 3, 4, 4.8, 5, 6].map((x, i) => ({ x: i, y: x * 0 + (i % 2 ? 0.1 : 0) }));
    expect(simplify(wobbly, 0.5)).toEqual([wobbly[0], wobbly[9]]);
    const corner = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ];
    expect(simplify(corner, 0.5)).toEqual([corner[0], corner[2], corner[4]]);
  });
});

describe('shapes', () => {
  it('snap lines to 45° and boxes to squares', () => {
    const [, b] = linePts({ x: 0, y: 0 }, { x: 10, y: 1 }, true);
    expect(b.x).toBeCloseTo(Math.hypot(10, 1));
    expect(b.y).toBeCloseTo(0);
    expect(boxFrom({ x: 10, y: 10 }, { x: 0, y: 4 }, true)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });

  it('keep a rectangle sharp and an ellipse in its box', () => {
    expect(rectPts({ x: 0, y: 0, w: 4, h: 2 })).toHaveLength(8);
    const e = ellipsePts({ x: 0, y: 0, w: 20, h: 10 });
    expect(Math.max(...e.map((p) => p.x))).toBeCloseTo(20);
    expect(Math.min(...e.map((p) => p.y))).toBeCloseTo(0);
  });
});

describe('finding strokes', () => {
  const d = { ...blankDrawing(), items: [stroke(1, [0, 0, 100, 0]), stroke(2, [50, -20, 50, 20], 10)] };

  it('within half the width, plus slop; front-most first', () => {
    expect(onStroke(d.items[0], { x: 40, y: 3 }, 0)).toBe(false);
    expect(onStroke(d.items[0], { x: 40, y: 3 }, 2)).toBe(true);
    expect(strokeAt(d, { x: 50, y: 0 }, 1)?.id).toBe(2);
    expect(strokeAt(d, { x: 10, y: 50 }, 1)).toBeNull();
    expect(strokeBox(d.items[1])).toEqual({ x: 45, y: -25, w: 10, h: 50 });
  });

  it('by lasso: strokes mostly inside', () => {
    const square = [
      { x: -10, y: -10 },
      { x: 60, y: -10 },
      { x: 60, y: 10 },
      { x: -10, y: 10 },
    ];
    expect(inPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(inPolygon({ x: 100, y: 0 }, square)).toBe(false);
    // Stroke 1 has one of its two points inside: half counts. Stroke 2 has neither.
    expect(lassoed(d, square)).toEqual([1]);
  });
});
