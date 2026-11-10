// Reading and writing .lpx files. Like a .lin, a .lpx is JSON written one part
// per line, here a header and then one layer per line:
//
//   {"lpx":1,"w":32,"h":32,"next":3,"pal":["#00000000","#000000ff"],"layers":[
//    {"id":1,"name":"Background","show":true,"lock":false,"op":100,"px":"…"},
//    {"id":2,"name":"Ink","show":true,"lock":false,"op":100,"px":"…"}
//   ]}
//
// `px` is base64 of the layer's w × h palette indices, row by row, raw-deflated
// (fflate: synchronous, and the same bytes on every machine).
//
// Strict about structure, forgiving about numbers, as .lin is: a layer that
// can't be understood is an error naming it, never dropped; opacity is clamped;
// a long name is cut; unknown fields are ignored.

import { deflateSync, inflateSync } from 'fflate';
import { MAX_COLOURS, MAX_LAYERS, MAX_NAME, MAX_SIDE, TRANSPARENT, parseHex, type Layer, type Pix } from './model';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseLpx(text: string): Pix {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('not a .lpx image');
  }
  if (!isObj(raw) || typeof raw.lpx !== 'number') throw new Error('not a .lpx image');
  if (raw.lpx > 1) throw new Error('made by a newer linear');
  if (raw.lpx !== 1) throw new Error('not a .lpx image');
  const side = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_SIDE) throw new Error(`${name} must be a whole number from 1 to ${MAX_SIDE}`);
    return v;
  };
  const w = side(raw.w, 'w');
  const h = side(raw.h, 'h');

  if (!Array.isArray(raw.pal) || raw.pal.length < 1 || raw.pal.length > MAX_COLOURS) {
    throw new Error(`pal must list 1 to ${MAX_COLOURS} colours`);
  }
  const pal = raw.pal.map((c, i) => {
    const hex = typeof c === 'string' ? parseHex(c) : null;
    if (!hex) throw new Error(`colour ${i}: not a colour`);
    return i === 0 ? TRANSPARENT : hex;
  });

  if (!Array.isArray(raw.layers) || raw.layers.length < 1) throw new Error('layers must list at least one layer');
  if (raw.layers.length > MAX_LAYERS) throw new Error(`at most ${MAX_LAYERS} layers`);
  const ids = new Set<number>();
  const layers: Layer[] = raw.layers.map((l, i) => {
    const where = `layer ${i + 1}`;
    if (!isObj(l)) throw new Error(`${where}: not a layer`);
    if (typeof l.id !== 'number' || !Number.isInteger(l.id) || l.id < 1) throw new Error(`${where}: id must be a whole number from 1`);
    if (ids.has(l.id)) throw new Error(`${where}: id ${l.id} is used twice`);
    ids.add(l.id);
    if (typeof l.px !== 'string') throw new Error(`${where}: no pixels`);
    let px: Uint8Array;
    try {
      px = inflateSync(fromBase64(l.px));
    } catch {
      throw new Error(`${where}: the pixels can't be read`);
    }
    if (px.length !== w * h) throw new Error(`${where}: has ${px.length} pixels, not ${w} × ${h}`);
    for (let k = 0; k < px.length; k++) {
      if (px[k] >= pal.length) throw new Error(`${where}: uses colour ${px[k]}, but the palette has ${pal.length}`);
    }
    for (const key of ['show', 'lock'] as const) {
      if (l[key] !== undefined && typeof l[key] !== 'boolean') throw new Error(`${where}: ${key} must be true or false`);
    }
    if (l.op !== undefined && (typeof l.op !== 'number' || !Number.isFinite(l.op))) throw new Error(`${where}: op must be a number`);
    const name = typeof l.name === 'string' && l.name.trim() ? [...l.name].slice(0, MAX_NAME).join('') : `Layer ${l.id}`;
    return {
      id: l.id,
      name,
      show: l.show !== false,
      lock: l.lock === true,
      op: typeof l.op === 'number' ? Math.round(Math.min(100, Math.max(0, l.op))) : 100,
      px,
    };
  });
  const top = Math.max(...ids);
  const next = typeof raw.next === 'number' && Number.isInteger(raw.next) && raw.next > top ? raw.next : top + 1;
  return { lpx: 1, w, h, next, pal, layers };
}

export function serializeLpx(pix: Pix): string {
  const head = `{"lpx":1,"w":${pix.w},"h":${pix.h},"next":${pix.next},"pal":${JSON.stringify(pix.pal)},"layers":[`;
  const lines = pix.layers.map(
    (l) =>
      ` {"id":${l.id},"name":${JSON.stringify(l.name)},"show":${l.show},"lock":${l.lock},"op":${l.op},` +
      `"px":"${toBase64(deflateSync(l.px, { level: 9 }))}"}`,
  );
  return `${head}\n${lines.join(',\n')}\n]}\n`;
}
