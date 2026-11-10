import { describe, expect, it } from 'vitest';
import { MockLibrary, cleanName, freeName } from './mock-library';

describe('names, as linear-store keeps them', () => {
  it('cleans a name', () => {
    expect(cleanName('  Plan.LIN ', 'lin')).toBe('Plan');
    expect(cleanName('Plan.lin', 'lpx')).toBe('Plan.lin');
    expect(() => cleanName('  ', 'lin')).toThrow();
    expect(() => cleanName('a/b', 'lin')).toThrow();
  });

  it('finds the next free name', () => {
    expect(freeName([], 'Plan')).toBe('Plan');
    expect(freeName(['plan'], 'Plan')).toBe('Plan 2');
    expect(freeName(['plan', 'plan 2'], 'Plan 2')).toBe('Plan 3');
  });
});

describe('MockLibrary', () => {
  it('behaves like the store for the things the library shows', () => {
    const lib = new MockLibrary(false);
    const a = lib.createDocument({ name: 'Plan', kind: 'lin', folder: null, content: 'v1' });
    const b = lib.createDocument({ name: 'plan', kind: 'lin', folder: null, content: 'v1' });
    expect(b.name).toBe('plan 2');
    expect(lib.saveDocument(a.id, 'v1').status).toBe('unchanged');
    expect(lib.saveDocument(a.id, 'v2').status).toBe('saved');
    expect(lib.listVersions(a.id)).toHaveLength(2);

    lib.trashDocument(a.id);
    expect(lib.listDocuments({ view: 'all' }).map((d) => d.name)).toEqual(['plan 2']);
    expect(lib.listDocuments({ view: 'trash' }).map((d) => d.name)).toEqual(['Plan']);
    expect(lib.emptyTrash()).toBe(1);

    const f = lib.createFolder(null, 'Work');
    lib.moveDocument(b.id, f.id);
    expect(lib.deleteFolder(f.id)).toBe(1);
    expect(lib.listDocuments({ view: 'folder', folder: null }).map((d) => d.name)).toEqual(['plan 2']);
  });

  it('starts with samples in every view', () => {
    const lib = new MockLibrary();
    for (const view of ['all', 'recent', 'pinned', 'trash'] as const) expect(lib.listDocuments({ view }).length).toBeGreaterThan(0);
  });
});
