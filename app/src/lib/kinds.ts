// The three kinds of document, as the library, the New menu and import see
// them. Each kind grows its parser, serialiser, thumbnails and editor as it's
// built (.lin in M2, .lpx in M4, .ldw in M5); the library is written once
// against this list.

import { Grid3x3, PenLine, Workflow } from '@lucide/svelte';
import type { Component } from 'svelte';
import { thumbnail as linThumbnail } from './lin/draw';
import { parseLpx, serializeLpx } from './lpx/format';
import { blankPix, presetById } from './lpx/model';
import { thumbnailLpx } from './lpx/render';
import { parseLin, serializeLin } from './lin/format';
import { blankDoc } from './lin/model';
import type { Kind } from './types';

/** How big a library thumbnail is drawn, at most, on its longer side. */
export const THUMB_SIDE = 480;

/** What the New dialog asks for, for kinds that have a size. */
export interface NewOptions {
  w?: number;
  h?: number;
  /** A palette's colours after transparent. */
  colours?: readonly string[];
}

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
  /** What a new one starts as, serialised; null until linear can make this kind. */
  blank: ((opts?: NewOptions) => string) | null;
  /** Throws, saying what's wrong, if `text` isn't a readable file of this kind; null until linear can read it. */
  check: ((text: string) => void) | null;
  /** A small picture of `text` for the library (JPEG or PNG), or null for an empty page or a kind without one yet. */
  thumbnail: (text: string) => Promise<Uint8Array | null>;
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
    blank: () => serializeLin(blankDoc()),
    check: (text) => void parseLin(text),
    thumbnail: async (text) => {
      try {
        return await linThumbnail(parseLin(text), THUMB_SIDE);
      } catch {
        // An empty page has no picture (draw.ts throws), and nor does an unreadable file.
        return null;
      }
    },
  },
  {
    kind: 'lpx',
    ext: '.lpx',
    label: 'Pixel art',
    plural: 'Pixel art',
    blurb: 'Layers and a palette, one pixel at a time',
    icon: Grid3x3,
    blank: (o) => serializeLpx(blankPix(o?.w ?? 32, o?.h ?? 32, o?.colours ?? presetById('linear16')!.colours)),
    check: (text) => void parseLpx(text),
    thumbnail: async (text) => {
      try {
        return await thumbnailLpx(parseLpx(text), THUMB_SIDE);
      } catch {
        return null;
      }
    },
  },
  {
    kind: 'ldw',
    ext: '.ldw',
    label: 'Drawing',
    plural: 'Drawings',
    blurb: 'Pen strokes on a page',
    icon: PenLine,
    blank: null,
    check: null,
    thumbnail: async () => null,
    comingIn: 'M5',
  },
];

export const kindInfo = (k: Kind): KindInfo => KINDS.find((i) => i.kind === k)!;
