<!--
  A .ldw drawing, open for drawing on. Pen and highlighter strokes follow the
  pointer through a steadying string (the smoothing setting), and are thinned
  to the points that matter when they're done (lib/ldw/geometry.ts). The
  eraser takes out every stroke it touches; the shape tools draw lines,
  rectangles and ellipses as strokes. Select (s) picks a stroke by clicking it,
  or several by drawing round them; dragging inside the selection moves it,
  and the bar along the top restyles or arranges it.

  Every change makes a new drawing (lib/ldw/edit.ts), so undo keeps the old
  ones. Saving, drafts, closing and export work as in the other editors.
-->
<script lang="ts">
  import {
    BringToFront,
    Circle,
    Copy,
    Eraser,
    FileOutput,
    Hand,
    Highlighter,
    Keyboard,
    Lasso,
    Minus,
    PanelRight,
    PenLine,
    Plus,
    Redo2,
    Scaling,
    SendToBack,
    Slash,
    Square,
    StickyNote,
    Trash,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { onDestroy, onMount, untrack, type Component } from 'svelte';
  import { api } from '../../lib/api';
  import { THUMB_SIDE } from '../../lib/kinds';
  import { getStrokes, setStrokes } from '../../lib/ldw/clip';
  import { drawDrawing, drawStroke, exportImage, exportSvg, selectionBox, thumbnailLdw } from '../../lib/ldw/draw';
  import {
    History,
    addStroke,
    moveStrokes,
    pasteStrokes,
    removeStrokes,
    reorder,
    restyle,
    scaleStrokes,
    setPage,
    type Ink,
  } from '../../lib/ldw/edit';
  import { parseLdw, serializeLdw } from '../../lib/ldw/format';
  import {
    LazyPen,
    boundsOf,
    boxFrom,
    ellipsePts,
    lassoed,
    linePts,
    onStroke,
    rectPts,
    simplify,
    strokeAt,
    type Box,
    type Pt,
  } from '../../lib/ldw/geometry';
  import { LDW_SHORTCUTS, drawCommandFor, type DrawCommand, type DrawTool } from '../../lib/ldw/keys';
  import { HIGHLIGHTER, INKS, MAX_SIDE, MIN_SIDE, WIDTHS, blankDrawing, parseRgb, type Drawing, type Stroke } from '../../lib/ldw/model';
  import type { MenuId } from '../../lib/menu-ids';
  import { isTextField, onMenu } from '../../lib/menu-router';
  import { notes } from '../../lib/notes.svelte';
  import { prefs } from '../../lib/prefs.svelte';
  import { ago } from '../../lib/time';
  import { errorMessage, type DocMeta, type Opened } from '../../lib/types';
  import ShortcutSheet from '../shell/ShortcutSheet.svelte';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import Dialog from '../ui/Dialog.svelte';
  import type { MenuItem } from '../ui/menu';
  import EditorFrame from './EditorFrame.svelte';

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

  function load(text: string): Drawing | null {
    try {
      return parseLdw(text);
    } catch (e) {
      failed = errorMessage(e);
      return null;
    }
  }

  const first = load(start.content) ?? blankDrawing();
  const firstText = serializeLdw(first);
  let doc = $state.raw<Drawing>(first);
  let saved = $state(firstText);
  let recovered = $state(start.draft && start.draft.content !== firstText ? start.draft : null);
  const history = new History();

  let tool = $state<DrawTool>('pen');
  let pen = $state({ ...p0.ldw.pen });
  let hl = $state({ ...HIGHLIGHTER });
  let smoothing = $state(p0.ldw.smoothing);
  let recent = $state<string[]>([]);
  let sel = $state.raw<number[]>([]);
  let spaceDown = $state(false);

  /** Scale from page to screen, on top of fitting the page in the window (1 fits). */
  let zoom = $state(1);
  let pan = $state.raw<Pt>({ x: 0, y: 0 });
  /** The stroke being drawn, a shape being dragged out, the lasso, and the eraser's ring. */
  let live = $state.raw<Stroke | null>(null);
  let lasso = $state.raw<Pt[] | null>(null);
  let pointer = $state.raw<Pt | null>(null);
  let panning = $state(false);

  let closing = $state(false);
  let sheet = $state(false);
  let sizing = $state(false);
  let pageW = $state(0);
  let pageH = $state(0);
  let popup = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let saving = $state(false);
  let exporting = $state(false);
  let exportButton: HTMLButtonElement | undefined = $state();
  let pageButton: HTMLButtonElement | undefined = $state();

  const dirty = $derived(serializeLdw(doc) !== saved);
  const canUndo = $derived((void doc, history.canUndo));
  const canRedo = $derived((void doc, history.canRedo));
  const selected = $derived(doc.items.filter((s) => sel.includes(s.id)));
  /** The ink the current tool puts down. */
  const ink: Ink = $derived(tool === 'hl' ? { t: 'hl', c: hl.color, w: hl.width, o: hl.opacity } : { t: 'pen', c: pen.color, w: pen.width, o: pen.opacity });

  const TOOLS: { tool: DrawTool; label: string; key: string; icon: Component }[] = [
    { tool: 'pen', label: 'Pen', key: 'p', icon: PenLine },
    { tool: 'hl', label: 'Highlighter', key: 'h', icon: Highlighter },
    { tool: 'eraser', label: 'Eraser', key: 'e', icon: Eraser },
    { tool: 'lasso', label: 'Select', key: 's', icon: Lasso },
    { tool: 'line', label: 'Line', key: 'l', icon: Slash },
    { tool: 'rect', label: 'Rectangle', key: 'r', icon: Square },
    { tool: 'ellipse', label: 'Ellipse', key: 'o', icon: Circle },
    { tool: 'hand', label: 'Move the page', key: 'space', icon: Hand },
  ];
  const label = (t: DrawTool) => TOOLS.find((x) => x.tool === t)!.label;
  const INKED: DrawTool[] = ['pen', 'hl', 'line', 'rect', 'ellipse'];

  function say(text: string) {
    notes.say(text.charAt(0).toUpperCase() + text.slice(1));
  }

  /** Makes `next` the drawing, as one step of undo. */
  function take(next: Drawing) {
    if (next === doc) return;
    history.push(doc);
    doc = next;
  }

  // ── The view ────────────────────────────────────────────────────────

  let canvas: HTMLCanvasElement | undefined = $state();
  let width = 0;
  let height = 0;
  let raf = 0;
  let redraw = true;
  let observer: ResizeObserver | undefined;

  function fitScale() {
    return width > 0 ? Math.min(2, (width - 48) / doc.w, (height - 48) / doc.h) : 1;
  }

  function view() {
    const scale = fitScale() * zoom;
    return { scale, x: (width - doc.w * scale) / 2 + pan.x, y: (height - doc.h * scale) / 2 + pan.y };
  }

  function zoomAt(factor: number, sx = width / 2, sy = height / 2) {
    const z = Math.min(8, Math.max(0.25, zoom * factor));
    if (z === zoom) return;
    const was = view();
    const under = { x: (sx - was.x) / was.scale, y: (sy - was.y) / was.scale };
    zoom = z;
    const now = view();
    pan = { x: pan.x + (sx - (now.x + under.x * now.scale)), y: pan.y + (sy - (now.y + under.y * now.scale)) };
  }

  function fit() {
    zoom = 1;
    pan = { x: 0, y: 0 };
  }

  function resizeCanvas() {
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    redraw = true;
  }

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  let checker: CanvasPattern | null = null;
  function makeChecker(ctx: CanvasRenderingContext2D): CanvasPattern {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 32;
    const t = tile.getContext('2d')!;
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, 32, 32);
    t.fillStyle = '#e4e4e4';
    t.fillRect(0, 0, 16, 16);
    t.fillRect(16, 16, 16, 16);
    return ctx.createPattern(tile, 'repeat')!;
  }

  function paint() {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const v = view();
    const paper = css('--paper') || '#000';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y);
    const px = 1 / v.scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.w, doc.h);
    ctx.clip();
    if (doc.bg === 'none') {
      // A transparent page: a light checkerboard, so ink of any colour shows.
      checker ??= makeChecker(ctx);
      ctx.fillStyle = checker;
      ctx.fillRect(0, 0, doc.w, doc.h);
    }
    drawDrawing(ctx, doc, 'rgba(0,0,0,0)');
    if (live) drawStroke(ctx, live);
    ctx.restore();
    ctx.strokeStyle = css('--faint') || '#333';
    ctx.lineWidth = px;
    ctx.strokeRect(0, 0, doc.w, doc.h);

    // Marks over the page are two-tone, a dark line under light dashes, so they show on any page colour.
    const mark = (trace: () => void, dashed: boolean) => {
      ctx.lineWidth = 2.5 * px;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.setLineDash([]);
      ctx.beginPath();
      trace();
      ctx.stroke();
      ctx.lineWidth = 1.25 * px;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash(dashed ? [5 * px, 4 * px] : []);
      ctx.beginPath();
      trace();
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (selected.length) {
      const b = selectionBox(selected, 6 * px)!;
      mark(() => ctx.rect(b.x, b.y, b.w, b.h), true);
    }
    if (lasso && lasso.length > 1) {
      const poly = lasso;
      mark(() => {
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
      }, true);
    }
    if (pointer && !panning && !spaceDown) {
      const at = pointer;
      if (tool === 'eraser') mark(() => ctx.arc(at.x, at.y, ERASER * px, 0, Math.PI * 2), false);
      // Where the pen would touch, as big as its stroke.
      else if ((tool === 'pen' || tool === 'hl') && !live) mark(() => ctx.arc(at.x, at.y, Math.max(ink.w / 2, 2 * px), 0, Math.PI * 2), false);
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (redraw) {
      redraw = false;
      paint();
    }
  }

  $effect(() => {
    void [doc, sel, live, lasso, pointer, zoom, pan, tool, ink, spaceDown, panning];
    redraw = true;
  });

  $effect(() => {
    void prefs.value?.theme;
    requestAnimationFrame(() => (redraw = true));
  });

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const box = canvas!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
    else pan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY };
  }

  // ── Ink ─────────────────────────────────────────────────────────────

  /** Changes the ink of the current tool, or restyles the selection if there is one. */
  function setColour(c: string) {
    const hex = parseRgb(c);
    if (!hex) return;
    recent = [hex, ...recent.filter((r) => r !== hex)].slice(0, 6);
    if (sel.length && tool === 'lasso') return take(restyle(doc, sel, { c: hex }));
    if (tool === 'hl') hl = { ...hl, color: hex };
    else setPen({ color: hex });
  }

  function setWidth(w: number) {
    if (sel.length && tool === 'lasso') return take(restyle(doc, sel, { w }));
    if (tool === 'hl') hl = { ...hl, width: w };
    else setPen({ width: w });
  }

  function setPen(change: Partial<typeof pen>) {
    pen = { ...pen, ...change };
    prefs.set('ldw.pen', pen);
  }

  /** A selection's opacity being dragged: one undo step from where it started. */
  let sliding: Drawing | null = null;
  function slideOpacity(o: number, done: boolean) {
    if (sel.length && tool === 'lasso') {
      sliding ??= doc;
      doc = restyle(doc, sel, { o });
      if (done) {
        if (sliding !== doc) history.push(sliding);
        sliding = null;
      }
      return;
    }
    if (tool === 'hl') hl = { ...hl, opacity: o };
    else if (done) setPen({ opacity: o });
    else pen = { ...pen, opacity: o };
  }

  const shownWidth = $derived(sel.length && tool === 'lasso' ? (selected.every((s) => s.w === selected[0]?.w) ? selected[0]?.w : null) : ink.w);
  const shownColour = $derived(sel.length && tool === 'lasso' ? (selected.every((s) => s.c === selected[0]?.c) ? selected[0]?.c : null) : ink.c);
  const shownOpacity = $derived(sel.length && tool === 'lasso' ? (selected[0]?.o ?? 100) : ink.o);

  // ── Doing things ────────────────────────────────────────────────────

  const ERASER = 10;

  function setTool(t: DrawTool) {
    tool = t;
    if (t !== 'lasso') sel = [];
  }

  function run(c: DrawCommand) {
    switch (c.do) {
      case 'tool':
        return setTool(c.tool);
      case 'width': {
        const now = shownWidth ?? ink.w;
        const i = WIDTHS.findIndex((w) => w >= now);
        const at = i < 0 ? WIDTHS.length - 1 : WIDTHS[i] === now ? i : c.by > 0 ? i - 1 : i;
        return setWidth(WIDTHS[Math.max(0, Math.min(WIDTHS.length - 1, at + c.by))]);
      }
      case 'nudge':
        if (sel.length) take(moveStrokes(doc, sel, c.dx, c.dy));
        return;
      case 'zoom':
        return c.by === 'fit' ? fit() : zoomAt(c.by === 'in' ? 1.25 : 0.8);
      case 'escape':
        if (lasso) lasso = null;
        else if (sel.length) sel = [];
        return;
      case 'delete':
        if (!sel.length) return say('nothing is selected');
        take(removeStrokes(doc, sel));
        sel = [];
        return;
      case 'undo':
      case 'redo': {
        const back = c.do === 'undo' ? history.undo(doc) : history.redo(doc);
        if (!back) return say(`nothing to ${c.do}`);
        doc = back;
        sel = sel.filter((id) => doc.items.some((s) => s.id === id));
        return;
      }
      case 'copy':
        if (!sel.length) return say('nothing is selected');
        setStrokes(selected);
        return say(`copied ${sel.length} stroke${sel.length === 1 ? '' : 's'}`);
      case 'cut':
        if (!sel.length) return say('nothing is selected');
        setStrokes(selected);
        take(removeStrokes(doc, sel));
        sel = [];
        return;
      case 'paste': {
        const clip = getStrokes();
        if (!clip.length) return say('nothing copied yet: select strokes and press ⌘C');
        // Where the pointer is, if it's on the page; else a little off from where they were.
        const b = boundsOf(clip);
        let dx = 20;
        let dy = 20;
        if (b && pointer && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= doc.w && pointer.y <= doc.h) {
          dx = pointer.x - (b.x + b.w / 2);
          dy = pointer.y - (b.y + b.h / 2);
        }
        const r = pasteStrokes(doc, clip, dx, dy);
        take(r.d);
        tool = 'lasso';
        sel = r.ids;
        return;
      }
      case 'duplicate': {
        if (!sel.length) return say('nothing is selected');
        const r = pasteStrokes(doc, selected, 20, 20);
        take(r.d);
        sel = r.ids;
        return;
      }
      case 'all':
        tool = 'lasso';
        sel = doc.items.map((s) => s.id);
        return;
      case 'save':
        void save();
        return;
      case 'export':
        return openExport();
    }
  }

  function keysElsewhere(target: EventTarget | null): boolean {
    return closing || sheet || sizing || popup !== null || !!document.querySelector('dialog[open]') || isTextField(target as HTMLInputElement | null);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || failed || keysElsewhere(e.target)) return;
    if (e.key === ' ') {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    const c = drawCommandFor(e);
    if (!c) return;
    e.preventDefault();
    run(c);
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.key === ' ') spaceDown = false;
  }

  function menu(id: MenuId): boolean {
    if (failed) return id === 'close' ? (finish(), true) : false;
    const map: Partial<Record<MenuId, DrawCommand>> = {
      undo: { do: 'undo' },
      redo: { do: 'redo' },
      selectAll: { do: 'all' },
      duplicate: { do: 'duplicate' },
      delete: { do: 'delete' },
      'zoom.in': { do: 'zoom', by: 'in' },
      'zoom.out': { do: 'zoom', by: 'out' },
      'zoom.fit': { do: 'zoom', by: 'fit' },
    };
    if (id === 'save') void save();
    else if (id === 'close') requestClose();
    else if (id === 'export') openExport();
    else if (id === 'help.shortcuts') sheet = true;
    else if (map[id]) run(map[id]!);
    else return false;
    return true;
  }

  function onclipboard(e: ClipboardEvent) {
    if (failed || keysElsewhere(document.activeElement)) return;
    e.preventDefault();
    run({ do: e.type === 'paste' ? 'paste' : e.type === 'cut' ? 'cut' : 'copy' });
  }

  // ── Mouse ───────────────────────────────────────────────────────────

  type Drag =
    | { kind: 'pan'; sx: number; sy: number; from: Pt }
    | { kind: 'ink'; lazy: LazyPen; pts: Pt[] }
    | { kind: 'shape'; a: Pt }
    | { kind: 'erase'; base: Drawing }
    | { kind: 'lasso'; start: Pt; shift: boolean }
    | { kind: 'move'; start: Pt; base: Drawing; moved: boolean };
  let drag: Drag | null = null;

  function toPage(e: MouseEvent): Pt {
    const box = canvas!.getBoundingClientRect();
    const v = view();
    return { x: (e.clientX - box.left - v.x) / v.scale, y: (e.clientY - box.top - v.y) / v.scale };
  }

  const px = () => 1 / view().scale;
  const inBox = (p: Pt, b: Box | null) => !!b && p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;

  function shapeStroke(a: Pt, b: Pt, shift: boolean): { pts: Pt[]; closed: boolean } {
    if (tool === 'line') return { pts: linePts(a, b, shift), closed: false };
    const box = boxFrom(a, b, shift);
    return tool === 'rect' ? { pts: rectPts(box), closed: true } : { pts: ellipsePts(box), closed: true };
  }

  const preview = (pts: Pt[], closed: boolean): Stroke => ({ id: 0, ...ink, z: closed, pts: pts.flatMap((p) => [p.x, p.y]) });

  function eraseAt(p: Pt) {
    const slop = ERASER * px();
    const hit = doc.items.filter((s) => onStroke(s, p, slop));
    if (hit.length) doc = removeStrokes(doc, hit.map((s) => s.id));
  }

  function onpointerdown(e: PointerEvent) {
    if (failed) return;
    if (e.button === 1 || tool === 'hand' || spaceDown) {
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, from: pan };
      panning = true;
      canvas?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const p = toPage(e);
    canvas?.setPointerCapture(e.pointerId);
    if (tool === 'pen' || tool === 'hl') {
      const lazy = new LazyPen(smoothing * 16 * px());
      const at = lazy.to(p);
      drag = { kind: 'ink', lazy, pts: [at] };
      live = preview([at], false);
    } else if (tool === 'eraser') {
      drag = { kind: 'erase', base: doc };
      eraseAt(p);
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      drag = { kind: 'shape', a: p };
    } else if (tool === 'lasso') {
      if (!e.shiftKey && sel.length && inBox(p, selectionBox(selected, 6 * px()))) {
        drag = { kind: 'move', start: p, base: doc, moved: false };
      } else {
        drag = { kind: 'lasso', start: p, shift: e.shiftKey };
        lasso = [p];
      }
    }
  }

  function onpointermove(e: PointerEvent) {
    const p = toPage(e);
    pointer = p;
    const d = drag;
    if (!d) return;
    if (d.kind === 'pan') {
      pan = { x: d.from.x + e.clientX - d.sx, y: d.from.y + e.clientY - d.sy };
    } else if (d.kind === 'ink') {
      const at = d.lazy.to(p);
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(at.x - last.x, at.y - last.y) >= 0.75 * px()) {
        d.pts.push(at);
        live = preview(d.pts, false);
      }
    } else if (d.kind === 'shape') {
      const s = shapeStroke(d.a, p, e.shiftKey);
      live = preview(s.pts, s.closed);
    } else if (d.kind === 'erase') {
      eraseAt(p);
    } else if (d.kind === 'lasso') {
      const last = lasso?.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2 * px()) lasso = [...(lasso ?? []), p];
    } else if (d.kind === 'move') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      d.moved ||= Math.hypot(dx, dy) / px() >= 3;
      if (d.moved) doc = moveStrokes(d.base, sel, dx, dy);
    }
  }

  function onpointerup(e: PointerEvent) {
    const d = drag;
    drag = null;
    panning = false;
    if (!d) return;
    if (d.kind === 'ink') {
      live = null;
      // Thin it to what matters: within a fraction of a screen pixel of what was drawn.
      const pts = simplify(d.pts, 0.4 * px());
      take(addStroke(doc, ink, pts).d);
    } else if (d.kind === 'shape') {
      live = null;
      const b = toPage(e);
      if (Math.hypot(b.x - d.a.x, b.y - d.a.y) / px() < 3) return;
      const s = shapeStroke(d.a, b, e.shiftKey);
      take(addStroke(doc, ink, s.pts, s.closed).d);
    } else if (d.kind === 'erase') {
      // The whole sweep is one undo step.
      if (doc !== d.base) history.push(d.base);
    } else if (d.kind === 'lasso') {
      const poly = lasso ?? [];
      lasso = null;
      const span = Math.max(...poly.map((q) => Math.hypot(q.x - d.start.x, q.y - d.start.y)), 0);
      let caught: number[];
      if (span / px() < 4) {
        // A click: the stroke under it.
        const hit = strokeAt(doc, d.start, 6 * px());
        caught = hit ? [hit.id] : [];
      } else caught = lassoed(doc, poly);
      sel = d.shift ? [...sel.filter((id) => !caught.includes(id)), ...caught.filter((id) => !sel.includes(id))] : caught;
    } else if (d.kind === 'move') {
      if (d.moved && doc !== d.base) history.push(d.base);
    }
  }

  // ── Life in the library ─────────────────────────────────────────────

  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let draftKept = !!start.draft;

  $effect(() => {
    const body = serializeLdw(doc);
    const base = saved;
    if (failed || recovered) return;
    clearTimeout(draftTimer);
    if (body === base) {
      if (draftKept) {
        draftKept = false;
        api.discardDraft(meta.id).catch(() => {});
      }
      return;
    }
    draftTimer = setTimeout(() => {
      api
        .putDraft(meta.id, versionId, body)
        .then(() => (draftKept = true))
        .catch((e) => notes.say(`Couldn't keep a draft: ${errorMessage(e)}`));
    }, prefs.value?.draft.delayMs ?? 2000);
  });

  function keepRecovered() {
    if (!recovered) return;
    const back = load(recovered.content);
    failed = null;
    if (back) take(back);
    recovered = null;
  }

  function discardRecovered() {
    recovered = null;
    draftKept = false;
    api.discardDraft(meta.id).catch(() => {});
  }

  async function save(): Promise<boolean> {
    if (saving || failed) return false;
    const body = serializeLdw(doc);
    if (body === saved) {
      say('no changes to save');
      return true;
    }
    saving = true;
    try {
      const picture = await thumbnailLdw(doc, THUMB_SIDE).catch(() => null);
      const r = await api.saveDocument(meta.id, body, picture);
      clearTimeout(draftTimer);
      draftKept = false;
      saved = body;
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
    popup = { x: r ? r.right - 230 : 200, y: r ? r.bottom + 6 : 60, items };
  }

  type Format = 'png' | 'jpeg' | 'svg' | 'ldw';

  function openExport() {
    popupAt(exportButton, [
      { label: 'PNG image', hint: '.png', run: () => exportAs('png', false) },
      { label: 'JPEG image', hint: '.jpg', run: () => exportAs('jpeg', false) },
      { label: 'SVG drawing', hint: '.svg', run: () => exportAs('svg', false) },
      { separator: true },
      { label: 'PNG of the whole page', hint: '.png', run: () => exportAs('png', true) },
      { label: 'SVG of the whole page', hint: '.svg', run: () => exportAs('svg', true) },
      { separator: true },
      { label: '.ldw file', hint: '.ldw', run: () => exportAs('ldw', true) },
    ]);
  }

  async function exportAs(format: Format, whole: boolean) {
    if (exporting) return;
    if (format !== 'ldw' && !whole && !doc.items.length) return say('nothing to export: the page is empty');
    const ext = format === 'jpeg' ? 'jpg' : format;
    exporting = true;
    try {
      const dir = prefs.value?.export.lastDir;
      const file = `${meta.name}.${ext}`;
      let path = await api.pickSavePath(dir ? `${dir}/${file}` : file, ext);
      if (!path) return;
      const want = format === 'jpeg' ? /\.jpe?g$/i : new RegExp(`\\.${ext}$`, 'i');
      if (!want.test(path)) path += `.${ext}`;
      const bytes =
        format === 'ldw'
          ? new TextEncoder().encode(serializeLdw(doc))
          : format === 'svg'
            ? new TextEncoder().encode(exportSvg(doc, whole))
            : await exportImage(doc, format, whole);
      await api.writeExport(path, bytes);
      const slash = path.lastIndexOf('/');
      if (slash > 0) prefs.set('export.lastDir', path.slice(0, slash));
      say(`exported ${path.slice(slash + 1)} (${Math.max(1, Math.round(bytes.length / 1024))} KB)`);
    } catch (e) {
      say(errorMessage(e));
    } finally {
      exporting = false;
    }
  }

  function openPage() {
    popupAt(pageButton, [
      { label: 'White page', hint: doc.bg === '#ffffff' ? '✓' : '', run: () => take({ ...doc, bg: '#ffffff' }) },
      { label: 'Transparent page', hint: doc.bg === 'none' ? '✓' : '', run: () => take({ ...doc, bg: 'none' }) },
      { separator: true },
      {
        label: 'Page size…',
        icon: Scaling,
        run: () => {
          pageW = doc.w;
          pageH = doc.h;
          sizing = true;
        },
      },
    ]);
  }

  function resizePage() {
    const r = setPage(doc, { w: pageW, h: pageH });
    if ('error' in r) return say(r.error);
    sizing = false;
    take(r.d);
    fit();
  }

  let unmenu: (() => void) | undefined;

  onMount(() => {
    resizeCanvas();
    raf = requestAnimationFrame(frame);
    canvas?.addEventListener('wheel', onwheel, { passive: false });
    if (canvas) {
      observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas);
    }
    unmenu = onMenu(menu);
    for (const t of ['copy', 'cut', 'paste']) document.addEventListener(t, onclipboard as EventListener);
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
    panning ? 'grabbing' : tool === 'hand' || spaceDown ? 'grab' : tool === 'lasso' ? 'default' : tool === 'eraser' || tool === 'pen' || tool === 'hl' ? 'none' : 'crosshair',
  );
  const statusText = $derived.by(() => {
    if (sel.length) return `${sel.length} stroke${sel.length === 1 ? '' : 's'} selected · drag inside to move, ⌫ deletes`;
    const parts = [label(tool)];
    if (INKED.includes(tool)) parts.push(`${ink.w}px`, ink.o < 100 ? `${ink.o}%` : '');
    parts.push(`${doc.items.length} stroke${doc.items.length === 1 ? '' : 's'}`);
    return parts.filter(Boolean).join(' · ');
  });
  const fileState = $derived(saving ? 'Saving…' : exporting ? 'Exporting…' : dirty ? 'Not saved' : `Saved ${ago(meta.updatedAt)}`);
  const showInk = $derived(INKED.includes(tool) || (tool === 'lasso' && sel.length > 0));
</script>

<svelte:window {onkeydown} {onkeyup} onpointerup={(e) => onpointerup(e)} onpointercancel={(e) => onpointerup(e)} />

<EditorFrame name={meta.name} ext=".ldw" {dirty} onback={requestClose} onrename={rename} onversions={onversions && !failed ? () => onversions(meta, dirty) : undefined}>
  {#snippet actions()}
    {#if !failed}
      <button class="icon-btn" title="Undo (⌘Z)" disabled={!canUndo} onclick={() => run({ do: 'undo' })}><Undo2 size={16} /></button>
      <button class="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo} onclick={() => run({ do: 'redo' })}><Redo2 size={16} /></button>
      <span class="sep"></span>
      <button class="icon-btn" title="Zoom out (−)" onclick={() => zoomAt(0.8)}><ZoomOut size={16} /></button>
      <button class="zoom" title="Fit the page (z)" onclick={fit}>{Math.round(zoom * 100)}%</button>
      <button class="icon-btn" title="Zoom in (+)" onclick={() => zoomAt(1.25)}><ZoomIn size={16} /></button>
      <span class="sep"></span>
      <button class="btn" bind:this={pageButton} onclick={openPage}><StickyNote size={15} /> Page</button>
      <button class="btn" bind:this={exportButton} title="Export (⌘E)" onclick={openExport}><FileOutput size={15} /> Export</button>
      <button class="btn" class:primary={dirty} disabled={saving || !dirty} title="Save (⌘S)" onclick={() => save()}>
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
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
      <h2>This file can't be opened as a drawing</h2>
      <p>{failed}</p>
      <button class="btn" onclick={finish}>Back to the library</button>
    </div>
  {:else}
    <div class="work">
      <div class="rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
        {#each TOOLS as t, i (t.tool)}
          {#if i === 3 || i === 4 || i === 7}<span class="rule"></span>{/if}
          <button class="tool" aria-pressed={tool === t.tool} title="{t.label} ({t.key})" onclick={() => setTool(t.tool)}>
            <t.icon size={18} strokeWidth={1.8} />
          </button>
        {/each}
        <span class="grow"></span>
        <button class="tool" title="Keyboard shortcuts (⌘/)" onclick={() => (sheet = true)}><Keyboard size={18} strokeWidth={1.8} /></button>
      </div>

      <div class="main">
        <div class="options">
          <span class="tool-name">{sel.length && tool === 'lasso' ? `${sel.length} selected` : label(tool)}</span>
          {#if showInk}
            <div class="inks" role="group" aria-label="Colour">
              {#each INKS as c (c)}
                <button class="ink" class:on={shownColour === c} style:--c={c} title={c} aria-label="Colour {c}" onclick={() => setColour(c)}></button>
              {/each}
              {#each recent.filter((r) => !INKS.includes(r)) as c (c)}
                <button class="ink" class:on={shownColour === c} style:--c={c} title={c} aria-label="Colour {c}" onclick={() => setColour(c)}></button>
              {/each}
              <label class="ink custom" title="Another colour">
                <input type="color" value={shownColour ?? '#111111'} onchange={(e) => setColour(e.currentTarget.value)} />
              </label>
            </div>
            <div class="seg" role="group" aria-label="Width">
              {#each WIDTHS as w (w)}
                <button aria-pressed={shownWidth === w} title="{w}px ([ ])" onclick={() => setWidth(w)}><span class="dot" style:--d="{Math.min(14, 2 + w * 0.4)}px"></span></button>
              {/each}
            </div>
            <label class="slider" title="Opacity">
              <span>{shownOpacity}%</span>
              <input
                type="range"
                min="1"
                max="100"
                value={shownOpacity}
                aria-label="Opacity"
                oninput={(e) => slideOpacity(e.currentTarget.valueAsNumber, false)}
                onchange={(e) => slideOpacity(e.currentTarget.valueAsNumber, true)}
              />
            </label>
            {#if tool === 'pen' || tool === 'hl'}
              <label class="slider" title="How much the pen steadies a shaky hand">
                <span>Steady</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={smoothing}
                  aria-label="Smoothing"
                  oninput={(e) => (smoothing = e.currentTarget.valueAsNumber)}
                  onchange={(e) => prefs.set('ldw.smoothing', e.currentTarget.valueAsNumber)}
                />
              </label>
            {/if}
          {/if}
          {#if tool === 'lasso' && sel.length}
            <span class="sep"></span>
            <button class="icon-btn" title="Smaller" onclick={() => take(scaleStrokes(doc, sel, 1 / 1.1))}><Minus size={15} /></button>
            <button class="icon-btn" title="Bigger" onclick={() => take(scaleStrokes(doc, sel, 1.1))}><Plus size={15} /></button>
            <button class="icon-btn" title="To the back" onclick={() => take(reorder(doc, sel, 'back'))}><SendToBack size={15} /></button>
            <button class="icon-btn" title="To the front" onclick={() => take(reorder(doc, sel, 'front'))}><BringToFront size={15} /></button>
            <button class="icon-btn" title="Duplicate (⌘D)" onclick={() => run({ do: 'duplicate' })}><Copy size={15} /></button>
            <button class="icon-btn danger" title="Delete (⌫)" onclick={() => run({ do: 'delete' })}><Trash size={15} /></button>
          {:else if tool === 'lasso'}
            <span class="dim">Click a stroke, or draw round several (⇧ adds)</span>
          {:else if tool === 'eraser'}
            <span class="dim">Takes out each stroke it touches</span>
          {:else if tool === 'hand'}
            <span class="dim">Drag to move the page (or hold space with any tool)</span>
          {/if}
          <span class="grow"></span>
          <span class="dim">{doc.w} × {doc.h}{doc.bg === 'none' ? ', transparent' : ''}</span>
        </div>
        <div class="canvas-wrap">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <canvas
            bind:this={canvas}
            aria-label="Drawing {meta.name}"
            style:cursor
            {onpointerdown}
            {onpointermove}
            onpointerleave={() => (pointer = null)}
            oncontextmenu={(e) => e.preventDefault()}
          ></canvas>
        </div>
      </div>
    </div>
  {/if}

  {#snippet status()}
    <div class="line">
      <span class="what">{failed ? '' : statusText}</span>
      <span class="file">{fileState}</span>
    </div>
  {/snippet}
</EditorFrame>

{#if popup}
  <ContextMenu {...popup} onclose={() => (popup = null)} />
{/if}
{#if sheet}
  <ShortcutSheet title="Drawing shortcuts" groups={LDW_SHORTCUTS} onclose={() => (sheet = false)} />
{/if}
{#if sizing}
  <Dialog title="Page size" onclose={() => (sizing = false)} width={360}>
    <form id="page-size" class="sizes" onsubmit={(e) => (e.preventDefault(), resizePage())}>
      <input class="input" type="number" min={MIN_SIDE} max={MAX_SIDE} bind:value={pageW} aria-label="Width" />
      <span class="dim">×</span>
      <input class="input" type="number" min={MIN_SIDE} max={MAX_SIDE} bind:value={pageH} aria-label="Height" />
    </form>
    <p class="dim small-print">Strokes stay where they are; any outside the new page are kept, just not shown.</p>
    {#snippet actions()}
      <button class="btn" onclick={() => (sizing = false)}>Cancel</button>
      <button class="btn primary" type="submit" form="page-size">Resize</button>
    {/snippet}
  </Dialog>
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
    height: 42px;
    padding: 0 12px;
    overflow-x: auto;
    border-bottom: 1px solid var(--faint);
    white-space: nowrap;
  }
  .tool-name {
    font-weight: 600;
  }
  .inks {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ink {
    width: 18px;
    height: 18px;
    flex: none;
    padding: 0;
    border: 1px solid var(--faint);
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
  }
  .ink.on {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 3.5px var(--line);
  }
  .ink.custom {
    position: relative;
    overflow: hidden;
    background: conic-gradient(#e5484d, #f7c948, #46a758, #12a594, #3e63dd, #8e4ec6, #d6409f, #e5484d);
  }
  .ink.custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .options .seg button {
    display: grid;
    place-items: center;
    width: 30px;
    height: 24px;
    padding: 0;
  }
  .dot {
    width: var(--d);
    height: var(--d);
    border-radius: 50%;
    background: currentColor;
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: 12px;
  }
  .slider span {
    min-width: 34px;
    font-variant-numeric: tabular-nums;
  }
  .slider input {
    width: 90px;
    accent-color: var(--ink);
  }
  .dim {
    color: var(--dim);
  }
  .danger:hover {
    color: var(--danger);
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
    min-width: 52px;
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
  .sizes {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .small-print {
    margin: 10px 0 0;
    font-size: 12px;
  }
</style>
