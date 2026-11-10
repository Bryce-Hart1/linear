// The drawing editor's own clipboard: copied strokes, kept for the rest of
// the run so they paste between drawings.
import type { Stroke } from './model';

let held: Stroke[] = [];
export const getStrokes = (): readonly Stroke[] => held;
export const setStrokes = (s: readonly Stroke[]) => {
  held = s.map((x) => ({ ...x, pts: [...x.pts] }));
};
