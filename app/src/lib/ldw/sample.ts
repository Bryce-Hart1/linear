// A sample drawing for the browser mock's library: a sketch of a hill and a
// sun, with a highlighter note and a box.

import { addStroke } from './edit';
import { serializeLdw } from './format';
import { ellipsePts, rectPts } from './geometry';
import { blankDrawing } from './model';

export function sampleSketch(): string {
  let d = blankDrawing();
  const pen = { t: 'pen' as const, c: '#111111', w: 4, o: 100 };
  const hill = Array.from({ length: 40 }, (_, i) => ({ x: 120 + i * 34, y: 760 - Math.sin((i / 39) * Math.PI) * 300 + Math.sin(i * 1.7) * 6 }));
  d = addStroke(d, pen, hill).d;
  d = addStroke(d, { ...pen, c: '#f76b15', w: 6 }, ellipsePts({ x: 1150, y: 140, w: 180, h: 180 }), true).d;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const c = { x: 1240, y: 230 };
    d = addStroke(d, { ...pen, c: '#f76b15', w: 4 }, [
      { x: c.x + Math.cos(a) * 115, y: c.y + Math.sin(a) * 115 },
      { x: c.x + Math.cos(a) * 160, y: c.y + Math.sin(a) * 160 },
    ]).d;
  }
  d = addStroke(d, { t: 'hl', c: '#f7c948', w: 28, o: 35 }, [
    { x: 160, y: 150 },
    { x: 520, y: 146 },
  ]).d;
  d = addStroke(d, { ...pen, w: 3 }, rectPts({ x: 140, y: 100, w: 400, h: 100 }), true).d;
  d = addStroke(d, { ...pen, c: '#3e63dd', w: 5 }, [
    { x: 700, y: 900 },
    { x: 780, y: 880 },
    { x: 860, y: 905 },
    { x: 940, y: 885 },
  ]).d;
  return serializeLdw(d);
}
