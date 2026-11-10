// The pixel editor's keys. Letters pick tools, as in most pixel editors; the
// menu bar has ⌘S, ⌘Z and the rest, and they arrive here too in a plain
// browser. shortcuts.test.ts checks the sheet against this map.

import type { ShortcutGroup } from '../lin-ui/shortcuts';

export type PixTool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'picker' | 'select' | 'move' | 'hand';

export const TOOL_KEYS: Record<string, PixTool> = {
  b: 'pencil',
  e: 'eraser',
  g: 'fill',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
  i: 'picker',
  m: 'select',
  v: 'move',
  h: 'hand',
};

export type PixCommand =
  | { do: 'tool'; tool: PixTool }
  | { do: 'swap' }
  | { do: 'size'; by: 1 | -1 }
  | { do: 'colour'; index: number }
  | { do: 'nudge'; dx: number; dy: number }
  | { do: 'zoom'; by: 'in' | 'out' | 'fit' }
  | { do: 'escape' }
  | { do: 'enter' }
  | { do: 'delete' }
  | { do: 'undo' }
  | { do: 'redo' }
  | { do: 'copy' }
  | { do: 'cut' }
  | { do: 'paste' }
  | { do: 'all' }
  | { do: 'save' }
  | { do: 'export' };

export interface Key {
  key: string;
  code?: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function pixCommandFor(e: Key): PixCommand | null {
  if (e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.metaKey || e.ctrlKey) {
    if (k === 's') return { do: 'save' };
    if (k === 'z') return { do: e.shiftKey ? 'redo' : 'undo' };
    if (k === 'c') return { do: 'copy' };
    if (k === 'x') return { do: 'cut' };
    if (k === 'v') return { do: 'paste' };
    if (k === 'a') return { do: 'all' };
    return null;
  }
  if (k in TOOL_KEYS) return { do: 'tool', tool: TOOL_KEYS[k] };
  if (k === 'x') return { do: 'swap' };
  if (k === '[') return { do: 'size', by: -1 };
  if (k === ']') return { do: 'size', by: 1 };
  if (/^[0-9]$/.test(k)) return { do: 'colour', index: Number(k) };
  if (k in ARROWS) {
    const [dx, dy] = ARROWS[k];
    const n = e.shiftKey ? 10 : 1;
    return { do: 'nudge', dx: dx * n, dy: dy * n };
  }
  if (k === '=' || k === '+') return { do: 'zoom', by: 'in' };
  if (k === '-' || k === '_') return { do: 'zoom', by: 'out' };
  if (k === 'z') return { do: 'zoom', by: 'fit' };
  if (k === 'Escape') return { do: 'escape' };
  if (k === 'Enter') return { do: 'enter' };
  if (k === 'Backspace' || k === 'Delete') return { do: 'delete' };
  return null;
}

export const LPX_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Tools',
    rows: [
      { keys: 'b', does: 'Pencil' },
      { keys: 'e', does: 'Eraser' },
      { keys: 'g', does: 'Fill' },
      { keys: 'l', does: 'Line (⇧: 45° steps)' },
      { keys: 'r', does: 'Rectangle (⇧: square)' },
      { keys: 'o', does: 'Ellipse (⇧: circle)' },
      { keys: 'i', does: 'Eyedropper (or ⌥-click with any tool)' },
      { keys: 'm', does: 'Select a rectangle' },
      { keys: 'v', does: 'Move the selection, or the layer' },
      { keys: 'h', does: 'Move the page (or drag with the middle button)' },
    ],
  },
  {
    title: 'Colours',
    rows: [
      { keys: 'click', does: 'Paint with the first colour' },
      { keys: 'right-click', does: 'Paint with the second colour' },
      { keys: 'x', does: 'Swap the two colours' },
      { keys: '1–9', does: 'Pick palette colour 1–9 (0: transparent)' },
      { keys: '[ ]', does: 'Smaller or bigger brush' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: '⌘A', does: 'Select everything' },
      { keys: '⌘C ⌘X ⌘V', does: 'Copy, cut, paste' },
      { keys: 'arrows', does: 'Nudge 1 pixel (⇧: 10)' },
      { keys: '⏎ or esc', does: 'Put a moved selection down' },
      { keys: 'esc', does: 'Deselect' },
      { keys: '⌫', does: 'Clear the selection' },
    ],
  },
  {
    title: 'View and file',
    rows: [
      { keys: '+ −', does: 'Zoom in or out' },
      { keys: 'z', does: 'Fit the image' },
      { keys: '⌘Z ⇧⌘Z', does: 'Undo, redo' },
      { keys: '⌘S', does: 'Save' },
      { keys: '⌘E', does: 'Export' },
    ],
  },
];
