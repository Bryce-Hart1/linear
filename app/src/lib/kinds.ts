// The three kinds of document, as the library, the New menu and import see
// them. Each kind grows its parser, serialiser, thumbnails and editor as it's
// built (.lin in M2, .lpx in M4, .ldw in M5); the library is written once
// against this list.

import { Grid3x3, PenLine, Workflow } from '@lucide/svelte';
import type { Component } from 'svelte';
import { parseLin, serializeLin } from './lin/format';
import { blankDoc } from './lin/model';
import type { Kind } from './types';

export interface KindInfo {
  kind: Kind;
  /** The file extension, with its dot. */
  ext: string;
  label: string;
  /** Plural, for filters and counts. */
  plural: string;
  /** One line for the New menu and the empty library. */
  blurb: string;
  icon: Component;
  /** The kind's own colour, for its icon. */
  tint: string;
  /** What a new one starts as, serialised; null until linear can make this kind. */
  blank: (() => string) | null;
  /** Throws, saying what's wrong, if `text` isn't a readable file of this kind; null until linear can read it. */
  check: ((text: string) => void) | null;
  /** The milestone that brings this kind, while it isn't here yet. */
  comingIn?: string;
}

export const KINDS: readonly KindInfo[] = [
  {
    kind: 'lin',
    ext: '.lin',
    label: 'Diagram',
    plural: 'Diagrams',
    blurb: 'Shapes joined by lines that can pulse',
    icon: Workflow,
    tint: '#3e63dd',
    blank: () => serializeLin(blankDoc()),
    check: (text) => void parseLin(text),
  },
  {
    kind: 'lpx',
    ext: '.lpx',
    label: 'Pixel art',
    plural: 'Pixel art',
    blurb: 'Layers and a palette, one pixel at a time',
    icon: Grid3x3,
    tint: '#d6409f',
    blank: null,
    check: null,
    comingIn: 'M4',
  },
  {
    kind: 'ldw',
    ext: '.ldw',
    label: 'Drawing',
    plural: 'Drawings',
    blurb: 'Pen strokes on a page',
    icon: PenLine,
    tint: '#46a758',
    blank: null,
    check: null,
    comingIn: 'M5',
  },
];

export const kindInfo = (k: Kind): KindInfo => KINDS.find((i) => i.kind === k)!;
