import { describe, expect, it } from 'vitest';
import { newShape } from '../lin/model';
import { dotAt, dotPoint, handleAt, handlePoint, resizeTo } from './handles';

const rect = newShape(1, 'rect', 500, 400); // 160 × 80: x 420–580, y 360–440

describe('handles', () => {
  it('sit on the corners and side middles', () => {
    expect(handlePoint(rect, 'nw')).toEqual({ x: 420, y: 360 });
    expect(handlePoint(rect, 'e')).toEqual({ x: 580, y: 400 });
    expect(handleAt(rect, { x: 583, y: 402 }, 8)).toBe('e');
    expect(handleAt(rect, { x: 500, y: 400 }, 8)).toBeNull();
  });

  it('keep the opposite edge put', () => {
    const r = resizeTo(rect, 'e', { x: 620, y: 999 }, false);
    expect(r).toEqual({ w: 200, h: 80, at: { x: 520, y: 400 } });
    const c = resizeTo(rect, 'nw', { x: 400, y: 340 }, false);
    expect(c).toEqual({ w: 180, h: 100, at: { x: 490, y: 390 } });
  });

  it('keep the centre put with ⌥', () => {
    expect(resizeTo(rect, 'e', { x: 620, y: 400 }, true)).toEqual({ w: 240, h: 80, at: { x: 500, y: 400 } });
  });

  it('stop at the smallest size without moving the anchored edge', () => {
    const r = resizeTo(rect, 'e', { x: 300, y: 400 }, false);
    expect(r.w).toBe(24);
    expect(r.at.x - r.w / 2).toBe(420);
  });

  it('keep a circle round', () => {
    const c = newShape(2, 'circle', 300, 300); // 100: 250–350
    const r = resizeTo(c, 'se', { x: 400, y: 380 }, false);
    expect(r).toEqual({ w: 150, h: 150, at: { x: 325, y: 325 } });
  });
});

describe('connector dots', () => {
  it('sit on the outline, one per side', () => {
    expect(dotPoint(rect, 'n')).toEqual({ x: 500, y: 360 });
    expect(dotPoint(rect, 'w')).toEqual({ x: 420, y: 400 });
    expect(dotAt(rect, { x: 579, y: 401 }, 6)).toBe('e');
    // Drawn outside the outline, off the resize handles.
    expect(dotAt(rect, { x: 594, y: 400 }, 6, 14)).toBe('e');
    expect(dotAt(rect, { x: 580, y: 400 }, 6, 14)).toBeNull();
  });
});
