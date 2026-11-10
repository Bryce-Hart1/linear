// Small sample images for the browser mock's library.

import { serializeLpx } from './format';
import { blankLayer, blankPix, presetById } from './model';

const L16 = presetById('linear16')!.colours;

/** A 16 × 16 heart: outline on one layer, fill on another. Colours: 1 black, 5 red, 2 white. */
export function sampleHeart(): string {
  const rows = [
    '................',
    '..XXX.....XXX...',
    '.XrrrX...XrrrX..',
    'XrrwrrX.XrrrrrX.',
    'XrwrrrrXrrrrrrX.',
    'XrrrrrrrrrrrrrX.',
    'XrrrrrrrrrrrrrX.',
    '.XrrrrrrrrrrrX..',
    '..XrrrrrrrrrX...',
    '...XrrrrrrrX....',
    '....XrrrrrX.....',
    '.....XrrrX......',
    '......XrX.......',
    '.......X........',
    '................',
    '................',
  ];
  const pix = blankPix(16, 16, L16);
  const fill = blankLayer(2, 16, 16, 'Fill');
  const outline = pix.layers[0];
  outline.name = 'Outline';
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === 'X') outline.px[y * 16 + x] = 1;
      if (c === 'r') fill.px[y * 16 + x] = 5;
      if (c === 'w') fill.px[y * 16 + x] = 2;
    }),
  );
  pix.layers = [fill, outline];
  pix.next = 3;
  return serializeLpx(pix);
}

/** A 32 × 32 tile of bricks. */
export function sampleBricks(): string {
  const pix = blankPix(32, 32, L16);
  const px = pix.layers[0].px;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const row = Math.floor(y / 8);
      const mortar = y % 8 === 7 || (x + (row % 2) * 8) % 16 === 15;
      px[y * 32 + x] = mortar ? 4 : (x * 7 + y * 3) % 11 === 0 ? 14 : 5;
    }
  }
  return serializeLpx(pix);
}
