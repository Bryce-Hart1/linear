// The drawing editor's keys, and its shortcut sheet.

import type { ShortcutGroup } from '../lin-ui/shortcuts';

export type DrawTool = 'pen' | 'hl' | 'eraser' | 'lasso' | 'line' | 'rect' | 'ellipse' | 'hand';

export const DRAW_TOOL_KEYS: Record<string, DrawTool> = {
  p: 'pen',
  h: 'hl',
  e: 'eraser',
  s: 'lasso',
  l: 'line',
  r: 'rect',
  o: 'ellipse',
};

export type DrawCommand =
  | { do: 'tool'; tool: DrawTool }
  | { do: 'width'; by: 1 | -1 }
  | { do: 'nudge'; dx: number; dy: number }
  | { do: 'zoom'; by: 'in' | 'out' | 'fit' }
  | { do: 'escape' }
  | { do: 'delete' }
  | { do: 'undo' }
  | { do: 'redo' }
  | { do: 'copy' }
  | { do: 'cut' }
  | { do: 'paste' }
  | { do: 'duplicate' }
  | { do: 'all' }
  | { do: 'save' }
  | { do: 'export' };

interface Key {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function drawCommandFor(e: Key): DrawCommand | null {
  if (e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.metaKey || e.ctrlKey) {
    const chord: Record<string, DrawCommand> = {
      s: { do: 'save' },
      z: { do: e.shiftKey ? 'redo' : 'undo' },
      c: { do: 'copy' },
      x: { do: 'cut' },
      v: { do: 'paste' },
      d: { do: 'duplicate' },
      a: { do: 'all' },
    };
    return chord[k] ?? null;
  }
  if (k in DRAW_TOOL_KEYS) return { do: 'tool', tool: DRAW_TOOL_KEYS[k] };
  if (k === '[') return { do: 'width', by: -1 };
  if (k === ']') return { do: 'width', by: 1 };
  if (k in ARROWS) {
    const [dx, dy] = ARROWS[k];
    const n = e.shiftKey ? 10 : 1;
    return { do: 'nudge', dx: dx * n, dy: dy * n };
  }
  if (k === '=' || k === '+') return { do: 'zoom', by: 'in' };
  if (k === '-' || k === '_') return { do: 'zoom', by: 'out' };
  if (k === 'z') return { do: 'zoom', by: 'fit' };
  if (k === 'x') return { do: 'export' };
  if (k === 'Escape') return { do: 'escape' };
  if (k === 'Backspace' || k === 'Delete') return { do: 'delete' };
  return null;
}

export const LDW_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Tools',
    rows: [
      { keys: 'p', does: 'Pen' },
      { keys: 'h', does: 'Highlighter' },
      { keys: 'e', does: 'Eraser: takes out each stroke it touches' },
      { keys: 's', does: 'Select: click a stroke, or draw round several' },
      { keys: 'l', does: 'Line (⇧: 45° steps)' },
      { keys: 'r', does: 'Rectangle (⇧: square)' },
      { keys: 'o', does: 'Ellipse (⇧: circle)' },
      { keys: 'space', does: 'Hold and drag to move the page' },
    ],
  },
  {
    title: 'Pen',
    rows: [
      { keys: '[ ]', does: 'Thinner or thicker' },
      { keys: 'x', does: 'Export' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: '⌘A', does: 'Select every stroke' },
      { keys: 'drag inside', does: 'Move the selected strokes' },
      { keys: 'arrows', does: 'Nudge 1 pixel (⇧: 10)' },
      { keys: '⌘C ⌘X ⌘V ⌘D', does: 'Copy, cut, paste, duplicate' },
      { keys: '⌫', does: 'Delete' },
      { keys: 'esc', does: 'Deselect' },
    ],
  },
  {
    title: 'View and file',
    rows: [
      { keys: '+ −', does: 'Zoom in or out' },
      { keys: 'z', does: 'Fit the page' },
      { keys: '⌘Z ⇧⌘Z', does: 'Undo, redo' },
      { keys: '⌘S', does: 'Save' },
    ],
  },
];
