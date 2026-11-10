import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, mockBackend, setIn } from './mock';

describe('setIn', () => {
  it('sets an existing preference and leaves the original alone', () => {
    const next = setIn(DEFAULT_PREFS, 'ldw.pen.color', '#ff0000');
    expect(next.ldw.pen.color).toBe('#ff0000');
    expect(DEFAULT_PREFS.ldw.pen.color).toBe('#111111');
  });

  it('refuses keys that don\'t exist and values of the wrong shape', () => {
    expect(() => setIn(DEFAULT_PREFS, 'colour', 'dark')).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'theme', 'sepia')).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'theme', 3)).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'lpx.defaultSize', 32)).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'ui.showHints', null)).toThrow();
  });

  it('refuses numbers outside the ranges the store enforces', () => {
    expect(() => setIn(DEFAULT_PREFS, 'versions.keep', 0)).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'lpx.defaultSize', [32, 600])).toThrow();
    expect(() => setIn(DEFAULT_PREFS, 'ldw.pen', { color: '#000000', width: 100, opacity: 50 })).toThrow();
    expect(setIn(DEFAULT_PREFS, 'versions.keep', 1000).versions.keep).toBe(1000);
  });

  it('allows null where the preference can be empty', () => {
    expect(setIn(DEFAULT_PREFS, 'library.kind', 'lpx').library.kind).toBe('lpx');
    expect(setIn(DEFAULT_PREFS, 'library.kind', null).library.kind).toBeNull();
  });
});

describe('mockBackend', () => {
  it('keeps preferences until reset', async () => {
    const api = mockBackend();
    await api.setPref('theme', 'dark');
    expect((await api.getPrefs()).theme).toBe('dark');
    expect((await api.resetPref('theme')).theme).toBe('system');
  });
});
