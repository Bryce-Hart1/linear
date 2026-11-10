import { describe, expect, it } from 'vitest';
import { parseLdw, serializeLdw } from './format';
import { blankDrawing, type Drawing } from './model';

const sample = (): Drawing => ({
  ...blankDrawing(),
  next: 3,
  items: [
    { id: 1, t: 'pen', c: '#111111', w: 3, o: 100, z: false, pts: [120.5, 88, 121, 90.5] },
    { id: 2, t: 'hl', c: '#f7c948', w: 16, o: 35, z: true, pts: [10, 10, 50, 10, 50, 40] },
  ],
});

describe('.ldw files', () => {
  it('write one stroke per line, leaving out defaults', () => {
    expect(serializeLdw(sample())).toBe(
      '{"ldw":1,"w":1600,"h":1000,"bg":"#ffffff","next":3,"items":[\n' +
        ' {"id":1,"t":"pen","c":"#111111","w":3,"pts":[120.5,88,121,90.5]},\n' +
        ' {"id":2,"t":"hl","c":"#f7c948","w":16,"o":35,"z":true,"pts":[10,10,50,10,50,40]}\n' +
        ']}\n',
    );
    expect(serializeLdw(blankDrawing())).toBe('{"ldw":1,"w":1600,"h":1000,"bg":"#ffffff","next":1,"items":[]}\n');
  });

  it('round-trip', () => {
    const text = serializeLdw(sample());
    expect(serializeLdw(parseLdw(text))).toBe(text);
    expect(parseLdw(text)).toEqual(sample());
  });

  it('are forgiving about numbers', () => {
    const d = parseLdw(
      JSON.stringify({ ldw: 1, w: 50, h: 99999, bg: '#FFF', items: [{ id: 4, t: 'pen', c: '#ABC', w: 500, o: 0, pts: [1.234, 5.678] }] }),
    );
    expect([d.w, d.h, d.bg, d.next]).toEqual([200, 8000, '#ffffff', 5]);
    expect(d.items[0]).toMatchObject({ c: '#aabbcc', w: 64, o: 1, pts: [1.2, 5.7] });
  });

  it('are strict about structure, naming the item', () => {
    const one = (item: object) => JSON.stringify({ ldw: 1, items: [item] });
    const ok = { id: 1, t: 'pen', c: '#000000', w: 2, pts: [0, 0] };
    expect(() => parseLdw('nope')).toThrow('not a .ldw drawing');
    expect(() => parseLdw('{"ldw":2,"items":[]}')).toThrow('newer');
    expect(() => parseLdw('{"ldw":1}')).toThrow('items');
    expect(() => parseLdw(one({ ...ok, t: 'brush' }))).toThrow('item 1: t');
    expect(() => parseLdw(one({ ...ok, c: 'red' }))).toThrow('item 1: c');
    expect(() => parseLdw(one({ ...ok, pts: [1] }))).toThrow('item 1: pts');
    expect(() => parseLdw(one({ ...ok, pts: [] }))).toThrow('item 1: pts');
    expect(() => parseLdw(one({ ...ok, z: 'yes' }))).toThrow('item 1: z');
    expect(() => parseLdw(JSON.stringify({ ldw: 1, items: [ok, ok] }))).toThrow('item 2: id 1 is used twice');
    expect(() => parseLdw(JSON.stringify({ ldw: 1, bg: 'paper', items: [] }))).toThrow('bg');
  });
});
