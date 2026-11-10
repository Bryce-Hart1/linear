<!--
  The .lin editor's inspector, down the right: everything the keyboard can do
  to the selection, as controls. It shows the page with nothing selected, a
  shape's or line's properties with one selected, and what they share with
  several. Every control runs the same edit functions as its key, so a
  refusal says why the same way, and the result is plain .lin v1.
-->
<script lang="ts">
  import {
    ArrowLeftRight,
    Bold,
    BringToFront,
    ChevronsDown,
    ChevronsUp,
    Copy,
    Italic,
    Minus,
    MoveHorizontal,
    MoveRight,
    SendToBack,
    Trash,
    Type,
    Underline,
  } from '@lucide/svelte';
  import type { Command } from '../../../lib/lin/keys';
  import type { Edited } from '../../../lib/lin/edit';
  import { capacity, labelCapacity } from '../../../lib/lin/geometry';
  import { BOLD, FONT_PX, ITALIC, PALETTE, UNDERLINE, find, isLine, type Doc, type FontKey, type Part } from '../../../lib/lin/model';
  import { setGlow, setHead, setPulse, setRoute, setStroke } from '../../../lib/lin-ui/set';

  let {
    doc,
    sel,
    edit,
    typing,
    style,
    act,
    run,
    onsize,
    ontype,
    onedit,
  }: {
    doc: Doc;
    sel: number[];
    edit: boolean;
    typing: boolean;
    /** The letter style at the caret, while typing in a shape. */
    style: number;
    /** Do an edit to every selected part. */
    act: (make: (d: Doc, id: number) => Edited) => void;
    run: (c: Command) => void;
    onsize: (w: number, h: number) => void;
    ontype: () => void;
    onedit: () => void;
  } = $props();

  const parts = $derived(sel.map((id) => find(doc, id)).filter((p): p is Part => !!p));
  const one = $derived(parts.length === 1 ? parts[0] : null);
  const shape = $derived(one && !isLine(one) ? one : null);
  const line = $derived(one && isLine(one) ? one : null);
  const allLines = $derived(parts.length > 0 && parts.every(isLine));

  /** The value every selected part has, or null if they differ. */
  function shared<T>(get: (p: Part) => T): T | null {
    if (parts.length === 0) return null;
    const v = get(parts[0]);
    return parts.every((p) => get(p) === v) ? v : null;
  }

  const KIND_NAMES: Record<string, string> = { rect: 'Rectangle', circle: 'Circle', triangle: 'Triangle', diamond: 'Diamond' };
  const title = $derived(
    !edit
      ? 'Viewing'
      : parts.length === 0
        ? 'Page'
        : parts.length > 1
          ? `${parts.length} selected`
          : shape
            ? KIND_NAMES[shape.t]
            : line!.head === 'none'
              ? 'Line'
              : 'Arrow',
  );

  const FONTS: [FontKey, string][] = [
    ['i', 'S'],
    ['o', 'M'],
    ['p', 'L'],
  ];

  /** A number field shows what the shape has after a change, refused or not. */
  function sizeField(e: Event & { currentTarget: HTMLInputElement }, which: 'w' | 'h') {
    const el = e.currentTarget;
    const n = el.valueAsNumber;
    if (!shape) return;
    const id = shape.id;
    if (Number.isFinite(n)) onsize(which === 'w' ? n : shape.w, which === 'h' ? n : shape.h);
    // `doc` is the editor's own state, so it's already up to date here.
    const now = find(doc, id);
    if (now && !isLine(now)) el.value = String(now[which]);
  }

  const preview = (text: string) => text.split('\n')[0] || '';
</script>

