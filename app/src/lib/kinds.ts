// The three kinds of document, as the library and the New menu show them.
// Each grows a parser, a serialiser, thumbnails and its editor as it's built
// (M2 .lin, M4 .lpx, M5 .ldw); the library is written once against this list.

import { Grid3x3, PenLine, Workflow } from '@lucide/svelte';
import type { Component } from 'svelte';
import type { Kind } from './types';

export interface KindInfo {
  kind: Kind;
  /** The file extension, with its dot. */
  ext: string;
  label: string;
  /** One line for the New menu and the empty library. */
  blurb: string;
  icon: Component;
  /** The kind's own colour, for its icon. */
  tint: string;
}

export const KINDS: readonly KindInfo[] = [
  { kind: 'lin', ext: '.lin', label: 'Diagram', blurb: 'Shapes joined by lines that can pulse', icon: Workflow, tint: '#3e63dd' },
  { kind: 'lpx', ext: '.lpx', label: 'Pixel art', blurb: 'Layers and a palette, one pixel at a time', icon: Grid3x3, tint: '#d6409f' },
  { kind: 'ldw', ext: '.ldw', label: 'Drawing', blurb: 'Pen strokes on a page', icon: PenLine, tint: '#46a758' },
];

export const kindInfo = (k: Kind): KindInfo => KINDS.find((i) => i.kind === k)!;
