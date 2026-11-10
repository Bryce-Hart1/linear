<!--
  A .lin diagram, open for viewing and editing: drawBridge's editor, carried
  over. The pulses play while viewing. In editing, the keyboard does
  everything except say where things go:
  - a shape key (c t r d) or `l` arms a tool, and the next click places it;
  - a click selects (⇧ adds, dragging out a box selects what it touches);
  - dragging moves shapes or a line's end;
  - arrow keys resize, ⌥ arrows move, 0–9 colour, i/o/p pick the font, and
    Enter types into a shape or a line's label.
  lib/lin/keys.ts has the whole key map.

  The drawing is lib/lin/draw.ts on a canvas, and every change is a function
  in lib/lin/edit.ts. This component is the glue: input, the animation clock,
  the view (zoom and pan), and the document's life in the library. ⌘S saves a
  new version with a thumbnail. Unsaved work is written as a draft a moment
  after each change, offered back when the document next opens, and closing
  with changes asks first. Menu commands arrive through menu-router.ts.
-->
<script lang="ts">
  import {
    ArrowLeftRight,
    BringToFront,
    ChevronsDown,
    Circle,
    Diamond,
    ChevronsUp,
    ClipboardPaste,
    Copy,
    Eye,
    FileOutput,
    MousePointer2,
    PanelRight,
    Pause,
    PencilRuler,
    Play,
    Redo2,
    SendToBack,
    Square,
    Trash,
    Triangle,
    Type,
    Undo2,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { api } from '../../lib/api';
  import { THUMB_SIDE } from '../../lib/kinds';
  import { getClip, setClip } from '../../lib/lin/clip';
  import { drawDoc, exportImage, themeFromCss, thumbnail, type View } from '../../lib/lin/draw';
  import {
    History,
    addLine,
    addShape,
    copyParts,
    cycleHead,
    cyclePulse,
    cycleRoute,
    cycleStroke,
    describe,
    duplicate,
    each,
    endAt,
    flip,
    moveBy,
    moveEnd,
    moveLineBy,
    moveShape,
    pasteParts,
    recolor,
    removeMany,
    reorder,
    resize,
    setFont,
    stepSelection,
    toggleGlow,
    type Edited,
  } from '../../lib/lin/edit';
  import { parseLin, serializeLin } from '../../lib/lin/format';
  import { bounds, capacity, hitTest, labelCapacity, partsIn, snapTarget, type Box, type Pt } from '../../lib/lin/geometry';
  import { commandFor, hintsFor, type Command } from '../../lib/lin/keys';
  import { COPY_OFFSET, STEP, blankDoc, find, isLine, shapeById, type Doc, type End, type Shape, type ShapeKind } from '../../lib/lin/model';
  import { snapPoint, snapShape, toGrid, type Guide } from '../../lib/lin/snap';
  import { exportSvg } from '../../lib/lin/svg';
  import { activeStyle, caretAt, caretAtEnd, describeStyle, insertAt, moveCaret, removeAt, toggleStyle, type Caret } from '../../lib/lin/text';
  import { CURSORS, dotAt, dotPoint, handleAt, resizeTo, type HandleId, type Side } from '../../lib/lin-ui/handles';
  import { DOT_OUT, GRAB, drawDots, drawHandles } from '../../lib/lin-ui/overlay';
  import { setSize } from '../../lib/lin-ui/set';
  import { LIN_SHORTCUTS } from '../../lib/lin-ui/shortcuts';
  import type { Tool } from '../../lib/lin-ui/tool';
  import type { MenuId } from '../../lib/menu-ids';
  import { isTextField, onMenu } from '../../lib/menu-router';
  import { notes } from '../../lib/notes.svelte';
  import { prefs } from '../../lib/prefs.svelte';
  import { ago } from '../../lib/time';
  import { errorMessage, type DocMeta, type Opened } from '../../lib/types';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import Dialog from '../ui/Dialog.svelte';
  import type { MenuItem } from '../ui/menu';
  import ShortcutSheet from '../shell/ShortcutSheet.svelte';
  import EditorFrame from './EditorFrame.svelte';
  import LinInspector from './lin/LinInspector.svelte';
  import ToolRail from './lin/ToolRail.svelte';

  let {
    opened,
    fresh = false,
    onclose,
    onversions,
  }: { opened: Opened; fresh?: boolean; onclose: (meta: DocMeta) => void; onversions?: (meta: DocMeta, dirty: boolean) => void } = $props();

  // Read once: the document this editor was opened on. Saves and renames update `meta`.
  const start = untrack(() => ({ ...opened, fresh }));
  const p0 = prefs.value!;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let meta = $state<DocMeta>(start.meta);
  /** The version the editor started from or last saved: a draft records it. */
  let versionId = $state(start.version.id);
  let failed = $state<string | null>(null);

  function load(text: string): Doc | null {
    try {
      return parseLin(text);
    } catch (e) {
      failed = errorMessage(e);
      return null;
    }
  }

  const first = load(start.content) ?? blankDoc();
  const firstText = serializeLin(first);
  /** The diagram. Replaced, never changed in place (lib/lin/edit.ts). */
  let doc = $state.raw<Doc>(first);
  /** The file as last loaded or saved, to tell whether anything changed. */
  let saved = $state(firstText);
  /** Unsaved work found when the document opened, until kept or discarded. */
  let recovered = $state(start.draft && start.draft.content !== firstText ? start.draft : null);
  let saving = $state(false);
  let exporting = $state(false);
  let edit = $state(start.fresh || p0.lin.openIn === 'edit');
  let typing = $state(false);
  /** Where typing is, and what's selected there. */
  let caret = $state.raw<Caret>(caretAt(0));
  let playing = $state(p0.lin.playOnOpen && !reduceMotion.matches);
  /** The selected parts; the last is the one the status line talks about. */
  let sel = $state.raw<number[]>([]);
  /** A tool waiting for a click. */
  let armed = $state<ShapeKind | 'line' | null>(null);
  /** The line tool's first end, once clicked. */
  let lineFrom = $state<{ end: End; at: Pt } | null>(null);
  let pointer = $state<Pt | null>(null);
  let grid = $state(p0.lin.grid);
  let guides = $state.raw<Guide[]>([]);
  let marquee = $state.raw<Box | null>(null);
  /** How far in the page is zoomed (1 fits the window), and how far it's been moved. */
  let zoom = $state(1);
  let pan = $state.raw<Pt>({ x: 0, y: 0 });
  let closing = $state(false);
  /** The hand tool: presses move the page while editing. */
  let hand = $state(false);
  /** What the pointer is over, while nothing is being dragged: a shape (for its dots), a dot, or a handle. */
  let hover = $state.raw<{ shape: number | null; dot: Side | null; handle: HandleId | null }>({ shape: null, dot: null, handle: null });
  /** A line being drawn out of a shape's dot. */
  let connect = $state.raw<{ from: number; at: Pt; to: Pt } | null>(null);
  let sheet = $state(false);
  let canvasMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let exportMenu = $state<{ x: number; y: number } | null>(null);
  let exportButton: HTMLButtonElement | undefined = $state();

  const history = new History();
  const dirty = $derived(serializeLin(doc) !== saved);
  const canUndo = $derived((void doc, history.canUndo));
  const canRedo = $derived((void doc, history.canRedo));
  const primary = $derived(sel.length > 0 ? sel[sel.length - 1] : null);
  const selPart = $derived(find(doc, primary));
  const selKind = $derived(sel.length > 1 ? 'many' : selPart ? (isLine(selPart) ? 'line' : 'shape') : null);
  /** Typing in a shape, where Enter starts a new line; a line's label is one row. */
  const multiline = $derived(typing && !!selPart && !isLine(selPart));
  const tool: Tool = $derived(armed ?? (hand ? 'hand' : 'select'));
  const caretStyle = $derived(typing && selPart && !isLine(selPart) ? activeStyle(selPart, caret) : 0);
  const cursor = $derived(
    hover.handle ? CURSORS[hover.handle] : hover.dot || armed || connect ? 'crosshair' : hand || !edit ? 'grab' : 'default',
  );
  const hints = $derived(hintsFor({ edit, typing, multiline, selected: selKind, armed: armed !== null, playing }));

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const statusText = $derived.by(() => {
    if (typing && selPart) {
      const n = [...selPart.text].length;
      if (isLine(selPart)) return `Typing a label · ${n}/${labelCapacity(doc, selPart)} characters fit`;
      const look = describeStyle(activeStyle(selPart, caret));
      return `Typing · ${n}/${capacity(selPart)} characters fit${look ? ` · ${look}` : ''} · enter starts a new line, esc finishes`;
    }
    if (armed === 'line') return lineFrom ? 'Click where the line ends' : 'Click where the line starts';
    if (armed) return `Click to place the ${armed}`;
    if (sel.length > 1) return `${sel.length} selected · drag to move them together`;
    if (selPart) return describe(selPart);
    const parts = plural(doc.items.length, 'part');
    if (!edit) return parts;
    return doc.items.length === 0 ? 'An empty page: press c, t, r or d to place a shape, or l for a line' : `${parts} · click one, or press tab, to select it`;
  });

  // ── Canvas ────────────────────────────────────────────────────────────

  let canvas: HTMLCanvasElement | undefined = $state();
  let theme = themeFromCss();
  let width = 0;
  let height = 0;
  /** Page → screen: scale and offset, so the page fits (or is zoomed) and is centred. */
  let fit = { scale: 1, x: 0, y: 0 };
  let clock = 0;
  let lastFrame = 0;
  let raf = 0;
  let redraw = true;
  let observer: ResizeObserver | undefined;

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 8;

  function currentFit() {
    const base = width > 0 ? Math.min(2, width / doc.w, height / doc.h) : 1;
    const scale = base * zoom;
    return { scale, x: (width - doc.w * scale) / 2 + pan.x, y: (height - doc.h * scale) / 2 + pan.y };
  }

  /** Zoom by `factor`, keeping the page point under the screen point (sx, sy) where it is. */
  function zoomAt(factor: number, sx: number, sy: number) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    if (z === zoom) return;
    const was = currentFit();
    const under = { x: (sx - was.x) / was.scale, y: (sy - was.y) / was.scale };
    zoom = z;
    const now = currentFit();
    pan = { x: pan.x + (sx - (now.x + under.x * now.scale)), y: pan.y + (sy - (now.y + under.y * now.scale)) };
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

  function paint() {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    fit = currentFit();
    const { scale } = fit;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * fit.x, dpr * fit.y);
    // The page.
    ctx.strokeStyle = theme.faint;
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(0, 0, doc.w, doc.h);
    const view: View = {
      t: clock,
      pulses: true,
      selected: edit ? sel : [],
      theme,
      typing: typing ? primary : null,
      caret: typing ? caret : null,
      px: 1 / scale,
      guides: edit ? guides : [],
      marquee: edit ? marquee : null,
      grid: edit && grid,
    };
    if (edit && pointer && armed) {
      const at = armed === 'line' ? pointer : snapPoint(pointer, grid);
      view.ghost = armed === 'line' ? { tool: 'line', from: lineFrom?.at ?? null, to: at } : { tool: armed, at };
    }
    if (edit && connect) view.ghost = { tool: 'line', from: connect.at, to: connect.to };
    drawDoc(ctx, doc, view);
    // The clickable editor's own marks: the selected shape's handles, and the dots on the shape under the pointer.
    if (edit && !typing && !armed && !hand) {
      const px = 1 / scale;
      const one = sel.length === 1 ? shapeById(doc, sel[0]) : undefined;
      if (one && !connect) drawHandles(ctx, one, theme, px);
      const dotted = connect ? shapeById(doc, connect.from) : hover.shape !== null && !drag ? shapeById(doc, hover.shape) : undefined;
      if (dotted) drawDots(ctx, dotted, theme, px, connect ? null : hover.dot);
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    const moving = playing && doc.items.some((p) => isLine(p) && p.pulse !== 'off');
    // The clock stands still when paused, and so does the drawing (pulses frozen where they were).
    if (playing) clock += Math.min(dt, 0.1);
    if (moving || redraw) {
      redraw = false;
      paint();
    }
  }

  // Anything on screen changing means a redraw on the next frame.
  $effect(() => {
    void [doc, sel, armed, lineFrom, pointer, edit, typing, caret, zoom, pan, grid, guides, marquee, hover, connect, hand];
    redraw = true;
  });

  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  function retheme() {
    // After the theme's CSS has applied.
    requestAnimationFrame(() => {
      theme = themeFromCss();
      redraw = true;
    });
  }

  // The theme preference changing recolours the canvas too.
  $effect(() => {
    void prefs.value?.theme;
    retheme();
  });

  /** The wheel (or a trackpad) moves the page; with ⌘ or Ctrl, or a pinch, it zooms. */
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const box = canvas!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
    else pan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY };
  }

  // ── Drafts ────────────────────────────────────────────────────────────

  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the library holds a draft of this document right now. */
  let draftKept = !!start.draft;

  // A moment after each change, unsaved work is written as a draft; back to
  // the saved state, the draft goes. Not while a recovered draft waits for an answer.
  $effect(() => {
    const body = serializeLin(doc);
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
    if (back) {
      history.push(doc);
      doc = back;
      edit = true;
    }
    recovered = null;
  }

  function discardRecovered() {
    recovered = null;
    draftKept = false;
    api.discardDraft(meta.id).catch(() => {});
  }

  // ── Life in the library ─────────────────────────────────────────────

  async function save(): Promise<boolean> {
    if (saving || failed) return false;
    endTyping();
    const body = serializeLin(doc);
    if (body === saved) {
      notes.say('No changes to save');
      return true;
    }
    saving = true;
    try {
      const picture = await thumbnail(doc, THUMB_SIDE).catch(() => null);
      const r = await api.saveDocument(meta.id, body, picture);
      clearTimeout(draftTimer);
      draftKept = false;
      saved = body;
      if (r.status === 'saved') {
        meta = r.meta;
        versionId = r.version.id;
      }
      notes.say(`Saved ${meta.name}`);
      return true;
    } catch (e) {
      notes.say(errorMessage(e));
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
      notes.say(errorMessage(e));
      return false;
    }
  }

  function requestClose() {
    endTyping();
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

  type Format = 'png' | 'jpeg' | 'svg' | 'lin';
  const FORMATS: { format: Format; ext: string; label: string }[] = [
    { format: 'png', ext: 'png', label: 'PNG image' },
    { format: 'jpeg', ext: 'jpg', label: 'JPEG image' },
    { format: 'svg', ext: 'svg', label: 'SVG drawing' },
    { format: 'lin', ext: 'lin', label: '.lin file' },
  ];

  function openExportMenu() {
    const r = exportButton?.getBoundingClientRect();
    exportMenu = r ? { x: r.right - 200, y: r.bottom + 6 } : { x: 200, y: 60 };
  }

  const exportItems: MenuItem[] = FORMATS.map((f) => ({ label: f.label, hint: `.${f.ext}`, run: () => exportAs(f.format) }));

  /** Writes the diagram as it is now (saved or not) in a format, where the user picks. */
  async function exportAs(format: Format) {
    if (exporting) return;
    const f = FORMATS.find((x) => x.format === format)!;
    // An empty page says so before any dialog.
    if (format !== 'lin' && !bounds(doc)) return notes.say('Nothing to export: the page is empty');
    exporting = true;
    try {
      const dir = prefs.value?.export.lastDir;
      const file = `${meta.name}.${f.ext}`;
      let path = await api.pickSavePath(dir ? `${dir}/${file}` : file, f.ext);
      if (!path) return;
      const want = format === 'jpeg' ? /\.jpe?g$/i : new RegExp(`\\.${f.ext}$`, 'i');
      if (!want.test(path)) path += `.${f.ext}`;
      const text = format === 'svg' ? exportSvg(doc) : format === 'lin' ? serializeLin(doc) : null;
      const bytes = text !== null ? new TextEncoder().encode(text) : await exportImage(doc, format as 'png' | 'jpeg');
      await api.writeExport(path, bytes);
      const slash = path.lastIndexOf('/');
      if (slash > 0) prefs.set('export.lastDir', path.slice(0, slash));
      notes.say(`Exported ${path.slice(slash + 1)} (${Math.max(1, Math.round(bytes.length / 1024))} KB)`);
    } catch (e) {
      notes.say(errorMessage(e));
    } finally {
      exporting = false;
    }
  }

  // ── Doing things ──────────────────────────────────────────────────────

  function say(text: string) {
    notes.say(text.charAt(0).toUpperCase() + text.slice(1));
  }

  /** Do `make` to every selected part. A refusal says why. */
  function apply(make: (doc: Doc, id: number) => Edited) {
    if (sel.length === 0) {
      say('nothing is selected: click a part or press tab');
      return;
    }
    take(each(doc, sel, make));
  }

  /** Make a result the new doc (one undo step), or say why not. */
  function take(r: Edited) {
    if ('error' in r) {
      say(r.error);
      return;
    }
    if (r.doc !== doc) {
      history.push(doc);
      doc = r.doc;
    }
  }

  /** Where the doc was when typing started, so the whole text is one undo step. */
  let typingBase: Doc | null = null;

  function endTyping() {
    if (!typing) return;
    typing = false;
    if (typingBase && typingBase !== doc) history.push(typingBase);
    typingBase = null;
  }

  function setEdit(on: boolean) {
    endTyping();
    edit = on;
    armed = null;
    lineFrom = null;
    marquee = null;
    guides = [];
    if (!on) sel = [];
  }

  const ARROW: Record<string, Pt> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

  function run(c: Command) {
    switch (c.do) {
      case 'arm':
        armed = c.tool;
        hand = false;
        lineFrom = null;
        sel = [];
        break;
      case 'select': {
        const next = stepSelection(doc, primary, c.dir);
        sel = next === null ? [] : [next];
        break;
      }
      case 'all':
        sel = doc.items.map((p) => p.id);
        if (sel.length === 0) say('an empty page: nothing to select');
        break;
      case 'resize':
        apply((d, i) => resize(d, i, c.dir, c.big));
        break;
      case 'nudge': {
        if (sel.length === 0) {
          say('nothing is selected: click a part or press tab');
          break;
        }
        const step = c.fine ? 1 : STEP;
        const moved = moveBy(doc, sel, ARROW[c.dir].x * step, ARROW[c.dir].y * step);
        if (moved === doc) say('at the edge of the page');
        else {
          history.push(doc);
          doc = moved;
        }
        break;
      }
      case 'color':
        apply((d, i) => recolor(d, i, c.c));
        break;
      case 'font':
        apply((d, i) => setFont(d, i, c.f));
        break;
      case 'type':
        if (sel.length !== 1 || !selPart) {
          say('select one shape or line first, then press enter to type in it');
          break;
        }
        typing = true;
        typingBase = doc;
        caret = caretAtEnd(selPart);
        break;
      case 'char':
        if (primary !== null) {
          const r = insertAt(doc, primary, caret, c.ch);
          if ('error' in r) say(r.error);
          else {
            doc = r.doc;
            caret = r.caret;
          }
        }
        break;
      case 'backspace':
        if (primary !== null) {
          const r = removeAt(doc, primary, caret);
          if (!('error' in r)) {
            doc = r.doc;
            caret = r.caret;
          }
        }
        break;
      case 'caret':
        if (selPart) caret = moveCaret([...selPart.text].length, caret, c.dir, c.select);
        break;
      case 'format':
        if (primary !== null) {
          const r = toggleStyle(doc, primary, caret, c.flag);
          if ('error' in r) say(r.error);
          else {
            doc = r.doc;
            caret = r.caret;
          }
        }
        break;
      case 'done':
        endTyping();
        break;
      case 'head':
        apply(cycleHead);
        break;
      case 'flip':
        apply(flip);
        break;
      case 'pulse':
        apply(cyclePulse);
        break;
      case 'glow':
        apply(toggleGlow);
        break;
      case 'route':
        apply(cycleRoute);
        break;
      case 'style':
        apply(cycleStroke);
        break;
      case 'order':
        if (sel.length === 0) say('nothing is selected');
        else take(reorder(doc, sel, c.to));
        break;
      case 'grid':
        grid = !grid;
        say(grid ? 'snapping to a 10 px grid (g turns it off); hold ⌥ while dragging to skip it' : 'grid off');
        break;
      case 'zoom':
        if (c.by === 'fit') {
          zoom = 1;
          pan = { x: 0, y: 0 };
        } else zoomAt(c.by === 'in' ? 1.25 : 0.8, width / 2, height / 2);
        break;
      case 'copy':
        if (sel.length === 0) {
          say('nothing is selected');
          break;
        }
        setClip(copyParts(doc, sel));
        say(`copied ${plural(sel.length, 'part')}; ⌘V pastes where the pointer is`);
        break;
      case 'paste': {
        const clip = getClip();
        if (clip.length === 0) {
          say('nothing copied yet: select something and press ⌘C');
          break;
        }
        // Where the pointer is, if it's on the page; else a little off from the original.
        const box = bounds({ ...doc, items: [...clip] });
        let delta: Pt = { x: COPY_OFFSET, y: COPY_OFFSET };
        if (box && pointer && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= doc.w && pointer.y <= doc.h) {
          const to = snapPoint(pointer, grid);
          delta = { x: to.x - (box.x + box.w / 2), y: to.y - (box.y + box.h / 2) };
        }
        const r = pasteParts(doc, clip, delta);
        history.push(doc);
        doc = r.doc;
        sel = r.ids;
        break;
      }
      case 'duplicate': {
        const r = duplicate(doc, sel);
        if ('error' in r) {
          say(r.error);
          break;
        }
        history.push(doc);
        doc = r.doc;
        sel = r.ids;
        break;
      }
      case 'delete':
        if (sel.length === 0) {
          say('nothing is selected');
          break;
        }
        history.push(doc);
        doc = removeMany(doc, sel);
        sel = [];
        break;
      case 'undo':
      case 'redo': {
        const back = c.do === 'undo' ? history.undo(doc) : history.redo(doc);
        if (!back) {
          say(c.do === 'undo' ? 'nothing to undo' : 'nothing to redo');
          break;
        }
        doc = back;
        sel = sel.filter((i) => find(doc, i));
        break;
      }
      case 'save':
        void save();
        break;
      case 'export':
        openExportMenu();
        break;
      case 'play':
        playing = !playing;
        break;
      case 'edit':
        setEdit(!edit);
        break;
      case 'escape':
        if (armed) {
          armed = null;
          lineFrom = null;
        } else if (hand) hand = false;
        else if (sel.length > 0) sel = [];
        else requestClose();
        break;
    }
  }

  /** Whether the keyboard belongs to something else: a dialog, a menu, or a text field. */
  function keysElsewhere(target: EventTarget | null): boolean {
    return (
      closing ||
      sheet ||
      exportMenu !== null ||
      canvasMenu !== null ||
      !!document.querySelector('dialog[open]') ||
      isTextField(target as HTMLInputElement | null)
    );
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || failed || keysElsewhere(e.target)) return;
    const c = commandFor(e, { edit, typing, multiline });
    // Typing eats every key, so Tab or an arrow doesn't wander off.
    if (c || (typing && !e.metaKey && !e.ctrlKey)) e.preventDefault();
    if (c) run(c);
  }

  /** The menu bar's commands, while this editor is open. */
  function menu(id: MenuId): boolean {
    if (failed) return id === 'close' ? (finish(), true) : false;
    const editing = (c: Command) => {
      if (typing) say('finish typing first (esc)');
      else if (!edit) say('switch to editing first (e)');
      else run(c);
      return true;
    };
    switch (id) {
      case 'save':
        void save();
        return true;
      case 'close':
        requestClose();
        return true;
      case 'export':
        openExportMenu();
        return true;
      case 'undo':
        return editing({ do: 'undo' });
      case 'redo':
        return editing({ do: 'redo' });
      case 'selectAll':
        return editing({ do: 'all' });
      case 'duplicate':
        return editing({ do: 'duplicate' });
      case 'delete':
        return editing({ do: 'delete' });
      case 'zoom.in':
        run({ do: 'zoom', by: 'in' });
        return true;
      case 'zoom.out':
        run({ do: 'zoom', by: 'out' });
        return true;
      case 'zoom.fit':
        run({ do: 'zoom', by: 'fit' });
        return true;
      case 'help.shortcuts':
        sheet = true;
        return true;
    }
    return false;
  }

  /** A tool from the rail. Any tool means editing. */
  function pickTool(t: Tool) {
    if (!edit) setEdit(true);
    endTyping();
    if (t === 'select') {
      armed = null;
      lineFrom = null;
      hand = false;
    } else if (t === 'hand') {
      armed = null;
      lineFrom = null;
      hand = true;
    } else run({ do: 'arm', tool: t });
  }

  function sizeSelected(w: number, h: number) {
    if (primary !== null) take(setSize(doc, primary, w, h));
  }

  /** Copy, Cut and Paste from the Edit menu, when the menu bar has them rather than the keydown. */
  function onclipboard(e: ClipboardEvent) {
    if (failed || keysElsewhere(document.activeElement) || !edit || typing) return;
    e.preventDefault();
    if (e.type === 'paste') run({ do: 'paste' });
    else {
      run({ do: 'copy' });
      if (e.type === 'cut' && sel.length) run({ do: 'delete' });
    }
  }

  let unmenu: (() => void) | undefined;

  onMount(() => {
    resizeCanvas();
    raf = requestAnimationFrame(frame);
    dark.addEventListener('change', retheme);
    // Not passive: the wheel is ours, and the page behind must not scroll.
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
    dark.removeEventListener('change', retheme);
    canvas?.removeEventListener('wheel', onwheel);
    observer?.disconnect();
    unmenu?.();
    for (const t of ['copy', 'cut', 'paste']) document.removeEventListener(t, onclipboard as EventListener);
  });

  // ── Mouse ─────────────────────────────────────────────────────────────

  /** A press on something: where it started, the doc then, and what's being moved. */
  type Drag = { start: Pt; base: Doc; moved: boolean } & (
    | { kind: 'shape'; id: number; dx: number; dy: number }
    | { kind: 'end'; id: number; which: 'a' | 'b' }
    | { kind: 'line'; id: number }
    | { kind: 'many'; ids: number[] }
    | { kind: 'resize'; id: number; handle: HandleId }
  );
  let drag: Drag | null = null;
  /** Dragging out a selection box: the selection it started from. */
  let boxing: { start: Pt; from: number[] } | null = null;
  /** Dragging the page itself: the pan it started from and the screen point. */
  let panning: { sx: number; sy: number; from: Pt } | null = null;

  function toPage(e: PointerEvent): Pt {
    const box = canvas!.getBoundingClientRect();
    const f = currentFit();
    return { x: (e.clientX - box.left - f.x) / f.scale, y: (e.clientY - box.top - f.y) / f.scale };
  }

  function onpointerdown(e: PointerEvent) {
    if (failed) return;
    // Middle button anywhere, or any drag while just viewing, moves the page.
    if (e.button === 1 || (!edit && e.button === 0)) {
      panning = { sx: e.clientX, sy: e.clientY, from: pan };
      canvas?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (!edit || e.button !== 0) return;
    const p = toPage(e);
    endTyping();
    if (hand) {
      panning = { sx: e.clientX, sy: e.clientY, from: pan };
      canvas?.setPointerCapture(e.pointerId);
      return;
    }
    if (armed && armed !== 'line') {
      history.push(doc);
      const added = addShape(doc, armed, snapPoint(p, grid));
      doc = added.doc;
      sel = [added.id];
      armed = null;
      return;
    }
    if (armed === 'line') {
      const end = endAt(doc, snapTarget(doc, p) ? p : snapPoint(p, grid));
      if (!lineFrom) {
        lineFrom = { end, at: p };
        return;
      }
      const added = addLine(doc, lineFrom.end, end);
      if ('error' in added) {
        say(added.error);
        return;
      }
      history.push(doc);
      doc = added.doc;
      sel = added.id ? [added.id] : [];
      armed = null;
      lineFrom = null;
      return;
    }
    const px = 1 / currentFit().scale;
    // A handle of the selected shape: resize it.
    const one = sel.length === 1 ? shapeById(doc, sel[0]) : undefined;
    const handle = one && !e.shiftKey ? handleAt(one, p, GRAB * px) : null;
    if (one && handle) {
      drag = { start: p, base: doc, moved: false, kind: 'resize', id: one.id, handle };
      canvas?.setPointerCapture(e.pointerId);
      return;
    }
    // A dot on a shape's edge: draw a line out of it.
    const dot = !e.shiftKey ? dotUnder(p, px) : null;
    if (dot) {
      connect = { from: dot.shape.id, at: dotPoint(dot.shape, dot.side), to: p };
      canvas?.setPointerCapture(e.pointerId);
      return;
    }
    const hit = hitTest(doc, p, sel.length === 1 ? sel[0] : null, Math.max(1, px));
    if (e.shiftKey) {
      // ⇧ adds a part to the selection, or takes it out; it never starts a drag.
      if (hit) sel = sel.includes(hit.id) ? sel.filter((i) => i !== hit.id) : [...sel, hit.id];
      else startBox(e, p, sel);
      return;
    }
    if (!hit) {
      sel = [];
      startBox(e, p, []);
      return;
    }
    const part = find(doc, hit.id)!;
    const base = { start: p, base: doc, moved: false };
    if (hit.kind === 'end') {
      sel = [hit.id];
      drag = { ...base, kind: 'end', id: hit.id, which: hit.which };
    } else if (sel.length > 1 && sel.includes(hit.id)) {
      // Pressing on one of several selected parts moves them all.
      drag = { ...base, kind: 'many', ids: sel };
    } else {
      sel = [hit.id];
      drag = isLine(part) ? { ...base, kind: 'line', id: hit.id } : { ...base, kind: 'shape', id: hit.id, dx: part.x - p.x, dy: part.y - p.y };
    }
    canvas?.setPointerCapture(e.pointerId);
  }

  function startBox(e: PointerEvent, p: Pt, from: number[]) {
    boxing = { start: p, from };
    canvas?.setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (panning) {
      pan = { x: panning.from.x + e.clientX - panning.sx, y: panning.from.y + e.clientY - panning.sy };
      return;
    }
    const p = toPage(e);
    pointer = p;
    if (connect) {
      connect = { ...connect, to: p };
      return;
    }
    if (!drag && !boxing) updateHover(p);
    if (boxing) {
      const x = Math.min(boxing.start.x, p.x);
      const y = Math.min(boxing.start.y, p.y);
      marquee = { x, y, w: Math.abs(p.x - boxing.start.x), h: Math.abs(p.y - boxing.start.y) };
      const touched = partsIn(doc, marquee);
      sel = [...boxing.from, ...touched.filter((i) => !boxing!.from.includes(i))];
      return;
    }
    const d = drag;
    if (!d) return;
    // A click that wobbles a pixel isn't a drag. The first real movement is
    // one undo step, from where the doc was when the button went down.
    if (!d.moved) {
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * fit.scale < 3) return;
      d.moved = true;
      history.push(d.base);
    }
    // ⌥ while dragging turns snapping off.
    const snap = !e.altKey;
    if (d.kind === 'shape') {
      const target = { x: p.x + d.dx, y: p.y + d.dy };
      const r = snap ? snapShape(d.base, d.id, target, grid) : { at: target, guides: [] };
      guides = r.guides;
      doc = moveShape(d.base, d.id, r.at);
    } else if (d.kind === 'end') {
      doc = moveEnd(d.base, d.id, d.which, snap && !snapTarget(d.base, p) ? snapPoint(p, grid) : p);
    } else if (d.kind === 'resize') {
      const s = shapeById(d.base, d.id);
      if (s) {
        const r = resizeTo(s, d.handle, p, e.altKey);
        const out = setSize(d.base, d.id, r.w, r.h, r.at);
        // A size the text won't fit in is skipped: the shape stops at the last one that fits.
        if ('doc' in out) doc = out.doc;
      }
    } else if (d.kind === 'many') {
      const g = snap && grid;
      doc = moveBy(d.base, d.ids, g ? toGrid(p.x - d.start.x) : p.x - d.start.x, g ? toGrid(p.y - d.start.y) : p.y - d.start.y);
    } else {
      doc = moveLineBy(d.base, d.id, p.x - d.start.x, p.y - d.start.y);
    }
  }

  /** The connector dot under `p`, on the front-most shape that has one there. */
  function dotUnder(p: Pt, px: number): { shape: Shape; side: Side } | null {
    for (let i = doc.items.length - 1; i >= 0; i--) {
      const s = doc.items[i];
      if (isLine(s)) continue;
      const side = dotAt(s, p, GRAB * px, DOT_OUT * px);
      if (side) return { shape: s, side };
    }
    return null;
  }

  function updateHover(p: Pt) {
    let next: typeof hover = { shape: null, dot: null, handle: null };
    if (edit && !armed && !hand && !typing) {
      const px = 1 / currentFit().scale;
      const one = sel.length === 1 ? shapeById(doc, sel[0]) : undefined;
      const handle = one ? handleAt(one, p, GRAB * px) : null;
      const dot = handle ? null : dotUnder(p, px);
      const near = dot?.shape ?? snapTarget(doc, p, (DOT_OUT + GRAB) * px);
      next = { shape: near?.id ?? null, dot: dot?.side ?? null, handle };
    }
    if (next.shape !== hover.shape || next.dot !== hover.dot || next.handle !== hover.handle) hover = next;
  }

  /** Lets go of a line drawn out of a dot: onto another shape it joins them, anywhere else it ends there. */
  function finishConnect(c: NonNullable<typeof connect>) {
    connect = null;
    if (Math.hypot(c.to.x - c.at.x, c.to.y - c.at.y) * fit.scale < 6) {
      sel = [c.from];
      return;
    }
    const target = snapTarget(doc, c.to);
    if (target?.id === c.from) return;
    const added = addLine(doc, { to: c.from }, endAt(doc, target ? c.to : snapPoint(c.to, grid)));
    if ('error' in added) {
      say(added.error);
      return;
    }
    history.push(doc);
    doc = added.doc;
    sel = added.id ? [added.id] : [];
  }

  /** Double-click a shape or line to type in it. */
  function ondblclick(e: MouseEvent) {
    if (!edit || armed || hand || failed) return;
    const p = toPage(e as PointerEvent);
    const hit = hitTest(doc, p, null, Math.max(1, 1 / currentFit().scale));
    if (!hit) return;
    endTyping();
    sel = [hit.id];
    run({ do: 'type' });
  }

  /** Right-click: what can be done to what's under the pointer, or to the page there. */
  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    if (failed) return;
    const at = { x: e.clientX, y: e.clientY };
    if (!edit) {
      canvasMenu = {
        ...at,
        items: [
          { label: 'Edit', icon: PencilRuler, hint: 'e', run: () => setEdit(true) },
          { label: 'Export…', icon: FileOutput, hint: 'x', run: openExportMenu },
        ],
      };
      return;
    }
    endTyping();
    armed = null;
    lineFrom = null;
    const p = toPage(e as PointerEvent);
    const hit = hitTest(doc, p, sel.length === 1 ? sel[0] : null, Math.max(1, 1 / currentFit().scale));
    const arrange: MenuItem[] = [
      { label: 'Bring to front', icon: BringToFront, hint: '}', run: () => run({ do: 'order', to: 'front' }) },
      { label: 'Bring forward', icon: ChevronsUp, hint: ']', run: () => run({ do: 'order', to: 'up' }) },
      { label: 'Send backward', icon: ChevronsDown, hint: '[', run: () => run({ do: 'order', to: 'down' }) },
      { label: 'Send to back', icon: SendToBack, hint: '{', run: () => run({ do: 'order', to: 'back' }) },
    ];
    if (!hit) {
      sel = [];
      const ICONS = { rect: Square, circle: Circle, triangle: Triangle, diamond: Diamond };
      const place = (t: ShapeKind, label: string): MenuItem => ({
        label: `Add a ${label} here`,
        icon: ICONS[t],
        run: () => {
          history.push(doc);
          const added = addShape(doc, t, snapPoint(p, grid));
          doc = added.doc;
          sel = [added.id];
        },
      });
      canvasMenu = {
        ...at,
        items: [
          {
            label: 'Paste here',
            icon: ClipboardPaste,
            hint: '⌘V',
            disabled: getClip().length === 0,
            run: () => {
              pointer = p;
              run({ do: 'paste' });
            },
          },
          { label: 'Select all', icon: MousePointer2, hint: '⌘A', run: () => run({ do: 'all' }) },
          { separator: true },
          place('rect', 'rectangle'),
          place('circle', 'circle'),
          place('triangle', 'triangle'),
          place('diamond', 'diamond'),
        ],
      };
      return;
    }
    if (!sel.includes(hit.id)) sel = [hit.id];
    const part = find(doc, hit.id)!;
    const single = sel.length === 1;
    canvasMenu = {
      ...at,
      items: [
        ...(single
          ? [{ label: isLine(part) ? 'Edit label' : 'Edit text', icon: Type, hint: '⏎', run: () => run({ do: 'type' }) } as MenuItem]
          : []),
        ...(single && isLine(part) ? [{ label: 'Flip direction', icon: ArrowLeftRight, hint: 'f', run: () => run({ do: 'flip' }) } as MenuItem] : []),
        { label: 'Copy', icon: Copy, hint: '⌘C', run: () => run({ do: 'copy' }) },
        { label: 'Duplicate', icon: Copy, hint: '⌘D', run: () => run({ do: 'duplicate' }) },
        { separator: true },
        ...arrange,
        { separator: true },
        { label: 'Delete', icon: Trash, hint: '⌫', danger: true, run: () => run({ do: 'delete' }) },
      ],
    };
  }

  function onpointerup() {
    if (connect) finishConnect(connect);
    drag = null;
    boxing = null;
    panning = null;
    marquee = null;
    guides = [];
  }

  function onpointerleave() {
    pointer = null;
    if (!drag && !connect) hover = { shape: null, dot: null, handle: null };
  }

  const fileState = $derived(saving ? 'Saving…' : exporting ? 'Exporting…' : dirty ? 'Not saved' : `Saved ${ago(meta.updatedAt)}`);
