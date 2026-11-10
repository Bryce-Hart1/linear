import { afterEach, describe, expect, it } from 'vitest';
import type { MenuId } from './menu-ids';
import { isTextField, onMenu, route, watchMenu } from './menu-router';

const input = (type = 'text') => ({ tagName: 'INPUT', type }) as unknown as Element;
const div = { tagName: 'DIV', isContentEditable: false } as unknown as Element;
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));

describe('isTextField', () => {
  it('knows what takes typed text', () => {
    expect(isTextField(input())).toBe(true);
    expect(isTextField(input('search'))).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextField(input('checkbox'))).toBe(false);
    expect(isTextField(input('range'))).toBe(false);
    expect(isTextField({ tagName: 'CANVAS' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('route', () => {
  it('gives undo in a text field to the field', () => {
    const ran: string[] = [];
    cleanup.push(onMenu(() => true));
    expect(route('undo', input(), (c) => ran.push(c))).toBe('text');
    expect(ran).toEqual(['undo']);
  });

  it('gives commands that aren\'t text editing to the handlers even in a text field', () => {
    const got: MenuId[] = [];
    cleanup.push(onMenu((id) => (got.push(id), true)));
    expect(route('save', input(), () => {})).toBe('handled');
    expect(got).toEqual(['save']);
  });

  it('asks the newest handler first and stops at the first that handles it', () => {
    const order: string[] = [];
    cleanup.push(onMenu(() => (order.push('shell'), true)));
    cleanup.push(onMenu((id) => (order.push('editor'), id === 'undo')));
    expect(route('undo', div, () => {})).toBe('handled');
    expect(order).toEqual(['editor']);
    expect(route('theme.dark', div, () => {})).toBe('handled');
    expect(order).toEqual(['editor', 'editor', 'shell']);
  });

  it('says when nothing handles it, and tells watchers', () => {
    const seen: string[] = [];
    cleanup.push(watchMenu((id, outcome) => seen.push(`${id}:${outcome}`)));
    expect(route('zoom.in', div, () => {})).toBe('unhandled');
    expect(seen).toEqual(['zoom.in:unhandled']);
  });

  it('removes a handler', () => {
    const off = onMenu(() => true);
    off();
    expect(route('zoom.in', div, () => {})).toBe('unhandled');
  });
});
