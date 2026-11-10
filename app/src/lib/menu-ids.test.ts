import { describe, expect, it } from 'vitest';
import { ACCELERATORS, acceleratorOf, menuIdFor } from './menu-ids';

const key = (code: string, mods: Partial<{ meta: boolean; ctrl: boolean; shift: boolean; alt: boolean }> = {}) => ({
  code,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('acceleratorOf', () => {
  it('needs ⌘ on a Mac and Ctrl elsewhere', () => {
    expect(acceleratorOf(key('KeyS'), true)).toBeNull();
    expect(acceleratorOf(key('KeyS', { ctrl: true }), true)).toBeNull();
    expect(acceleratorOf(key('KeyS', { meta: true }), true)).toBe('mod+s');
    expect(acceleratorOf(key('KeyS', { ctrl: true }), false)).toBe('mod+s');
  });

  it('reads the physical key, so ⌥ combinations work', () => {
    expect(acceleratorOf(key('KeyI', { meta: true, alt: true }), true)).toBe('mod+alt+i');
    expect(acceleratorOf(key('KeyZ', { meta: true, shift: true }), true)).toBe('mod+shift+z');
    expect(acceleratorOf(key('Digit0', { meta: true }), true)).toBe('mod+0');
    expect(acceleratorOf(key('Equal', { meta: true }), true)).toBe('mod+=');
    expect(acceleratorOf(key('Backslash', { meta: true }), true)).toBe('mod+\\');
  });

  it('falls back to the character when the event has no code', () => {
    expect(acceleratorOf({ ...key('', { meta: true }), key: '\\' }, true)).toBe('mod+\\');
    expect(acceleratorOf({ ...key('', { meta: true, shift: true }), key: 'Z' }, true)).toBe('mod+shift+z');
    expect(acceleratorOf({ ...key('', { meta: true, alt: true }), key: 'ˆ' }, true)).toBeNull();
  });

  it('ignores keys menus never use', () => {
    expect(acceleratorOf(key('ArrowLeft', { meta: true }), true)).toBeNull();
    expect(acceleratorOf(key('F5', { meta: true }), true)).toBeNull();
  });
});

describe('menuIdFor', () => {
  it('finds the menu item a press triggers', () => {
    expect(menuIdFor(key('KeyZ', { meta: true }), true)).toBe('undo');
    expect(menuIdFor(key('KeyZ', { meta: true, shift: true }), true)).toBe('redo');
    expect(menuIdFor(key('Comma', { meta: true }), true)).toBe('settings');
    expect(menuIdFor(key('KeyC', { meta: true }), true)).toBeNull(); // the system's Copy, not ours
  });

  it('has no two items on one key', () => {
    const keys = Object.values(ACCELERATORS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
