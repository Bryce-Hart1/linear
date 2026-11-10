// The keys, grouped for the shortcut sheet (⌘/). The .lin editor's are
// lib/lin/keys.ts's key map, written out; keys.test.ts checks that map, and
// shortcuts.test.ts checks these against it.

export interface Shortcut {
  keys: string;
  does: string;
}

export interface ShortcutGroup {
  title: string;
  rows: Shortcut[];
}

export const LIBRARY_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Library',
    rows: [
      { keys: '⌘N', does: 'New diagram' },
      { keys: '⌘O', does: 'Import files' },
      { keys: '⏎', does: 'Open the selected document' },
      { keys: '← →', does: 'Select the previous or next document' },
      { keys: '⌘D', does: 'Duplicate' },
      { keys: '⌫', does: 'Move to the Trash' },
      { keys: '⌘E', does: 'Export the file' },
    ],
  },
  {
    title: 'Window',
    rows: [
      { keys: '⌘\\', does: 'Show or hide the sidebar' },
      { keys: '⌘,', does: 'Settings' },
      { keys: '⌘/', does: 'These shortcuts' },
    ],
  },
];

export const LIN_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Any time',
    rows: [
      { keys: 'e', does: 'Switch between viewing and editing' },
      { keys: 'space', does: 'Play or pause the pulses (while viewing)' },
      { keys: '+ −', does: 'Zoom in or out' },
      { keys: 'z', does: 'Fit the page' },
      { keys: 'x', does: 'Export' },
      { keys: '⌘S', does: 'Save' },
      { keys: 'esc', does: 'Cancel, deselect, then close' },
    ],
  },
  {
    title: 'Make things',
    rows: [
      { keys: 'r c t d', does: 'Rectangle, circle, triangle, diamond: click to place' },
      { keys: 'l', does: 'Line: click where it starts, then where it ends' },
      { keys: 'drag a dot', does: 'Draw a line out of a shape' },
      { keys: 'g', does: 'Snap to a 10 px grid' },
    ],
  },
  {
    title: 'Selection',
    rows: [
      { keys: 'tab ⇧tab', does: 'Select the next or previous part' },
      { keys: '⌘A', does: 'Select everything' },
      { keys: '0–9', does: 'Colour' },
      { keys: 'i o p', does: 'Small, medium or large text' },
      { keys: 'w', does: 'Outline: solid, dashed, dotted' },
      { keys: '⌥ arrows', does: 'Move 10 px (⇧: 1 px)' },
      { keys: '[ ] { }', does: 'Back, forward, to the back, to the front' },
      { keys: '⌘C ⌘V ⌘D', does: 'Copy, paste, duplicate' },
      { keys: '⌫', does: 'Delete' },
      { keys: '⌘Z ⇧⌘Z', does: 'Undo, redo' },
    ],
  },
  {
    title: 'A shape',
    rows: [
      { keys: 'arrows', does: 'Resize 10 px (⇧: 40 px)' },
      { keys: 'drag a handle', does: 'Resize (⌥: from the centre)' },
      { keys: '⏎ or double-click', does: 'Type in it' },
    ],
  },
  {
    title: 'A line',
    rows: [
      { keys: 'a', does: 'Arrowheads: none, one, both' },
      { keys: 'f', does: 'Flip its direction' },
      { keys: 'b', does: 'Bend: straight, curved, square' },
      { keys: 'm', does: 'Pulse: off, forward, back, from the middle' },
      { keys: 's', does: 'Pulse look: ball or light' },
      { keys: '⏎ or double-click', does: 'Type a label' },
    ],
  },
  {
    title: 'Typing',
    rows: [
      { keys: '⏎', does: 'New line (in a shape)' },
      { keys: '← → ⇧', does: 'Move the caret, select' },
      { keys: '⌥B ⌥I ⌥U', does: 'Bold, italic, underline' },
      { keys: 'esc', does: 'Done' },
    ],
  },
];
