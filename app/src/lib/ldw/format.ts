// Reading and writing .ldw files. Like .lin, JSON one part per line, so a
// diff shows what changed:
//
//   {"ldw":1,"w":1600,"h":1000,"bg":"#ffffff","next":3,"items":[
//    {"id":1,"t":"pen","c":"#111111","w":3,"pts":[120.5,88,121,90.5]},
//    {"id":2,"t":"hl","c":"#f7c948","w":16,"o":35,"z":true,"pts":[...]}
//   ]}
//
// Key order: id, t, c, w, [o], [z], pts. Defaults are left out: o when 100, z
// when false. Strict about structure (an error names the item), forgiving about
// numbers (sizes, widths and opacity are clamped, points rounded to a tenth).

import { MAX_SIDE, MAX_WIDTH, MIN_SIDE, MIN_WIDTH, clamp, parseRgb, round1, type Drawing, type Stroke } from './model';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseLdw(text: string): Drawing {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not a .ldw drawing');
  }
  if (!isObj(raw) || typeof raw.ldw !== 'number') throw new Error('not a .ldw drawing');
  if (raw.ldw > 1) throw new Error('made by a newer linear');
  if (raw.ldw !== 1) throw new Error('not a .ldw drawing');
  const side = (v: unknown, name: string) => {
    if (v === undefined) return name === 'w' ? 1600 : 1000;
    if (!finite(v)) throw new Error(`${name} must be a number`);
    return Math.round(clamp(v, MIN_SIDE, MAX_SIDE));
  };
  const w = side(raw.w, 'w');
  const h = side(raw.h, 'h');
  let bg = '#ffffff';
  if (raw.bg !== undefined) {
    const c = typeof raw.bg === 'string' ? (raw.bg === 'none' ? 'none' : parseRgb(raw.bg)) : null;
    if (!c) throw new Error('bg must be a colour or "none"');
    bg = c;
  }
  if (!Array.isArray(raw.items)) throw new Error('items must be a list');
  const ids = new Set<number>();
  const items: Stroke[] = raw.items.map((it, i) => {
    const where = `item ${i + 1}`;
    if (!isObj(it)) throw new Error(`${where}: not a stroke`);
    if (typeof it.id !== 'number' || !Number.isInteger(it.id) || it.id < 1) throw new Error(`${where}: id must be a whole number from 1`);
    if (ids.has(it.id)) throw new Error(`${where}: id ${it.id} is used twice`);
    ids.add(it.id);
    if (it.t !== 'pen' && it.t !== 'hl') throw new Error(`${where}: t must be "pen" or "hl"`);
    const c = typeof it.c === 'string' ? parseRgb(it.c) : null;
    if (!c) throw new Error(`${where}: c must be a colour`);
    if (!finite(it.w)) throw new Error(`${where}: w must be a number`);
    if (it.o !== undefined && !finite(it.o)) throw new Error(`${where}: o must be a number`);
    if (it.z !== undefined && typeof it.z !== 'boolean') throw new Error(`${where}: z must be true or false`);
    if (!Array.isArray(it.pts) || it.pts.length < 2 || it.pts.length % 2 !== 0 || !it.pts.every(finite)) {
      throw new Error(`${where}: pts must be pairs of numbers, at least one`);
    }
    return {
      id: it.id,
      t: it.t,
      c,
      w: round1(clamp(it.w, MIN_WIDTH, MAX_WIDTH)),
      o: it.o === undefined ? 100 : Math.round(clamp(it.o, 1, 100)),
      z: it.z === true,
      pts: (it.pts as number[]).map(round1),
    };
  });
  const top = ids.size ? Math.max(...ids) : 0;
  const next = typeof raw.next === 'number' && Number.isInteger(raw.next) && raw.next > top ? raw.next : top + 1;
  return { ldw: 1, w, h, bg, next, items };
}

function strokeJson(s: Stroke): string {
  const pts = s.pts.map((v) => String(round1(v))).join(',');
  return `{"id":${s.id},"t":"${s.t}","c":"${s.c}","w":${round1(s.w)}${s.o !== 100 ? `,"o":${s.o}` : ''}${s.z ? ',"z":true' : ''},"pts":[${pts}]}`;
}

export function serializeLdw(d: Drawing): string {
  const head = `{"ldw":1,"w":${d.w},"h":${d.h},"bg":"${d.bg}","next":${d.next},"items":[`;
  if (d.items.length === 0) return `${head}]}\n`;
  return `${head}\n${d.items.map((s) => ` ${strokeJson(s)}`).join(',\n')}\n]}\n`;
}
