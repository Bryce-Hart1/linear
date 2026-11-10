import { describe, expect, it } from 'vitest';
import { parseLin, serializeLin } from '../lin/format';
import { blankDoc, newLine, newShape, type Doc } from '../lin/model';
import { setHead, setPulse, setRoute, setSize, setStroke } from './set';

function doc(...items: Doc['items']): Doc {
  return { ...blankDoc(), items, next: items.length + 1 };
}

describe('setSize', () => {
  it('sizes a shape, clamped to 24–800, keeping a circle round', () => {
    const d = doc(newShape(1, 'rect', 600, 400), newShape(2, 'circle', 300, 300));
    const r = setSize(d, 1, 300.04, 5);
    expect('doc' in r && r.doc.items[0]).toMatchObject({ w: 300, h: 24 });
    const c = setSize(d, 2, 150, 90);
    expect('doc' in c && c.doc.items[1]).toMatchObject({ w: 150, h: 150 });
    const big = setSize(d, 1, 5000, 5000);
    expect('doc' in big && big.doc.items[0]).toMatchObject({ w: 800, h: 800 });
  });

  it('keeps the shape on the page', () => {
    const d = doc(newShape(1, 'rect', 100, 100));
    const r = setSize(d, 1, 400, 100);
    expect('doc' in r && r.doc.items[0]).toMatchObject({ x: 200 });
  });

  it("refuses a size the text wouldn't fit in", () => {
    const s = { ...newShape(1, 'rect', 600, 400), text: 'twenty letters here' };
    expect(setSize(doc(s), 1, 40, 30)).toEqual({ error: "the text wouldn't fit in a smaller shape" });
  });

  it('writes plain v1', () => {
    const r = setSize(doc(newShape(1, 'rect', 600, 400)), 1, 211.37, 99.99);
    if (!('doc' in r)) throw new Error('refused');
    const text = serializeLin(r.doc);
    expect(serializeLin(parseLin(text))).toBe(text);
  });
});

describe('set to a value', () => {
  const d = doc(newShape(1, 'rect', 300, 300), newShape(2, 'rect', 800, 300), newLine(3, { to: 1 }, { to: 2 }));

  it('sets a line property outright', () => {
    for (const head of ['both', 'none', 'end'] as const) {
      const r = setHead(d, 3, head);
      expect('doc' in r && r.doc.items[2]).toMatchObject({ head });
    }
    const p = setPulse(d, 3, 'mid');
    expect('doc' in p && p.doc.items[2]).toMatchObject({ pulse: 'mid' });
    const q = setRoute(d, 3, 'elbow');
    expect('doc' in q && q.doc.items[2]).toMatchObject({ route: 'elbow' });
  });

  it('leaves the doc alone when it already has the value', () => {
    const r = setHead(d, 3, 'none');
    expect('doc' in r && r.doc).toBe(d);
  });

  it('sets an outline on a shape or a line, and refuses a line setting on a shape', () => {
    const r = setStroke(d, 1, 'dot');
    expect('doc' in r && r.doc.items[0]).toMatchObject({ ln: 'dot' });
    expect(setHead(d, 1, 'end')).toHaveProperty('error');
  });
});
