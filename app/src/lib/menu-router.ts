// Where a menu command goes. In a text field, Undo, Redo, Select All and
// Delete are text editing, done the way the field would do them itself.
// Anything else goes to the handlers, newest first: an open editor registers
// after the shell, so it gets the first say, and the shell catches the rest
// (theme, sidebar, settings, new documents).

import type { MenuId } from './menu-ids';

/** Returns true if it dealt with the command. */
export type MenuHandler = (id: MenuId) => boolean;

export type Outcome = 'text' | 'handled' | 'unhandled';

const handlers: MenuHandler[] = [];
const watchers = new Set<(id: MenuId, outcome: Outcome) => void>();

/** Adds a handler, ahead of every one before it. Returns its removal. */
export function onMenu(h: MenuHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.lastIndexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Sees every routed command and where it went (the key test panel uses this). */
export function watchMenu(w: (id: MenuId, outcome: Outcome) => void): () => void {
  watchers.add(w);
  return () => watchers.delete(w);
}

/** What `document.execCommand` runs for a command in a text field. */
export const TEXT_COMMANDS: Partial<Record<MenuId, string>> = {
  undo: 'undo',
  redo: 'redo',
  selectAll: 'selectAll',
  delete: 'delete',
};

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);

/** Whether `el` takes typed text: a text input, a textarea or something contenteditable. */
export function isTextField(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && TEXT_INPUTS.has((el.type ?? '').toLowerCase());
}

export function route(
  id: MenuId,
  active: Element | null = typeof document === 'undefined' ? null : document.activeElement,
  exec: (command: string) => void = (c) => document.execCommand(c),
): Outcome {
  let outcome: Outcome = 'unhandled';
  const text = TEXT_COMMANDS[id];
  if (text && isTextField(active as HTMLInputElement | null)) {
    exec(text);
    outcome = 'text';
  } else {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i](id)) {
        outcome = 'handled';
        break;
      }
    }
  }
  for (const w of watchers) w(id, outcome);
  return outcome;
}
