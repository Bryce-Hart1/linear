// The pixel editor's own clipboard: a block of palette indices. Kept for the
// rest of the run, so it carries between images (indices, so the colours are
// whatever the pasted-into image's palette says).

export interface Block {
  w: number;
  h: number;
  px: Uint8Array;
}

let held: Block | null = null;

export const getBlock = (): Block | null => held;
export const setBlock = (b: Block) => {
  held = { w: b.w, h: b.h, px: b.px.slice() };
};
