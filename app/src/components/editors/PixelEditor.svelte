<!--
  A .lpx image, open for drawing. The tools are down the left, each tool's
  settings run along the top of the canvas, and the colours, palette and
  layers are on the right. Click paints with the first colour, right-click
  with the second, and ⌥-click picks a colour up. The keys are in lib/lpx/keys.ts.

  The image is changed in place (lib/lpx/raster.ts and edit.ts) and history.ts
  keeps what each change overwrote. Each layer has its own off-screen canvas,
  repainted only where a change landed; the view draws them scaled up by a
  whole number, so pixels stay square.

  A selection can be lifted and moved: dragging inside it with Select, or
  anything with Move, lifts its pixels off the layer into a floating block,
  and Enter, Esc or another tool puts it down. Saving, drafts, closing and
  export work as in the .lin editor.
-->
<script lang="ts">
  import {
    ArrowLeftRight,
    ArrowUpDown,
    Circle,
    Eraser,
    FileOutput,
    Grid2x2,
    Hand,
    Image as ImageIcon,
    Keyboard,
    Move,
    PaintBucket,
    PanelRight,
    Pencil,
    Pipette,
    Redo2,
    RotateCw,
    Scaling,
    Slash,
    Square,
    SquareDashed,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { onDestroy, onMount, untrack, type Component } from 'svelte';
  import { api } from '../../lib/api';
  import { THUMB_SIDE } from '../../lib/kinds';
  import { getBlock, setBlock } from '../../lib/lpx/clip';
  import {
    addColour,
    addLayer,
    deleteLayer,
    duplicateLayer,
    flipCanvas,
    mergeDown,
    moveLayer,
    removeColour,
    resizeCanvas,
    rotateCanvas,
    setColour,
    setLayer,
    usePalette,
    type Done,
  } from '../../lib/lpx/edit';
  import { parseLpx, serializeLpx } from '../../lib/lpx/format';
  import { PixHistory } from '../../lib/lpx/history';
  import { LPX_SHORTCUTS, pixCommandFor, type PixCommand, type PixTool } from '../../lib/lpx/keys';
  import { blankPix, layerById, rgba, type Layer, type Pix } from '../../lib/lpx/model';
  import {
    Stroke,
    blit,
    brush,
    clipRect,
    constrain,
    ellipsePoints,
    extract,
    fillRect,
    floodFill,
    linePoints,
    rectFrom,
    rectPoints,
    stamp,
    type Paint,
    type Pt,
    type Rect,
  } from '../../lib/lpx/raster';
  import { MIN_GRID_SCALE, exportPng, indexAt, paintLayer, paletteRGBA, thumbnailLpx } from '../../lib/lpx/render';
  import type { MenuId } from '../../lib/menu-ids';
  import { isTextField, onMenu } from '../../lib/menu-router';
  import { notes } from '../../lib/notes.svelte';
  import { prefs } from '../../lib/prefs.svelte';
  import { ago } from '../../lib/time';
  import { errorMessage, type DocMeta, type Opened, type Palette } from '../../lib/types';
  import Confirm from '../shell/Confirm.svelte';
  import ShortcutSheet from '../shell/ShortcutSheet.svelte';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import ExportDialog from '../shell/ExportDialog.svelte';
  import type { ExportChoice, ExportFormat } from '../../lib/export-look';
  import Dialog from '../ui/Dialog.svelte';
  import type { MenuItem } from '../ui/menu';
  import EditorFrame from './EditorFrame.svelte';
  import CanvasSizeDialog from './lpx/CanvasSizeDialog.svelte';
  import PixelPanel from './lpx/PixelPanel.svelte';

  let {
    opened,
    fresh = false,
    onclose,
    onversions,
  }: { opened: Opened; fresh?: boolean; onclose: (meta: DocMeta) => void; onversions?: (meta: DocMeta, dirty: boolean) => void } = $props();

  const start = untrack(() => ({ ...opened, fresh }));
  const p0 = prefs.value!;

  let meta = $state<DocMeta>(start.meta);
  let versionId = $state(start.version.id);
  let failed = $state<string | null>(null);

  function load(text: string): Pix | null {
    try {
      return parseLpx(text);
    } catch (e) {
      failed = errorMessage(e);
      return null;
    }
  }

  /** The image. Changed in place; `rev` says it changed. */
  let pix = $state.raw<Pix>(load(start.content) ?? blankPix(16, 16, ['#000000']));
  let rev = $state(0);
  let hist = new PixHistory();
  /** The history step that was last saved, so undoing back to it isn't "modified". */
  let savedMark = $state(0);
  /** A restored draft is unsaved even with no history behind it. */
  let forcedDirty = $state(false);
  let recovered = $state(start.draft && start.draft.content !== start.content ? start.draft : null);

  let tool = $state<PixTool>('pencil');
  let active = $state(untrack(() => pix.layers.at(-1)!.id));
  let primary = $state(untrack(() => (pix.pal.length > 1 ? 1 : 0)));
  let secondary = $state(0);
  let size = $state(1);
  let round = $state(false);
  let filled = $state(false);
  let contiguous = $state(true);
  let mirrorX = $state(false);
  let mirrorY = $state(false);
  let perfect = $state(true);
  let showGrid = $state(p0.lpx.showGrid);

  /** The selected rectangle, in image pixels. */
  let selection = $state.raw<Rect | null>(null);
  /** Pixels lifted off a layer (or pasted) and being moved; `lifted` if the layer has a hole for them. */
  type Float = { px: Uint8Array; w: number; h: number; x: number; y: number; layer: number; lifted: boolean };
  let float = $state.raw<Float | null>(null);

  /** Screen pixels per image pixel: always a whole number. */
  let zoom = $state(1);
  let pan = $state.raw<Pt>({ x: 0, y: 0 });
  /** Until the user zooms, the image keeps fitting the window as it resizes. */
  let fitting = true;
  let hover = $state.raw<Pt | null>(null);
  let preview = $state.raw<{ points: Pt[]; value: number } | null>(null);
  let spaceDown = $state(false);

  let closing = $state(false);
  let sheet = $state(false);
  let sizing = $state(false);
  let naming = $state(false);
  let paletteName = $state('');
  let deletingPalette = $state<Palette | null>(null);
  let popup = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let palettes = $state<Palette[]>([]);
  let saving = $state(false);
  let exporting = $state(false);
  let imageButton: HTMLButtonElement | undefined = $state();

  const dirty = $derived((void rev, forcedDirty || hist.mark !== savedMark));
  const canUndo = $derived((void rev, hist.canUndo || (float !== null && !float.lifted)));
  const canRedo = $derived((void rev, hist.canRedo));
  const activeLayer = $derived((void rev, layerById(pix, active)));

  const TOOLS: { tool: PixTool; label: string; key: string; icon: Component }[] = [
    { tool: 'pencil', label: 'Pencil', key: 'b', icon: Pencil },
    { tool: 'eraser', label: 'Eraser', key: 'e', icon: Eraser },
    { tool: 'fill', label: 'Fill', key: 'g', icon: PaintBucket },
    { tool: 'line', label: 'Line', key: 'l', icon: Slash },
    { tool: 'rect', label: 'Rectangle', key: 'r', icon: Square },
    { tool: 'ellipse', label: 'Ellipse', key: 'o', icon: Circle },
    { tool: 'picker', label: 'Eyedropper', key: 'i', icon: Pipette },
    { tool: 'select', label: 'Select', key: 'm', icon: SquareDashed },
    { tool: 'move', label: 'Move', key: 'v', icon: Move },
    { tool: 'hand', label: 'Move the page', key: 'h', icon: Hand },
  ];
  const label = (t: PixTool) => TOOLS.find((x) => x.tool === t)!.label;
  const BRUSHED: PixTool[] = ['pencil', 'eraser', 'line', 'rect', 'ellipse'];

  function say(text: string) {
    notes.say(text.charAt(0).toUpperCase() + text.slice(1));
  }

  // ── Layer canvases ──────────────────────────────────────────────────

  const layerCanvas = new Map<number, { canvas: HTMLCanvasElement; img: ImageData }>();
  let colours = paletteRGBA(untrack(() => pix.pal));
  let floatCanvas: HTMLCanvasElement | null = null;

  /** Repaints every layer: after the palette, the layers or the canvas size changed. */
  function rebuild() {
    colours = paletteRGBA(pix.pal);
    layerCanvas.clear();
    for (const l of pix.layers) {
      const canvas = document.createElement('canvas');
      canvas.width = pix.w;
      canvas.height = pix.h;
      const img = new ImageData(pix.w, pix.h);
      paintLayer(l.px, pix.w, pix.h, colours, img.data);
      canvas.getContext('2d')!.putImageData(img, 0, 0);
      layerCanvas.set(l.id, { canvas, img });
    }
    if (!layerById(pix, active)) active = pix.layers.at(-1)!.id;
    paintFloat();
  }

  /** Repaints one layer inside `r`. */
  function refresh(id: number, r: Rect) {
    const entry = layerCanvas.get(id);
    const layer = layerById(pix, id);
    if (!entry || !layer) return rebuild();
    paintLayer(layer.px, pix.w, pix.h, colours, entry.img.data, r);
    entry.canvas.getContext('2d')!.putImageData(entry.img, 0, 0, r.x, r.y, r.w, r.h);
  }

  function paintFloat() {
    if (!float) {
      floatCanvas = null;
      return;
    }
    floatCanvas = document.createElement('canvas');
    floatCanvas.width = float.w;
    floatCanvas.height = float.h;
    const img = new ImageData(float.w, float.h);
    paintLayer(float.px, float.w, float.h, colours, img.data);
    floatCanvas.getContext('2d')!.putImageData(img, 0, 0);
  }

  /** Something changed: repaint what's needed and redraw. */
  function changed(what: 'all' | { layer: number; rect: Rect } | 'view') {
    if (what === 'all') rebuild();
    else if (what !== 'view') refresh(what.layer, what.rect);
    rev++;
    redraw = true;
  }

  // ── The view ────────────────────────────────────────────────────────

  let canvas: HTMLCanvasElement | undefined = $state();
  let width = 0;
  let height = 0;
  let raf = 0;
  let redraw = true;
  let observer: ResizeObserver | undefined;
  let ants = 0;
  const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

  function fitZoom() {
    return Math.max(1, Math.min(64, Math.floor(Math.min((width - 48) / pix.w, (height - 48) / pix.h))));
  }

  function origin() {
    return { x: Math.round((width - pix.w * zoom) / 2 + pan.x), y: Math.round((height - pix.h * zoom) / 2 + pan.y) };
  }

  function fit() {
    fitting = true;
    zoom = fitZoom();
    pan = { x: 0, y: 0 };
  }

  /** Zooms to `z`, keeping the image point under the screen point (sx, sy) where it is. */
  function zoomTo(z: number, sx = width / 2, sy = height / 2) {
    z = Math.max(1, Math.min(64, z));
    if (z === zoom) return;
    fitting = false;
    const o = origin();
    const ix = (sx - o.x) / zoom;
    const iy = (sy - o.y) / zoom;
    zoom = z;
    const n = origin();
    pan = { x: pan.x + (sx - (n.x + ix * zoom)), y: pan.y + (sy - (n.y + iy * zoom)) };
  }

  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom);
    const at = i < 0 ? ZOOMS.length - 1 : ZOOMS[i] === zoom ? i : dir > 0 ? i - 1 : i;
    return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, at + dir))];
  };

  function resizeCanvasEl() {
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    if (fitting) zoom = fitZoom();
    redraw = true;
  }

  let checker: CanvasPattern | null = null;
  function css(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function paint() {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--paper') || '#000';
    ctx.fillRect(0, 0, width, height);
    const o = origin();
    const s = zoom;
    const W = pix.w * s;
    const H = pix.h * s;
    // Transparent, as a checkerboard.
    if (!checker) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 16;
      const t = tile.getContext('2d')!;
      t.fillStyle = css('--paper') || '#000';
      t.fillRect(0, 0, 16, 16);
      t.fillStyle = css('--faint') || '#333';
      t.fillRect(0, 0, 8, 8);
      t.fillRect(8, 8, 8, 8);
      checker = ctx.createPattern(tile, 'repeat');
    }
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = checker!;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.imageSmoothingEnabled = false;
    for (const l of pix.layers) {
      if (!l.show) continue;
      const c = layerCanvas.get(l.id);
      ctx.globalAlpha = l.op / 100;
      if (c) ctx.drawImage(c.canvas, o.x, o.y, W, H);
      if (float && floatCanvas && float.layer === l.id) ctx.drawImage(floatCanvas, o.x + float.x * s, o.y + float.y * s, float.w * s, float.h * s);
    }
    ctx.globalAlpha = 1;

    if (preview) {
      const [r, g, b, a] = rgba(pix.pal[preview.value] ?? '#00000000');
      ctx.fillStyle = preview.value === 0 ? css('--paper') : `rgba(${r},${g},${b},${a / 255})`;
      for (const p of preview.points) if (p.x >= 0 && p.y >= 0 && p.x < pix.w && p.y < pix.h) ctx.fillRect(o.x + p.x * s, o.y + p.y * s, s, s);
    }

    const ink = css('--ink') || '#fff';
    const faint = css('--faint') || '#333';
    if (showGrid && s >= 8) {
      ctx.strokeStyle = faint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < pix.w; x++) {
        ctx.moveTo(o.x + x * s + 0.5, o.y);
        ctx.lineTo(o.x + x * s + 0.5, o.y + H);
      }
      for (let y = 1; y < pix.h; y++) {
        ctx.moveTo(o.x, o.y + y * s + 0.5);
        ctx.lineTo(o.x + W, o.y + y * s + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - 0.5, o.y - 0.5, W + 1, H + 1);

    // The selection (or the floating block): marching ants.
    const sel = float ? { x: float.x, y: float.y, w: float.w, h: float.h } : selection;
    if (sel) {
      const rx = o.x + sel.x * s + 0.5;
      const ry = o.y + sel.y * s + 0.5;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = css('--paper') || '#000';
      ctx.strokeRect(rx, ry, sel.w * s - 1, sel.h * s - 1);
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -ants;
      ctx.strokeStyle = ink;
      ctx.strokeRect(rx, ry, sel.w * s - 1, sel.h * s - 1);
      ctx.setLineDash([]);
    }

    // Where the brush would land.
    if (hover && BRUSHED.includes(tool) && !drag && !spaceDown) {
      const tip = brush(size, round);
      const xs = tip.map((t) => t.x);
      const ys = tip.map((t) => t.y);
      const x0 = hover.x + Math.min(...xs);
      const y0 = hover.y + Math.min(...ys);
      ctx.strokeStyle = ink;
      ctx.strokeRect(o.x + x0 * s + 0.5, o.y + y0 * s + 0.5, (Math.max(...xs) - Math.min(...xs) + 1) * s - 1, (Math.max(...ys) - Math.min(...ys) + 1) * s - 1);
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (selection || float) {
      ants = (ants + 0.25) % 8;
      redraw = true;
    }
    if (redraw) {
      redraw = false;
      paint();
    }
  }

  $effect(() => {
    void [rev, zoom, pan, hover, preview, selection, float, showGrid, tool, size, round, spaceDown];
    redraw = true;
  });

  // The theme changing recolours the page and the checkerboard.
  $effect(() => {
    void prefs.value?.theme;
    requestAnimationFrame(() => {
      checker = null;
      redraw = true;
    });
  });

  let wheelZoom = 0;
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const box = canvas!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // A trackpad sends many small steps: zoom once enough have built up.
      wheelZoom += e.deltaY;
      if (Math.abs(wheelZoom) >= 30) {
        zoomTo(zoomStep(wheelZoom < 0 ? 1 : -1), e.clientX - box.left, e.clientY - box.top);
        wheelZoom = 0;
      }
    } else {
      fitting = false;
      pan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY };
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────────

  function paintWith(value: number): Paint {
    return { value, size, round, mirrorX, mirrorY, clip: selection };
  }

  /** The layer to draw on, or null (and why) if it's hidden or locked. */
  function drawable(): Layer | null {
    const l = layerById(pix, active);
    if (!l) return null;
    if (!l.show) {
      say(`${l.name} is hidden: show it to draw on it`);
      return null;
    }
    if (l.lock) {
      say(`${l.name} is locked`);
      return null;
    }
    return l;
  }

  /** Keeps a change to a layer's pixels in history: `before` is the whole layer as it was. */
  function record(l: Layer, before: Uint8Array, r: Rect | null) {
    if (!r) return;
    hist.pixels(l.id, r, extract(before, pix.w, r), extract(l.px, pix.w, r));
    changed({ layer: l.id, rect: r });
  }

  function shapePoints(a: Pt, b: Pt): Pt[] {
    if (tool === 'line') return linePoints(a, b);
    if (tool === 'rect') return rectPoints(a, b, filled);
    return ellipsePoints(a, b, filled);
  }

  function pick(p: Pt, second: boolean) {
    const i = indexAt(pix, p.x, p.y);
    if (second) secondary = i;
    else primary = i;
  }

  // ── The selection ───────────────────────────────────────────────────

  const full = (): Rect => ({ x: 0, y: 0, w: pix.w, h: pix.h });
  const inside = (p: Pt, r: Rect | null) => !!r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;

  /** Lifts the selection's pixels off the active layer into a floating block. */
  function lift(): boolean {
    if (float) return true;
    const r = selection && clipRect(selection, pix.w, pix.h);
    if (!r) return false;
    const l = drawable();
    if (!l) return false;
    const before = l.px.slice();
    const block = extract(l.px, pix.w, r);
    fillRect(l.px, pix.w, pix.h, r, 0);
    float = { px: block, w: r.w, h: r.h, x: r.x, y: r.y, layer: l.id, lifted: true };
    paintFloat();
    record(l, before, r);
    return true;
  }

  /** Puts a floating block down where it is. */
  function commitFloat() {
    const f = float;
    if (!f) return;
    float = null;
    paintFloat();
    selection = clipRect({ x: f.x, y: f.y, w: f.w, h: f.h }, pix.w, pix.h);
    const l = layerById(pix, f.layer);
    if (!l) return changed('view');
    const before = l.px.slice();
    const r = blit(l.px, pix.w, pix.h, f.px, f.w, f.h, f.x, f.y);
    if (r) record(l, before, r);
    else changed('view');
  }

  /** Drops a floating block: lifted pixels stay off the layer (that step is in history). */
  function dropFloat() {
    float = null;
    paintFloat();
    changed('view');
  }

  function copy(): boolean {
    if (float) {
      setBlock({ w: float.w, h: float.h, px: float.px });
      return true;
    }
    const l = layerById(pix, active);
    const r = clipRect(selection ?? full(), pix.w, pix.h);
    if (!l || !r) return false;
    setBlock({ w: r.w, h: r.h, px: extract(l.px, pix.w, r) });
    return true;
  }

  function clearSelection(): boolean {
    if (float) {
      // A lifted block's pixels are already off the layer (and that step is in history); a pasted one was never on it.
      dropFloat();
      return true;
    }
    const r = clipRect(selection ?? full(), pix.w, pix.h);
    const l = r && drawable();
    if (!r || !l) return false;
    const before = l.px.slice();
    record(l, before, fillRect(l.px, pix.w, pix.h, r, 0));
    return true;
  }

  function paste() {
    const b = getBlock();
    if (!b) return say('nothing copied yet: select something and press ⌘C');
    commitFloat();
    if (!drawable()) return;
    const x = selection ? selection.x : Math.floor((pix.w - b.w) / 2);
    const y = selection ? selection.y : Math.floor((pix.h - b.h) / 2);
    float = { px: b.px.slice(), w: b.w, h: b.h, x, y, layer: active, lifted: false };
    paintFloat();
    selection = null;
    tool = 'move';
    changed('view');
  }

  // ── Doing things ────────────────────────────────────────────────────

  function undo() {
    if (float) {
      const wasLifted = float.lifted;
      dropFloat();
      // A pasted block isn't in history yet: dropping it is the whole undo.
      if (!wasLifted) return;
    }
    const e = hist.undo(pix);
    if (!e) return say('nothing to undo');
    afterHistory(e);
  }

  function redo() {
    commitFloat();
    const e = hist.redo(pix);
    if (!e) return say('nothing to redo');
    afterHistory(e);
  }

  function afterHistory(e: NonNullable<ReturnType<PixHistory['undo']>>) {
    if (e.kind === 'pixels') changed({ layer: e.layer, rect: e.rect });
    else {
      selection = selection && clipRect(selection, pix.w, pix.h);
      changed('all');
    }
  }

  /** The result of an image-level change: say a refusal, or repaint (and pick a new layer if it made one). */
  function took(r: Done, pickLayer = false) {
    if ('error' in r) return say(r.error);
    if (pickLayer && r.id) active = r.id;
    changed('all');
  }

  function setTool(t: PixTool) {
    if (t !== 'move' && t !== 'select') commitFloat();
    tool = t;
  }

  function run(c: PixCommand) {
    switch (c.do) {
      case 'tool':
        return setTool(c.tool);
      case 'swap':
        [primary, secondary] = [secondary, primary];
        return;
      case 'size':
        size = Math.max(1, Math.min(8, size + c.by));
        return;
      case 'colour':
        if (c.index < pix.pal.length) primary = c.index;
        else say(`the palette has no colour ${c.index}`);
        return;
      case 'nudge':
        if (!float && !(selection && lift())) return;
        float = { ...float!, x: float!.x + c.dx, y: float!.y + c.dy };
        return changed('view');
      case 'zoom':
        return c.by === 'fit' ? fit() : zoomTo(zoomStep(c.by === 'in' ? 1 : -1));
      case 'escape':
        if (float) commitFloat();
        else if (selection) selection = null;
        return;
      case 'enter':
        return commitFloat();
      case 'delete':
        if (!clearSelection()) say('nothing to clear');
        return;
      case 'undo':
        return undo();
      case 'redo':
        return redo();
      case 'copy':
        if (copy()) say(`copied ${float ? 'the moved pixels' : selection ? 'the selection' : 'the layer'}`);
        return;
      case 'cut':
        if (copy()) clearSelection();
        return;
      case 'paste':
        return paste();
      case 'all':
        commitFloat();
        selection = full();
        return;
      case 'save':
        void save();
        return;
      case 'export':
        return openExport();
    }
  }

  function keysElsewhere(target: EventTarget | null): boolean {
    return (
      closing ||
      sheet ||
      sizing ||
      naming ||
      popup !== null ||
      exportOpen ||
      !!document.querySelector('dialog[open]') ||
      isTextField(target as HTMLInputElement | null)
    );
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || failed || keysElsewhere(e.target)) return;
    if (e.key === ' ') {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    const c = pixCommandFor(e);
    if (!c) return;
    e.preventDefault();
    run(c);
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === ' ') spaceDown = false;
  }

  function menu(id: MenuId): boolean {
    if (failed) return id === 'close' ? (finish(), true) : false;
    switch (id) {
      case 'save':
        void save();
        return true;
      case 'close':
        requestClose();
        return true;
      case 'export':
        openExport();
        return true;
      case 'undo':
        undo();
        return true;
      case 'redo':
        redo();
        return true;
      case 'selectAll':
        run({ do: 'all' });
        return true;
      case 'duplicate':
        took(duplicateLayer(pix, hist, active), true);
        return true;
      case 'delete':
        run({ do: 'delete' });
        return true;
      case 'zoom.in':
        run({ do: 'zoom', by: 'in' });
        return true;
      case 'zoom.out':
        run({ do: 'zoom', by: 'out' });
        return true;
      case 'zoom.fit':
        fit();
        return true;
      case 'help.shortcuts':
        sheet = true;
        return true;
    }
    return false;
  }

  function onclipboard(e: ClipboardEvent) {
    if (failed || keysElsewhere(document.activeElement)) return;
    e.preventDefault();
    run({ do: e.type === 'paste' ? 'paste' : e.type === 'cut' ? 'cut' : 'copy' });
  }

  // ── Mouse ───────────────────────────────────────────────────────────

  type Drag =
    | { kind: 'pan'; sx: number; sy: number; from: Pt }
    | { kind: 'stroke'; stroke: Stroke; layer: Layer }
    | { kind: 'shape'; a: Pt; value: number }
    | { kind: 'marquee'; a: Pt; moved: boolean }
    | { kind: 'float'; start: Pt; from: Pt };
  let drag: Drag | null = null;
  /** Dragging the page, for the cursor. */
  let panning = $state(false);

  function toPx(e: MouseEvent): Pt {
    const box = canvas!.getBoundingClientRect();
    const o = origin();
    return { x: Math.floor((e.clientX - box.left - o.x) / zoom), y: Math.floor((e.clientY - box.top - o.y) / zoom) };
  }

  function onpointerdown(e: PointerEvent) {
    if (failed) return;
    if (e.button === 1 || tool === 'hand' || spaceDown) {
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, from: pan };
      panning = true;
      fitting = false;
      canvas?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const p = toPx(e);
    const second = e.button === 2;
    if (e.altKey || tool === 'picker') return pick(p, second);
    const value = tool === 'eraser' ? 0 : second ? secondary : primary;
    canvas?.setPointerCapture(e.pointerId);
    switch (tool) {
      case 'pencil':
      case 'eraser': {
        commitFloat();
        const l = drawable();
        if (!l) return;
        const stroke = new Stroke(l.px, pix.w, pix.h, paintWith(value), perfect && tool === 'pencil');
        stroke.to(p);
        drag = { kind: 'stroke', stroke, layer: l };
        if (stroke.dirty) changed({ layer: l.id, rect: stroke.dirty });
        return;
      }
      case 'fill': {
        commitFloat();
        const l = drawable();
        if (!l) return;
        const before = l.px.slice();
        record(l, before, floodFill(l.px, pix.w, pix.h, p.x, p.y, value, contiguous, selection));
        return;
      }
      case 'line':
      case 'rect':
      case 'ellipse':
        commitFloat();
        if (!drawable()) return;
        drag = { kind: 'shape', a: p, value };
        preview = { points: shapePoints(p, p), value };
        return;
      case 'select':
        if (float && inside(p, { x: float.x, y: float.y, w: float.w, h: float.h })) {
          drag = { kind: 'float', start: p, from: { x: float.x, y: float.y } };
        } else if (!float && inside(p, selection) && lift()) {
          drag = { kind: 'float', start: p, from: { x: float!.x, y: float!.y } };
        } else {
          commitFloat();
          drag = { kind: 'marquee', a: p, moved: false };
        }
        return;
      case 'move':
        if (!float) {
          selection ??= full();
          if (!lift()) return;
        }
        drag = { kind: 'float', start: p, from: { x: float!.x, y: float!.y } };
        return;
    }
  }

  function onpointermove(e: PointerEvent) {
    const p = toPx(e);
    if (!hover || hover.x !== p.x || hover.y !== p.y) hover = p;
    const d = drag;
    if (!d) return;
    if (d.kind === 'pan') {
      pan = { x: d.from.x + e.clientX - d.sx, y: d.from.y + e.clientY - d.sy };
    } else if (d.kind === 'stroke') {
      d.stroke.to(p);
      if (d.stroke.dirty) changed({ layer: d.layer.id, rect: d.stroke.dirty });
    } else if (d.kind === 'shape') {
      const b = e.shiftKey ? constrain(d.a, p, tool === 'line' ? 'line' : 'box') : p;
      preview = { points: shapePoints(d.a, b), value: d.value };
    } else if (d.kind === 'marquee') {
      const b = { x: Math.max(0, Math.min(pix.w - 1, p.x)), y: Math.max(0, Math.min(pix.h - 1, p.y)) };
      const a = { x: Math.max(0, Math.min(pix.w - 1, d.a.x)), y: Math.max(0, Math.min(pix.h - 1, d.a.y)) };
      d.moved ||= p.x !== d.a.x || p.y !== d.a.y;
      selection = rectFrom(a, b);
    } else if (d.kind === 'float' && float) {
      float = { ...float, x: d.from.x + p.x - d.start.x, y: d.from.y + p.y - d.start.y };
    }
  }

  function onpointerup() {
    const d = drag;
    drag = null;
    panning = false;
    if (!d) return;
    if (d.kind === 'stroke') {
      const r = d.stroke.dirty;
      if (r) {
        hist.pixels(d.layer.id, r, extract(d.stroke.before, pix.w, r), extract(d.layer.px, pix.w, r));
        changed('view');
      }
    } else if (d.kind === 'shape' && preview) {
      const l = drawable();
      const points = preview.points;
      preview = null;
      if (l) {
        const before = l.px.slice();
        record(l, before, stamp(l.px, pix.w, pix.h, points, paintWith(d.value)));
      }
    } else if (d.kind === 'marquee' && !d.moved) {
      // A click, not a drag: no selection.
      selection = null;
    }
  }

  function onpointerleave() {
    hover = null;
  }

  // ── Life in the library ─────────────────────────────────────────────

  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let draftKept = !!start.draft;

  $effect(() => {
    void rev;
    const isDirty = dirty;
    if (failed || recovered) return;
    clearTimeout(draftTimer);
    if (!isDirty) {
      if (draftKept) {
        draftKept = false;
        api.discardDraft(meta.id).catch(() => {});
      }
      return;
    }
    draftTimer = setTimeout(() => {
      api
        .putDraft(meta.id, versionId, serializeLpx(pix))
        .then(() => (draftKept = true))
        .catch((e) => notes.say(`Couldn't keep a draft: ${errorMessage(e)}`));
    }, prefs.value?.draft.delayMs ?? 2000);
  });

  function keepRecovered() {
    if (!recovered) return;
    const back = load(recovered.content);
    failed = null;
    if (back) {
      pix = back;
      hist = new PixHistory();
      savedMark = -1;
      forcedDirty = true;
      selection = null;
      float = null;
      active = back.layers.at(-1)!.id;
      changed('all');
    }
    recovered = null;
  }

  function discardRecovered() {
    recovered = null;
    draftKept = false;
    api.discardDraft(meta.id).catch(() => {});
  }

  async function save(): Promise<boolean> {
    if (saving || failed) return false;
    commitFloat();
    if (!dirty) {
      say('no changes to save');
      return true;
    }
    saving = true;
    try {
      const body = serializeLpx(pix);
      const picture = await thumbnailLpx(pix, THUMB_SIDE).catch(() => null);
      const r = await api.saveDocument(meta.id, body, picture);
      clearTimeout(draftTimer);
      draftKept = false;
      savedMark = hist.mark;
      forcedDirty = false;
      if (r.status === 'saved') {
        meta = r.meta;
        versionId = r.version.id;
      }
      say(`saved ${meta.name}`);
      return true;
    } catch (e) {
      say(errorMessage(e));
      return false;
    } finally {
      saving = false;
    }
  }

  async function rename(name: string): Promise<boolean> {
    try {
      meta = await api.renameDocument(meta.id, name);
      return true;
    } catch (e) {
      say(errorMessage(e));
      return false;
    }
  }

  function requestClose() {
    commitFloat();
    if (dirty && !failed) closing = true;
    else finish();
  }

  function finish() {
    clearTimeout(draftTimer);
    onclose(meta);
  }

  async function saveAndClose() {
    closing = false;
    if (await save()) finish();
  }

  function discardAndClose() {
    closing = false;
    clearTimeout(draftTimer);
    api.discardDraft(meta.id).catch(() => {});
    finish();
  }

  function popupAt(el: HTMLElement | undefined, items: MenuItem[]) {
    const r = el?.getBoundingClientRect();
    popup = { x: r ? r.right - 220 : 200, y: r ? r.bottom + 6 : 60, items };
  }

  const SCALES = [1, 2, 4, 8, 16, 32];
  const FORMATS: ExportFormat[] = [
    { id: 'png', ext: 'png', label: 'PNG', styled: true },
    { id: 'lpx', ext: 'lpx', label: '.lpx', styled: false },
  ];

  let exportOpen = $state(false);

  function openExport() {
    commitFloat();
    exportOpen = true;
  }

  async function exportAs(choice: ExportChoice) {
    exportOpen = false;
    if (exporting) return;
    commitFloat();
    const lpx = choice.format === 'lpx';
    const ext = lpx ? 'lpx' : 'png';
    exporting = true;
    try {
      const dir = prefs.value?.export.lastDir;
      const file = lpx ? `${meta.name}.lpx` : `${meta.name}${choice.scale === 1 ? '' : `@${choice.scale}x`}.png`;
      let path = await api.pickSavePath(dir ? `${dir}/${file}` : file, ext);
      if (!path) return;
      if (!new RegExp(`\\.${ext}$`, 'i').test(path)) path += `.${ext}`;
      const bytes = lpx ? new TextEncoder().encode(serializeLpx(pix)) : await exportPng(pix, choice.scale, { backdrop: choice.backdrop, grid: choice.grid });
      await api.writeExport(path, bytes);
      const slash = path.lastIndexOf('/');
      if (slash > 0) prefs.set('export.lastDir', path.slice(0, slash));
      if (!lpx && choice.scale !== prefs.value?.lpx.exportScale) prefs.set('lpx.exportScale', choice.scale);
      say(`exported ${path.slice(slash + 1)} (${Math.max(1, Math.round(bytes.length / 1024))} KB)`);
    } catch (e) {
      say(errorMessage(e));
    } finally {
      exporting = false;
    }
  }

  function openImage() {
    popupAt(imageButton, [
      {
        label: 'Canvas size…',
        icon: Scaling,
        run: () => {
          commitFloat();
          sizing = true;
        },
      },
      { separator: true },
      { label: 'Flip horizontally', icon: ArrowLeftRight, run: () => (commitFloat(), (selection = null), took(flipCanvas(pix, hist, 'h'))) },
      { label: 'Flip vertically', icon: ArrowUpDown, run: () => (commitFloat(), (selection = null), took(flipCanvas(pix, hist, 'v'))) },
      { label: 'Turn a quarter clockwise', icon: RotateCw, run: () => (commitFloat(), (selection = null), took(rotateCanvas(pix, hist))) },
    ]);
  }

  // ── The panel's actions ─────────────────────────────────────────────

  function layerAction(what: 'add' | 'duplicate' | 'delete' | 'merge' | 'up' | 'down') {
    commitFloat();
    if (what === 'add') took(addLayer(pix, hist, active), true);
    else if (what === 'duplicate') took(duplicateLayer(pix, hist, active), true);
    else if (what === 'delete') took(deleteLayer(pix, hist, active));
    else if (what === 'merge') {
      const l = layerById(pix, active);
      const r = mergeDown(pix, hist, active);
      took(r, true);
      if (!('error' in r) && l && l.op < 100) say('merged; its opacity isn’t kept, since palette colours can’t blend');
    } else took(moveLayer(pix, hist, active, what === 'up' ? 1 : -1));
  }

  function removePrimary() {
    const i = primary;
    const r = removeColour(pix, hist, i);
    if ('error' in r) return say(r.error);
    primary = Math.min(i, pix.pal.length - 1);
    if (secondary === i) secondary = 0;
    else if (secondary > i) secondary--;
    changed('all');
  }

  async function savePalette() {
    const name = paletteName.trim();
    if (!name) return;
    naming = false;
    try {
      await api.savePalette(name, pix.pal.slice(1));
      palettes = await api.listPalettes();
      say(`saved the palette ${name}`);
    } catch (e) {
      say(errorMessage(e));
    }
  }

  async function deletePalette(p: Palette) {
    try {
      await api.deletePalette(p.id);
      palettes = await api.listPalettes();
    } catch (e) {
      say(errorMessage(e));
    }
  }

  let unmenu: (() => void) | undefined;

  onMount(() => {
    rebuild();
    resizeCanvasEl();
    raf = requestAnimationFrame(frame);
    canvas?.addEventListener('wheel', onwheel, { passive: false });
    if (canvas) {
      observer = new ResizeObserver(resizeCanvasEl);
      observer.observe(canvas);
    }
    unmenu = onMenu(menu);
    for (const t of ['copy', 'cut', 'paste']) document.addEventListener(t, onclipboard as EventListener);
    api.listPalettes().then((p) => (palettes = p)).catch(() => {});
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearTimeout(draftTimer);
    canvas?.removeEventListener('wheel', onwheel);
    observer?.disconnect();
    unmenu?.();
    for (const t of ['copy', 'cut', 'paste']) document.removeEventListener(t, onclipboard as EventListener);
  });

  const cursor = $derived(
    panning ? 'grabbing' : tool === 'hand' || spaceDown ? 'grab' : tool === 'move' ? 'move' : tool === 'picker' ? 'copy' : 'crosshair',
  );
  const statusText = $derived.by(() => {
    void rev;
    const parts = [label(tool)];
    if (BRUSHED.includes(tool)) parts.push(`size ${size}`);
    if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < pix.w && hover.y < pix.h) {
      const i = indexAt(pix, hover.x, hover.y);
      parts.push(`x ${hover.x}, y ${hover.y}`, i === 0 ? 'transparent' : `colour ${i}`);
    }
    const sel = float ?? selection;
    if (sel) parts.push(`${float ? 'moving' : 'selected'} ${sel.w} × ${sel.h}`);
    return parts.join(' · ');
  });
  const fileState = $derived(saving ? 'Saving…' : exporting ? 'Exporting…' : dirty ? 'Not saved' : `Saved ${ago(meta.updatedAt)}`);