</script>

<!-- A release anywhere ends a drag, even one that left the canvas or lost its pointer capture. -->
<svelte:window {onkeydown} {onpointerup} onpointercancel={onpointerup} />

<EditorFrame name={meta.name} ext=".lin" {dirty} onback={requestClose} onrename={rename} onversions={onversions && !failed ? () => onversions(meta, dirty) : undefined}>
  {#snippet actions()}
    {#if !failed}
      <div class="seg" role="group" aria-label="Mode">
        <button aria-pressed={!edit} title="View (e)" onclick={() => setEdit(false)}><Eye size={14} /> View</button>
        <button aria-pressed={edit} title="Edit (e)" onclick={() => setEdit(true)}><PencilRuler size={14} /> Edit</button>
      </div>
      <button class="icon-btn" title={playing ? 'Pause pulses (space)' : 'Play pulses (space)'} onclick={() => (playing = !playing)}>
        {#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}
      </button>
      <span class="sep"></span>
      <button class="icon-btn" title="Undo (⌘Z)" disabled={!canUndo || typing} onclick={() => run({ do: 'undo' })}><Undo2 size={16} /></button>
      <button class="icon-btn" title="Redo (⇧⌘Z)" disabled={!canRedo || typing} onclick={() => run({ do: 'redo' })}><Redo2 size={16} /></button>
      <span class="sep"></span>
      <button class="icon-btn" title="Zoom out (⌘−)" onclick={() => run({ do: 'zoom', by: 'out' })}><ZoomOut size={16} /></button>
      <button class="zoom" title="Fit the page (⌘0)" onclick={() => run({ do: 'zoom', by: 'fit' })}>{Math.round(zoom * 100)}%</button>
      <button class="icon-btn" title="Zoom in (⌘=)" onclick={() => run({ do: 'zoom', by: 'in' })}><ZoomIn size={16} /></button>
      <span class="sep"></span>
      <button class="btn" bind:this={exportButton} title="Export (⌘E)" onclick={openExportMenu}><FileOutput size={15} /> Export</button>
      <button class="btn" class:primary={dirty} disabled={saving || !dirty} title="Save (⌘S)" onclick={() => save()}>
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
      <button
        class="icon-btn"
        title="Show or hide the inspector (⌥⌘I)"
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
        <span>
          Unsaved changes from {ago(recovered.updatedAt)} were kept{recovered.baseVersionId !== versionId ? ', made before the last save' : ''}.
        </span>
        <button class="btn" onclick={discardRecovered}>Discard</button>
        <button class="btn primary" onclick={keepRecovered}>Restore them</button>
      </div>
    {/if}
  {/snippet}

  {#if failed}
    <div class="failed">
      <h2>This file can't be opened as a diagram</h2>
      <p>{failed}</p>
      <button class="btn" onclick={finish}>Back to the library</button>
    </div>
  {:else}
    <div class="work">
      <ToolRail {tool} {grid} onpick={pickTool} ongrid={() => run({ do: 'grid' })} onhelp={() => (sheet = true)} />
      <div class="canvas" class:viewing={!edit || hand}>
        <!-- The keyboard is handled on the window (the editor is keys); the mouse says where, and right-click offers the rest. -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <canvas
          bind:this={canvas}
          aria-label="Diagram {meta.name}"
          style:cursor
          {onpointerdown}
          {onpointermove}
          {onpointerup}
          {onpointerleave}
          {ondblclick}
          {oncontextmenu}
        ></canvas>
      </div>
      {#if prefs.value?.ui.inspectorOpen}
        <LinInspector
          {doc}
          {sel}
          {edit}
          {typing}
          style={caretStyle}
          act={apply}
          {run}
          onsize={sizeSelected}
          ontype={() => run({ do: 'type' })}
          onedit={() => setEdit(true)}
        />
      {/if}
    </div>
  {/if}

  {#snippet status()}
    <div class="line">
      <span class="what">{failed ? '' : statusText}</span>
      {#if grid && edit}<span class="tag">Grid</span>{/if}
      <span class="tag">{edit ? 'Editing' : 'Viewing'}</span>
      <span class="file">{fileState}</span>
    </div>
    {#if prefs.value?.ui.showHints && !failed}
      <div class="hints">
        {#each hints as h (h.label + h.word)}
          <span><kbd>{h.label}</kbd> {h.word}</span>
        {/each}
      </div>
    {/if}
  {/snippet}
</EditorFrame>

{#if canvasMenu}
  <ContextMenu x={canvasMenu.x} y={canvasMenu.y} items={canvasMenu.items} onclose={() => (canvasMenu = null)} />
{/if}

{#if sheet}
  <ShortcutSheet title="Diagram shortcuts" groups={LIN_SHORTCUTS} onclose={() => (sheet = false)} />
{/if}

{#if exportMenu}
  <ContextMenu x={exportMenu.x} y={exportMenu.y} items={exportItems} onclose={() => (exportMenu = null)} />
{/if}

{#if closing}
  <Dialog title="Save changes to “{meta.name}”?" onclose={() => (closing = false)} width={420}>
    <p class="ask">If you don't, the changes are lost.</p>
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
  .canvas {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .viewing canvas:active {
    cursor: grabbing !important;
  }
  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--faint);
  }
  .zoom {
    min-width: 48px;
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
  .line,
  .hints {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
  }
  .line {
    height: 28px;
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    padding: 1px 7px;
    border: 1px solid var(--faint);
    border-radius: 10px;
    color: var(--dim);
    font-size: 11px;
  }
  .file {
    color: var(--dim);
    font-size: 12px;
  }
  .hints {
    flex-wrap: wrap;
    gap: 2px 14px;
    padding-bottom: 7px;
    color: var(--dim);
    font-size: 12px;
  }
  .hints span {
    white-space: nowrap;
  }
  kbd {
    display: inline-block;
    min-width: 18px;
    padding: 0 5px;
    border: 1px solid var(--faint);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font);
    font-size: 11px;
    text-align: center;
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
  .ask {
    margin: 0;
    color: var(--dim);
  }
  .grow {
    flex: 1;
  }
</style>
