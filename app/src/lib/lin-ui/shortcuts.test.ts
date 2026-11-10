import { describe, expect, it } from 'vitest';
import { commandFor } from '../lin/keys';
import { LIN_SHORTCUTS } from './shortcuts';

const press = (key: string, mods: { meta?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  code: /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : key,
  metaKey: !!mods.meta,
  ctrlKey: false,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('the .lin shortcut sheet', () => {
  it("lists single keys that keys.ts really maps, in the mode they're listed for", () => {
    const edit = { edit: true, typing: false, multiline: false };
    const checks: [string, string][] = [
      ['e', 'edit'],
      ['z', 'zoom'],
      ['x', 'export'],
      ['r', 'arm'],
      ['l', 'arm'],
      ['g', 'grid'],
      ['w', 'style'],
      ['a', 'head'],
      ['f', 'flip'],
      ['b', 'route'],
      ['m', 'pulse'],
      ['s', 'glow'],
      ['[', 'order'],
      ['{', 'order'],
    ];
    for (const [key, does] of checks) expect(commandFor(press(key), edit)?.do, key).toBe(does);
    expect(commandFor(press(' '), { edit: false, typing: false })?.do).toBe('play');
    const listed = LIN_SHORTCUTS.flatMap((g) => g.rows.map((r) => r.keys)).join(' ');
    for (const k of ['e', 'space', 'z', 'x', 'g', 'w', 'a', 'f', 'b', 'm', 's']) expect(listed.split(/\s+/)).toContain(k);
  });
});