</script>

<svelte:window {onkeydown} {onkeyup} {onpointerup} onpointercancel={onpointerup} />

<EditorFrame name={meta.name} ext=".lpx" {dirty} onback={requestClose} onrename={rename} onversions={onversions && !failed ? () => onversions(meta, dirty) : undefined}>
  {#snippet actions()}
    {#if !failed}
      <button class="icon-btn" title="Undo (⌘Z)" disabled={!canUndo} onclick={undo}><Undo2 size={16} /></button>
      <button class="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo} onclick={redo}><Redo2 size={16} /></button>
      <span class="sep"></span>
      <button class="icon-btn" title="Zoom out (−)" onclick={() => run({ do: 'zoom', by: 'out' })}><ZoomOut size={16} /></button>
      <button class="zoom" title="Fit (z)" onclick={fit}>{zoom * 100}%</button>
      <button class="icon-btn" title="Zoom in (+)" onclick={() => run({ do: 'zoom', by: 'in' })}><ZoomIn size={16} /></button>
      <span class="sep"></span>
      <button class="btn" bind:this={imageButton} onclick={openImage}><ImageIcon size={15} /> Image</button>
      <button class="btn" title="Export (⌘E)" onclick={openExport}><FileOutput size={15} /> Export</button>
      <button class="btn" class:primary={dirty} disabled={saving || !dirty} title="Save (⌘S)" onclick={() => save()}>
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
      <button
        class="icon-btn"
        title="Show or hide the panel (⌥⌘I)"
        aria-pressed={!!prefs.value?.ui.inspectorOpen}
        onclick={() => prefs.set('ui.inspectorOpen', !prefs.value?.ui.inspectorOpen)}
      >
        <PanelRight size={17} />
      </button>
    {/if}
  {/snippet}

  {#snippet banner()}
    {#if recovered}
      <div class="banner">
        <span>Unsaved changes from {ago(recovered.updatedAt)} were kept{recovered.baseVersionId !== versionId ? ', made before the last save' : ''}.</span>
        <button class="btn" onclick={discardRecovered}>Discard</button>
        <button class="btn primary" onclick={keepRecovered}>Restore them</button>
      </div>
    {/if}
  {/snippet}

  {#if failed}
    <div class="failed">
      <h2>This file can't be opened as pixel art</h2>
      <p>{failed}</p>
      <button class="btn" onclick={finish}>Back to the library</button>
    </div>
  {:else}
    <div class="work">
      <div class="rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
        {#each TOOLS as t, i (t.tool)}
          {#if i === 3 || i === 6 || i === 9}<span class="rule"></span>{/if}
          <button class="tool" aria-pressed={tool === t.tool} title="{t.label} ({t.key})" onclick={() => setTool(t.tool)}>
            <t.icon size={18} strokeWidth={1.8} />
          </button>
        {/each}
        <span class="rule"></span>
        <button class="tool" aria-pressed={showGrid} title="Pixel grid (from 800%)" onclick={() => ((showGrid = !showGrid), prefs.set('lpx.showGrid', showGrid))}>
          <Grid2x2 size={18} strokeWidth={1.8} />
        </button>
        <span class="grow"></span>
        <button class="tool" title="Keyboard shortcuts (⌘/)" onclick={() => (sheet = true)}><Keyboard size={18} strokeWidth={1.8} /></button>
      </div>

      <div class="main">
        <div class="options">
          <span class="tool-name">{label(tool)}</span>
          {#if BRUSHED.includes(tool)}
            <div class="stepper" role="group" aria-label="Brush size">
              <button class="icon-btn" title="Smaller ([)" disabled={size <= 1} onclick={() => run({ do: 'size', by: -1 })}>−</button>
              <span>{size}px</span>
              <button class="icon-btn" title="Bigger (])" disabled={size >= 8} onclick={() => run({ do: 'size', by: 1 })}>+</button>
            </div>
            {#if size > 2}
              <div class="seg" role="group" aria-label="Brush shape">
                <button aria-pressed={!round} onclick={() => (round = false)}>Square</button>
                <button aria-pressed={round} onclick={() => (round = true)}>Round</button>
              </div>
            {/if}
          {/if}
          {#if tool === 'rect' || tool === 'ellipse'}
            <div class="seg" role="group" aria-label="Fill">
              <button aria-pressed={!filled} onclick={() => (filled = false)}>Outline</button>
              <button aria-pressed={filled} onclick={() => (filled = true)}>Filled</button>
            </div>
          {/if}
          {#if tool === 'fill'}
            <div class="seg" role="group" aria-label="Fill what">
              <button aria-pressed={contiguous} onclick={() => (contiguous = true)}>Touching</button>
              <button aria-pressed={!contiguous} onclick={() => (contiguous = false)}>All of that colour</button>
            </div>
          {/if}
          {#if BRUSHED.includes(tool) || tool === 'fill'}
            {#if tool !== 'fill'}
              <label class="check"><input type="checkbox" bind:checked={mirrorX} /> Mirror ↔</label>
              <label class="check"><input type="checkbox" bind:checked={mirrorY} /> Mirror ↕</label>
            {/if}
            {#if tool === 'pencil' && size === 1}
              <label class="check" title="Takes out the extra corner pixels where a line steps"><input type="checkbox" bind:checked={perfect} /> Pixel-perfect</label>
            {/if}
          {/if}
          {#if tool === 'select' || tool === 'move'}
            {#if float}
              <button class="btn small" onclick={commitFloat}>Put down (⏎)</button>
            {:else if selection}
              <button class="btn small" onclick={() => (selection = null)}>Deselect (esc)</button>
            {:else}
              <span class="dim">{tool === 'select' ? 'Drag out a rectangle' : 'Drag to move the whole layer'}</span>
            {/if}
          {/if}
          {#if tool === 'picker'}
            <span class="dim">Click picks the first colour, right-click the second</span>
          {/if}
          <span class="grow"></span>
          {#if activeLayer}<span class="dim">on {activeLayer.name}{activeLayer.lock ? ' (locked)' : ''}</span>{/if}
          <span class="dim">{pix.w} × {pix.h}</span>
        </div>
        <div class="canvas-wrap">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <canvas
            bind:this={canvas}
            aria-label="Image {meta.name}"
            style:cursor
            {onpointerdown}
            {onpointermove}
            {onpointerleave}
            oncontextmenu={(e) => e.preventDefault()}
          ></canvas>
        </div>
      </div>

      {#if prefs.value?.ui.inspectorOpen}
        <PixelPanel
          {pix}
          {rev}
          {active}
          {primary}
          {secondary}
          {palettes}
          onactive={(id) => {
            commitFloat();
            active = id;
          }}
          onprimary={(i) => (primary = i)}
          onsecondary={(i) => (secondary = i)}
          onswap={() => run({ do: 'swap' })}
          onlayer={layerAction}
          onlayerset={(id, change) => took(setLayer(pix, hist, id, change))}
          oncolour={(i, hex) => took(setColour(pix, hist, i, hex))}
          onaddcolour={(hex) => {
            const r = addColour(pix, hist, hex);
            took(r);
            if (!('error' in r) && r.id) primary = r.id;
          }}
          onremovecolour={removePrimary}
          onusepalette={(c, name) => {
            const r = usePalette(pix, hist, c);
            took(r);
            if (!('error' in r)) {
              say(`using ${name}`);
              primary = Math.min(primary, pix.pal.length - 1);
              secondary = Math.min(secondary, pix.pal.length - 1);
            }
          }}
          onsavepalette={() => {
            paletteName = '';
            naming = true;
          }}
          ondeletepalette={(p) => (deletingPalette = p)}
        />
      {/if}
    </div>
  {/if}

  {#snippet status()}
    <div class="line">
      <span class="what">{failed ? '' : statusText}</span>
      <span class="file">{fileState}</span>
    </div>
  {/snippet}
</EditorFrame>

{#if exportOpen}
  <ExportDialog
    kind="lpx"
    formats={FORMATS}
    fallback={{ backdrop: 'none', scale: prefs.value?.lpx.exportScale ?? 8 }}
    scales={SCALES}
    gridFrom={MIN_GRID_SCALE}
    clear
    size={{ w: pix.w, h: pix.h }}
    onclose={() => (exportOpen = false)}
    onexport={exportAs}
  />
{/if}

{#if popup}
  <ContextMenu {...popup} onclose={() => (popup = null)} />
{/if}
{#if sheet}
  <ShortcutSheet title="Pixel art shortcuts" groups={LPX_SHORTCUTS} onclose={() => (sheet = false)} />
{/if}
{#if sizing}
  <CanvasSizeDialog
    w={pix.w}
    h={pix.h}
    onclose={() => (sizing = false)}
    onresize={(w, h, ax, ay) => {
      sizing = false;
      selection = null;
      took(resizeCanvas(pix, hist, w, h, ax, ay));
      fit();
    }}
  />
{/if}
{#if naming}
  <Dialog title="Save this palette" onclose={() => (naming = false)} width={380}>
    <form id="palette-name" onsubmit={(e) => (e.preventDefault(), savePalette())}>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" placeholder="Name" bind:value={paletteName} autofocus />
      <p class="dim small-print">{pix.pal.length - 1} colours. Saved palettes can start new images, or be used in any image.</p>
    </form>
    {#snippet actions()}
      <button class="btn" onclick={() => (naming = false)}>Cancel</button>
      <button class="btn primary" type="submit" form="palette-name" disabled={!paletteName.trim()}>Save</button>
    {/snippet}
  </Dialog>
{/if}
{#if deletingPalette}
  {@const p = deletingPalette}
  <Confirm
    title="Delete the palette “{p.name}”?"
    message="Images that used it keep their colours."
    confirm="Delete"
    danger
    onclose={() => (deletingPalette = null)}
    onconfirm={() => deletePalette(p)}
  />
{/if}
{#if closing}
  <Dialog title="Save changes to “{meta.name}”?" onclose={() => (closing = false)} width={420}>
    <p class="dim">If you don't, the changes are lost.</p>
    {#snippet actions()}
      <button class="btn" onclick={discardAndClose}>Don't save</button>
      <span class="grow"></span>
      <button class="btn" onclick={() => (closing = false)}>Cancel</button>
      <button class="btn primary" onclick={saveAndClose}>Save</button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .work {
    position: absolute;
    inset: 0;
    display: flex;
  }
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 48px;
    flex: none;
    padding: 8px 0;
    overflow-y: auto;
    border-right: 1px solid var(--faint);
  }
  .tool {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    cursor: pointer;
  }
  .tool:hover {
    color: var(--ink);
  }
  .tool[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .rule {
    width: 22px;
    height: 1px;
    flex: none;
    margin: 5px 0;
    background: var(--faint);
  }
  .grow {
    flex: 1;
  }
  .main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .options {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
    height: 40px;
    padding: 0 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--faint);
    white-space: nowrap;
  }
  .tool-name {
    font-weight: 600;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--faint);
    border-radius: var(--radius);
  }
  .stepper span {
    min-width: 34px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .options .seg button {
    height: 24px;
    padding: 0 10px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--dim);
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
  }
  .dim {
    color: var(--dim);
  }
  .small {
    height: 26px;
  }
  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--faint);
  }
  .zoom {
    min-width: 58px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dim);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .zoom:hover {
    color: var(--ink);
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--line);
  }
  .banner span {
    flex: 1;
  }
  .banner .btn {
    height: 26px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 14px;
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file {
    color: var(--dim);
    font-size: 12px;
  }
  .failed {
    max-width: 560px;
    margin: 12vh auto 0;
    padding: 0 24px;
  }
  .failed h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .failed p {
    margin: 0 0 18px;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 12px;
  }
  .small-print {
    margin: 10px 0 0;
    font-size: 12px;
  }
</style>