<aside class="inspector" aria-label="Inspector">
  <header>
    <h2>{title}</h2>
  </header>

  {#if !edit}
    <section>
      <p class="dim">Pulses play while viewing. Switch to editing to change the diagram.</p>
      <button class="btn primary wide" onclick={onedit}>Edit (e)</button>
    </section>
    <section>
      <h3>Page</h3>
      <div class="row"><span>Size</span><span class="value">{doc.w} × {doc.h}</span></div>
      <div class="row"><span>Parts</span><span class="value">{doc.items.length}</span></div>
    </section>
  {:else if parts.length === 0}
    <section>
      <div class="row"><span>Size</span><span class="value">{doc.w} × {doc.h}</span></div>
      <div class="row"><span>Shapes</span><span class="value">{doc.items.filter((p) => !isLine(p)).length}</span></div>
      <div class="row"><span>Lines</span><span class="value">{doc.items.filter(isLine).length}</span></div>
    </section>
    <section>
      <p class="dim">
        Pick a shape on the left, then click to place it. Drag from the dots on a shape's edge to draw a line out of it. Click a part to
        change it here.
      </p>
    </section>
  {:else}
    <section>
      <h3>Colour</h3>
      <div class="swatches" role="group" aria-label="Colour">
        {#each PALETTE as c, i (i)}
          <button
            class="swatch"
            class:plain={i === 0}
            style:--c={c.fill}
            aria-pressed={shared((p) => p.c) === i}
            title="{c.name} ({i})"
            onclick={() => run({ do: 'color', c: i })}
          ></button>
        {/each}
      </div>
    </section>

    {#if shape}
      <section>
        <h3>{shape.t === 'circle' ? 'Diameter' : 'Size'}</h3>
        <div class="size">
          <label>
            <span>{shape.t === 'circle' ? 'D' : 'W'}</span>
            <input type="number" min="24" max="800" step="10" value={shape.w} onchange={(e) => sizeField(e, 'w')} />
          </label>
          {#if shape.t !== 'circle'}
            <label>
              <span>H</span>
              <input type="number" min="24" max="800" step="10" value={shape.h} onchange={(e) => sizeField(e, 'h')} />
            </label>
          {/if}
        </div>
      </section>
    {/if}

    {#if line}
      <section>
        <h3>Ends</h3>
        <div class="split">
          <div class="seg" role="group" aria-label="Arrowheads">
            <button aria-pressed={line.head === 'none'} title="No arrowheads" onclick={() => act((d, id) => setHead(d, id, 'none'))}>
              <Minus size={15} />
            </button>
            <button aria-pressed={line.head === 'end'} title="An arrow at the end" onclick={() => act((d, id) => setHead(d, id, 'end'))}>
              <MoveRight size={15} />
            </button>
            <button aria-pressed={line.head === 'both'} title="Arrows at both ends" onclick={() => act((d, id) => setHead(d, id, 'both'))}>
              <MoveHorizontal size={15} />
            </button>
          </div>
          <button class="btn small" title="Flip its direction (f)" onclick={() => run({ do: 'flip' })}><ArrowLeftRight size={14} /> Flip</button>
        </div>
      </section>
      <section>
        <h3>Path</h3>
        <div class="seg full" role="group" aria-label="Path">
          {#each [['straight', 'Straight'], ['curve', 'Curved'], ['elbow', 'Square']] as const as [r, label] (r)}
            <button aria-pressed={line.route === r} onclick={() => act((d, id) => setRoute(d, id, r))}>{label}</button>
          {/each}
        </div>
      </section>
      <section>
        <h3>Pulse</h3>
        <div class="seg full" role="group" aria-label="Pulse">
          {#each [['off', 'Off', 'Still'], ['fwd', '→', 'From start to end'], ['rev', '←', 'From end to start'], ['mid', '↔', 'Out from the middle']] as const as [v, label, tip] (v)}
            <button aria-pressed={line.pulse === v} title={tip} onclick={() => act((d, id) => setPulse(d, id, v))}>{label}</button>
          {/each}
        </div>
        <div class="seg full" role="group" aria-label="What travels">
          <button aria-pressed={line.glow === 'ball'} disabled={line.pulse === 'off'} onclick={() => act((d, id) => setGlow(d, id, 'ball'))}>Ball</button>
          <button aria-pressed={line.glow === 'light'} disabled={line.pulse === 'off'} onclick={() => act((d, id) => setGlow(d, id, 'light'))}>Light</button>
        </div>
      </section>
    {/if}

    <section>
      <h3>{allLines ? 'Line' : 'Outline'}</h3>
      <div class="seg full" role="group" aria-label="Outline">
        {#each [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']] as const as [v, label] (v)}
          <button aria-pressed={shared((p) => p.ln) === v} onclick={() => act((d, id) => setStroke(d, id, v))}>{label}</button>
        {/each}
      </div>
    </section>

    <section>
      <h3>{line ? 'Label' : 'Text'}</h3>
      {#if one}
        {@const n = [...one.text].length}
        {@const cap = isLine(one) ? labelCapacity(doc, one) : capacity(one)}
        <div class="text">
          <span class="preview" class:dim={!one.text}>{one.text ? preview(one.text) : line ? 'No label' : 'No text'}</span>
          <span class="count">{n}/{cap}</span>
        </div>
      {/if}
      <div class="seg full" role="group" aria-label="Text size">
        {#each FONTS as [f, label] (f)}
          <button aria-pressed={shared((p) => p.f) === f} title="{FONT_PX[f]} px ({f})" onclick={() => run({ do: 'font', f })}>{label}</button>
        {/each}
      </div>
      {#if one}
        {#if typing}
          {#if shape}
            <div class="seg full" role="group" aria-label="Letter style">
              <button aria-pressed={(style & BOLD) !== 0} title="Bold (⌥B)" onclick={() => run({ do: 'format', flag: BOLD })}><Bold size={14} /></button>
              <button aria-pressed={(style & ITALIC) !== 0} title="Italic (⌥I)" onclick={() => run({ do: 'format', flag: ITALIC })}><Italic size={14} /></button>
              <button aria-pressed={(style & UNDERLINE) !== 0} title="Underline (⌥U)" onclick={() => run({ do: 'format', flag: UNDERLINE })}>
                <Underline size={14} />
              </button>
            </div>
          {/if}
          <button class="btn wide" onclick={() => run({ do: 'done' })}>Done typing (esc)</button>
        {:else}
          <button class="btn wide" onclick={ontype}><Type size={14} /> {line ? 'Edit label' : 'Edit text'} (⏎)</button>
        {/if}
      {/if}
    </section>

    <section>
      <h3>Arrange</h3>
      <div class="arrange">
        <button class="icon-btn" title="To the back ({'{'})" onclick={() => run({ do: 'order', to: 'back' })}><SendToBack size={16} /></button>
        <button class="icon-btn" title="Back one ([)" onclick={() => run({ do: 'order', to: 'down' })}><ChevronsDown size={16} /></button>
        <button class="icon-btn" title="Forward one (])" onclick={() => run({ do: 'order', to: 'up' })}><ChevronsUp size={16} /></button>
        <button class="icon-btn" title="To the front ({'}'})" onclick={() => run({ do: 'order', to: 'front' })}><BringToFront size={16} /></button>
        <span class="grow"></span>
        <button class="icon-btn" title="Duplicate (⌘D)" onclick={() => run({ do: 'duplicate' })}><Copy size={16} /></button>
        <button class="icon-btn danger" title="Delete (⌫)" onclick={() => run({ do: 'delete' })}><Trash size={16} /></button>
      </div>
    </section>
  {/if}
</aside>

<style>
  .inspector {
    width: 248px;
    flex: none;
    overflow-y: auto;
    border-left: 1px solid var(--faint);
    background: var(--sidebar);
  }
  header {
    padding: 14px 16px 4px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 16px 12px;
    border-bottom: 1px solid var(--faint);
  }
  h3 {
    margin: 0;
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .dim {
    color: var(--dim);
  }
  p {
    margin: 0;
    font-size: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
  .value {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }
  .wide {
    width: 100%;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .swatch {
    aspect-ratio: 1;
    border: 1px solid color-mix(in srgb, var(--c), black 15%);
    border-radius: 6px;
    background: var(--c);
    cursor: pointer;
  }
  .swatch.plain {
    border-color: var(--ink);
    background: var(--paper);
  }
  .swatch[aria-pressed='true'] {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 3.5px var(--line);
  }
  .size {
    display: flex;
    gap: 8px;
  }
  .size label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--faint);
    border-radius: 6px;
    background: var(--surface);
  }
  .size label:focus-within {
    border-color: var(--line);
  }
  .size span {
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
  }
  .size input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .split {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .split .seg {
    flex: 1;
  }
  .seg {
    display: flex;
  }
  .seg button {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
  }
  .seg button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .small {
    height: 30px;
    padding: 0 10px;
  }
  .text {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .preview {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--dim);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .arrange {
    display: flex;
    gap: 2px;
  }
  .grow {
    flex: 1;
  }
  .danger:hover {
    color: var(--danger);
  }
</style>
