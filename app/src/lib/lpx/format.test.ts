import { describe, expect, it } from 'vitest';
import { parseLpx, serializeLpx } from './format';
import { blankLayer, blankPix, parseHex, presetById, rgba } from './model';

const pix = () => {
  const p = blankPix(4, 3, ['#000', '#ff0000']);
  p.layers[0].px.set([0, 1, 2, 0, 1, 1, 1, 1, 2, 0, 0, 2]);
  const ink = blankLayer(2, 4, 3, 'Ink');
  ink.px[5] = 2;
  ink.op = 40;
  ink.show = false;
  p.layers.push(ink);
  p.next = 3;
  return p;
};

describe('colours', () => {
  it('reads #rgb, #rrggbb and #rrggbbaa', () => {
    expect(parseHex('#F00')).toBe('#ff0000ff');
    expect(parseHex('#12a594')).toBe('#12a594ff');
    expect(parseHex('#12a59480')).toBe('#12a59480');
    expect(parseHex('red')).toBeNull();
    expect(rgba('#12a59480')).toEqual([0x12, 0xa5, 0x94, 0x80]);
  });

  it('starts every palette with transparent', () => {
    expect(blankPix(8, 8, presetById('onebit')!.colours).pal).toEqual(['#00000000', '#000000ff', '#ffffffff']);
  });
});

describe('.lpx files', () => {
  it('round-trip, one layer per line', () => {
    const text = serializeLpx(pix());
    const lines = text.split('\n');
    expect(lines[0]).toBe('{"lpx":1,"w":4,"h":3,"next":3,"pal":["#00000000","#000000ff","#ff0000ff"],"layers":[');
    expect(lines).toHaveLength(5);
    expect(lines.at(-2)).toBe(']}');
    const back = parseLpx(text);
    expect([...back.layers[0].px]).toEqual([0, 1, 2, 0, 1, 1, 1, 1, 2, 0, 0, 2]);
    expect(back.layers[1]).toMatchObject({ id: 2, name: 'Ink', show: false, lock: false, op: 40 });
    expect(serializeLpx(back)).toBe(text);
  });

  it('compresses an empty 512 × 512 layer (256 KiB) to under 1 KB', () => {
    expect(serializeLpx(blankPix(512, 512, ['#000'])).length).toBeLessThan(700);
  });

  it('is forgiving about numbers', () => {
    const raw = JSON.parse(serializeLpx(pix()).replace(/\n/g, ''));
    raw.layers[1].op = 250;
    raw.layers[1].name = 'x'.repeat(90);
    delete raw.next;
    raw.pal[0] = '#ff0000';
    const back = parseLpx(JSON.stringify(raw));
    expect(back.layers[1].op).toBe(100);
    expect(back.layers[1].name).toHaveLength(40);
    expect(back.next).toBe(3);
    expect(back.pal[0]).toBe('#00000000');
  });

  it('is strict about structure, and names the layer', () => {
    const base = () => JSON.parse(serializeLpx(pix()).replace(/\n/g, ''));
    const fails = (change: (r: ReturnType<typeof base>) => void, message: RegExp) => {
      const r = base();
      change(r);
      expect(() => parseLpx(JSON.stringify(r))).toThrow(message);
    };
    expect(() => parseLpx('nope')).toThrow('not a .lpx image');
    fails((r) => (r.lpx = 2), /newer linear/);
    fails((r) => (r.w = 600), /w must be/);
    fails((r) => (r.pal = []), /pal must/);
    fails((r) => (r.pal[1] = 'black'), /colour 1/);
    fails((r) => (r.layers = []), /at least one layer/);
    fails((r) => (r.layers[1].id = 1), /layer 2: id 1 is used twice/);
    fails((r) => (r.layers[1].px = 'AAAA'), /layer 2/);
    fails((r) => (r.pal = r.pal.slice(0, 2)), /layer 1: uses colour 2, but the palette has 2/);
    fails((r) => (r.layers[0].show = 'yes'), /layer 1: show/);
  });
});
