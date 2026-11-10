import { describe, expect, it } from 'vitest';
import { History, addStroke, moveStrokes, pasteStrokes, removeStrokes, reorder, restyle, scaleStrokes, setPage } from './edit';
import { exportBox, exportSvg } from './draw';
import { parseLdw, serializeLdw } from './format';
import { DRAW_TOOL_KEYS, LDW_SHORTCUTS, drawCommandFor } from './keys';
import { blankDrawing } from './model';

const ink = { t: 'pen' as const, c: '#111111', w: 4, o: 100 };

function two() {
  let d = blankDrawing();
  d = addStroke(d, ink, [{ x: 10, y: 10 }, { x: 50.04, y: 10 }]).d;
  d = addStroke(d, { ...ink, t: 'hl', c: '#f7c948', w: 16, o: 35 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], true).d;
  return d;
}

describe('editing a drawing', () => {
  it('adds strokes with fresh ids, rounded, and writes a valid file', () => {
    const d = two();
    expect(d.items.map((s) => s.id)).toEqual([1, 2]);
    expect(d.items[0].pts).toEqual([10, 10, 50, 10]);
    expect(serializeLdw(parseLdw(serializeLdw(d)))).toBe(serializeLdw(d));
  });

  it('moves, restyles, reorders, removes, pastes and scales without touching the original', () => {
    const d = two();
    expect(moveStrokes(d, [1], 5, -5).items[0].pts).toEqual([15, 5, 55.0, 5]);
    expect(restyle(d, [1, 2], { c: '#e5484d', w: 500, o: 0 }).items.map((s) => [s.c, s.w, s.o])).toEqual([
      ['#e5484d', 64, 1],
      ['#e5484d', 64, 1],
    ]);
    expect(reorder(d, [1], 'front').items.map((s) => s.id)).toEqual([2, 1]);
    expect(removeStrokes(d, [1]).items.map((s) => s.id)).toEqual([2]);
    const p = pasteStrokes(d, [d.items[0]], 20, 20);
    expect(p.ids).toEqual([3]);
    expect(p.d.items[2].pts).toEqual([30, 30, 70, 30]);
    const big = scaleStrokes(d, [1], 2);
    expect(big.items[0]).toMatchObject({ w: 8, pts: [-10, 10, 70, 10] });
    expect(d.items[0].pts).toEqual([10, 10, 50, 10]);
  });

  it('refuses a page size out of range', () => {
    expect(setPage(blankDrawing(), { w: 100 })).toHaveProperty('error');
    expect(setPage(blankDrawing(), { w: 800, bg: 'none' })).toMatchObject({ d: { w: 800, bg: 'none' } });
  });

  it('undoes and redoes', () => {
    const h = new History();
    const a = blankDrawing();
    const b = two();
    h.push(a);
    expect(h.undo(b)).toBe(a);
    expect(h.redo(a)).toBe(b);
  });
});

describe('exporting', () => {
  it('crops to what is drawn plus a margin, or takes the whole page', () => {
    const d = two();
    // The strokes cover x −8…52 and y −8…18 (widths included); then 32 px all round.
    expect(exportBox(d, false)).toEqual({ x: -40, y: -40, w: 124, h: 90 });
    expect(exportBox(d, true)).toEqual({ x: 0, y: 0, w: 1600, h: 1000 });
    expect(exportBox(blankDrawing(), false)).toBeNull();
  });

  it('writes one path per stroke in SVG', () => {
    const svg = exportSvg(two(), false);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('stroke-opacity="0.35"');
    expect(svg).toContain('Z"');
    expect(svg).toContain('<rect');
    expect(exportSvg({ ...two(), bg: 'none' }, true)).not.toContain('<rect');
  });
});

describe('drawing keys', () => {
  it('pick tools and act on the selection', () => {
    const k = (key: string, meta = false) => ({ key, metaKey: meta, ctrlKey: false, shiftKey: false, altKey: false });
    expect(drawCommandFor(k('p'))).toEqual({ do: 'tool', tool: 'pen' });
    expect(drawCommandFor(k('d', true))).toEqual({ do: 'duplicate' });
    expect(drawCommandFor(k('Backspace'))).toEqual({ do: 'delete' });
    const listed = LDW_SHORTCUTS[0].rows.map((r) => r.keys).filter((x) => x.length === 1);
    expect(listed.sort()).toEqual(Object.keys(DRAW_TOOL_KEYS).sort());
  });
});
