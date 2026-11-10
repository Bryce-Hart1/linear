import type { ShapeKind } from '../lin/model';

/** What a press on the .lin canvas does: select and drag, move the page, or place a shape or line. */
export type Tool = 'select' | 'hand' | ShapeKind | 'line';
