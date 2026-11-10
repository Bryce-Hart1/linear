import { describe, expect, it } from 'vitest';
import { LPX_SHORTCUTS, TOOL_KEYS, pixCommandFor } from './keys';

const k = (key: string, m: { meta?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  shiftKey: !!m.shift,
  metaKey: !!m.meta,
  ctrlKey: false,
  altKey: !!m.alt,
});

describe('pixel editor keys', () => {
  it('pick tools by letter, with Caps Lock too', () => {
    expect(pixCommandFor(k('b'))).toEqual({ do: 'tool', tool: 'pencil' });
    expect(pixCommandFor(k('G'))).toEqual({ do: 'tool', tool: 'fill' });
  });

  it('handle colours, brush size and nudging', () => {
    expect(pixCommandFor(k('x'))).toEqual({ do: 'swap' });
    expect(pixCommandFor(k('3'))).toEqual({ do: 'colour', index: 3 });
    expect(pixCommandFor(k(']'))).toEqual({ do: 'size', by: 1 });
    expect(pixCommandFor(k('ArrowLeft', { shift: true }))).toEqual({ do: 'nudge', dx: -10, dy: 0 });
  });

  it('take ⌘ chords, and leave ⌥ for the eyedropper', () => {
    expect(pixCommandFor(k('z', { meta: true, shift: true }))).toEqual({ do: 'redo' });
    expect(pixCommandFor(k('x', { meta: true }))).toEqual({ do: 'cut' });
    expect(pixCommandFor(k('b', { alt: true }))).toBeNull();
  });

  it('list every tool key on the sheet', () => {
    const listed = LPX_SHORTCUTS[0].rows.map((r) => r.keys);
    expect(listed.sort()).toEqual(Object.keys(TOOL_KEYS).sort());
  });
});
