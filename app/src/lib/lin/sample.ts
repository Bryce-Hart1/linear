// A diagram with every shape, every kind of line, both ways a line can
// attach, parallel lines, labels and every pulse: drawBridge's sample
// (its mock.ts), kept here as the golden file's source and the mock's demo.

import type { Doc } from './model';

export const SAMPLE_DIAGRAM: Doc = {
  lin: 1,
  w: 1200,
  h: 800,
  next: 16,
  items: [
    { id: 1, t: 'rect', x: 200, y: 200, w: 180, h: 80, c: 6, f: 'o', text: 'client', ln: 'solid', st: '' },
    { id: 2, t: 'diamond', x: 540, y: 200, w: 160, h: 110, c: 3, f: 'o', text: 'auth?', ln: 'solid', st: '' },
    { id: 3, t: 'circle', x: 880, y: 200, w: 110, h: 110, c: 4, f: 'o', text: 'db', ln: 'solid', st: '' },
    { id: 4, t: 'triangle', x: 540, y: 470, w: 140, h: 120, c: 1, f: 'i', text: 'err', ln: 'solid', st: '' },
    { id: 5, t: 'rect', x: 200, y: 470, w: 180, h: 80, c: 8, f: 'o', text: 'cache', ln: 'dash', st: '' },
    // client → auth and auth → client run side by side rather than on top of each other.
    { id: 6, t: 'line', a: { to: 1 }, b: { to: 2 }, head: 'end', pulse: 'fwd', glow: 'ball', c: 0, route: 'straight', ln: 'solid', text: 'login', f: 'i' },
    { id: 7, t: 'line', a: { to: 2 }, b: { to: 3 }, head: 'end', pulse: 'fwd', glow: 'light', c: 4, route: 'straight', ln: 'solid', text: '', f: 'o' },
    { id: 8, t: 'line', a: { to: 2 }, b: { to: 4 }, head: 'end', pulse: 'mid', glow: 'ball', c: 1, route: 'straight', ln: 'solid', text: '', f: 'o' },
    { id: 9, t: 'line', a: { to: 5 }, b: { to: 1 }, head: 'both', pulse: 'rev', glow: 'light', c: 8, route: 'straight', ln: 'solid', text: '', f: 'o' },
    { id: 10, t: 'line', a: { to: 4 }, b: { to: 5 }, head: 'none', pulse: 'off', glow: 'ball', c: 0, route: 'straight', ln: 'dot', text: '', f: 'o' },
    { id: 11, t: 'line', a: { x: 760, y: 420 }, b: { x: 1060, y: 420 }, head: 'end', pulse: 'fwd', glow: 'ball', c: 7, route: 'straight', ln: 'solid', text: '', f: 'o' },
    { id: 12, t: 'line', a: { to: 2 }, b: { to: 1 }, head: 'end', pulse: 'rev', glow: 'ball', c: 2, route: 'straight', ln: 'solid', text: 'token', f: 'i' },
    { id: 13, t: 'line', a: { to: 3 }, b: { x: 1000, y: 420 }, head: 'end', pulse: 'fwd', glow: 'ball', c: 5, route: 'elbow', ln: 'dash', text: '', f: 'o' },
    { id: 14, t: 'line', a: { to: 1 }, b: { to: 4 }, head: 'end', pulse: 'off', glow: 'ball', c: 6, route: 'curve', ln: 'solid', text: '', f: 'o' },
    { id: 15, t: 'line', a: { x: 760, y: 560 }, b: { x: 1060, y: 560 }, head: 'none', pulse: 'off', glow: 'ball', c: 0, route: 'straight', ln: 'solid', text: '', f: 'o' },
  ],
};
