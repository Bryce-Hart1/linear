// The ids of linear's own menu items (src-tauri/src/menu.rs) and the keys
// they're given there. The browser mock uses the keys to imitate the menu bar,
// and the shortcut sheet lists them.

export type MenuId =
  | 'settings'
  | 'new.lin'
  | 'new.lpx'
  | 'new.ldw'
  | 'import'
  | 'save'
  | 'export'
  | 'close'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  | 'selectAll'
  | 'zoom.in'
  | 'zoom.out'
  | 'zoom.fit'
  | 'toggle.sidebar'
  | 'toggle.inspector'
  | 'theme.system'
  | 'theme.light'
  | 'theme.dark'
  | 'help.shortcuts';

/** `mod` is ⌘ on a Mac and Ctrl elsewhere. Must match the accelerators in menu.rs. */
export const ACCELERATORS: Partial<Record<MenuId, string>> = {
  settings: 'mod+,',
  'new.lin': 'mod+n',
  import: 'mod+o',
  save: 'mod+s',
  export: 'mod+e',
  close: 'mod+w',
  undo: 'mod+z',
  redo: 'mod+shift+z',
  duplicate: 'mod+d',
  selectAll: 'mod+a',
  'zoom.in': 'mod+=',
  'zoom.out': 'mod+-',
  'zoom.fit': 'mod+0',
  'toggle.sidebar': 'mod+\\',
  'toggle.inspector': 'mod+alt+i',
  'help.shortcuts': 'mod+/',
};

export interface KeyLike {
  code: string;
  key?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const PUNCTUATION: Record<string, string> = {
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Slash: '/',
  Backslash: '\\',
};

/**
 * The accelerator a key press spells (`mod+shift+z`), read from the physical
 * key so ⌥ combinations work on a Mac. Null without ⌘ (Ctrl elsewhere).
 */
export function acceleratorOf(e: KeyLike, mac: boolean): string | null {
  if (!(mac ? e.metaKey : e.ctrlKey)) return null;
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else key = PUNCTUATION[e.code];
  // Some synthetic and IME key events carry no code; the character still says
  // which key it was, unless ⌥ changed it.
  if (!key && !e.altKey && e.key && /^[a-z0-9=\-,/\\]$/i.test(e.key)) key = e.key.toLowerCase();
  if (!key) return null;
  return ['mod', e.altKey && 'alt', e.shiftKey && 'shift', key].filter(Boolean).join('+');
}

/** The menu item a key press would trigger in the app, if any. */
export function menuIdFor(e: KeyLike, mac: boolean): MenuId | null {
  const accel = acceleratorOf(e, mac);
  if (!accel) return null;
  for (const [id, a] of Object.entries(ACCELERATORS)) if (a === accel) return id as MenuId;
  return null;
}
