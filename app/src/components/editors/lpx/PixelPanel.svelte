<!--
  The pixel editor's panel, down the right: the two colours you paint with,
  the palette, and the layers. Click a palette colour for the first colour,
  right-click it for the second, double-click it to change it (every pixel of
  that colour changes too). Layers list top first; the outlined one is the
  one you're drawing on.
-->
<script lang="ts">
  import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Eye, EyeOff, Layers, Lock, LockOpen, Merge, Minus, Palette as PaletteIcon, Plus, Trash } from '@lucide/svelte';
  import { PRESETS, type Layer, type Pix } from '../../../lib/lpx/model';
  import type { Palette } from '../../../lib/types';
  import ContextMenu from '../../ui/ContextMenu.svelte';
  import InlineEdit from '../../ui/InlineEdit.svelte';
  import type { MenuItem } from '../../ui/menu';

  type LayerAction = 'add' | 'duplicate' | 'delete' | 'merge' | 'up' | 'down';

  let {
    pix,
    rev,
    active,
    primary,
    secondary,
    palettes,
    onactive,
    onprimary,
    onsecondary,
    onswap,
    onlayer,
    onlayerset,
    oncolour,
    onaddcolour,
    onremovecolour,
    onusepalette,
    onsavepalette,
    ondeletepalette,
  }: {
    pix: Pix;
    /** Bumped whenever the image changes in place, so the panel redraws. */
    rev: number;
    active: number;
    primary: number;
    secondary: number;
    palettes: Palette[];
    onactive: (id: number) => void;
    onprimary: (index: number) => void;
    onsecondary: (index: number) => void;
    onswap: () => void;
    onlayer: (what: LayerAction) => void;
    onlayerset: (id: number, change: Partial<Pick<Layer, 'name' | 'show' | 'lock' | 'op'>>) => void;
    oncolour: (index: number, hex: string) => void;
    onaddcolour: (hex: string) => void;
    onremovecolour: () => void;
    onusepalette: (colours: readonly string[], name: string) => void;
    onsavepalette: () => void;
    ondeletepalette: (p: Palette) => void;
  } = $props();

  const pal = $derived((void rev, [...pix.pal]));
  const layers = $derived((void rev, [...pix.layers].reverse()));
  const activeLayer = $derived((void rev, pix.layers.find((l) => l.id === active)));

  let renaming = $state<number | null>(null);
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  /** What the colour picker is for: changing a colour, or adding one. */
  let picking: { index: number } | 'add' | null = null;

  const rgb = (hex: string) => hex.slice(0, 7);

  function editColour(index: number) {
    if (index === 0 || !picker) return;
    picking = { index };
    picker.value = rgb(pal[index]);
    picker.click();
  }

  function addColour() {
    if (!picker) return;
    picking = 'add';
    picker.value = rgb(pal[primary] && primary > 0 ? pal[primary] : '#ffffff');
    picker.click();
  }

  function oninput(e: Event & { currentTarget: HTMLInputElement }) {
    if (picking && picking !== 'add') oncolour(picking.index, e.currentTarget.value);
  }

  function onchange(e: Event & { currentTarget: HTMLInputElement }) {
    if (picking === 'add') onaddcolour(e.currentTarget.value);
    else if (picking) oncolour(picking.index, e.currentTarget.value);
    picking = null;
  }

  function paletteMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu = {
      x: r.left,
      y: r.bottom + 4,
      items: [
        ...PRESETS.map((p) => ({ label: `Use ${p.name}`, hint: `${p.colours.length}`, run: () => onusepalette(p.colours, p.name) }) as MenuItem),
        ...(palettes.length ? [{ separator: true } as MenuItem] : []),
        ...palettes.map((p) => ({ label: `Use ${p.name}`, hint: `${p.colours.length}`, run: () => onusepalette(p.colours, p.name) }) as MenuItem),
        { separator: true },
        { label: 'Save this palette…', icon: Plus, run: onsavepalette },
        ...palettes.map((p) => ({ label: `Delete ${p.name}`, icon: Trash, danger: true, run: () => ondeletepalette(p) }) as MenuItem),
      ],
    };
  }

  async function rename(id: number, name: string) {
    onlayerset(id, { name });
    renaming = null;
    return true;
  }
</script>

<aside class="panel" aria-label="Colours and layers">
  <section>
    <h3>Colours</h3>
    <div class="pair">
      <div class="wells">
        <button class="well second" class:clear={secondary === 0} style:--c={pal[secondary]} title="Second colour (right-click)" aria-label="Second colour"></button>
        <button class="well first" class:clear={primary === 0} style:--c={pal[primary]} title="First colour" aria-label="First colour" ondblclick={() => editColour(primary)}></button>
      </div>
      <button class="icon-btn" title="Swap them (x)" onclick={onswap}><ArrowUpDown size={15} /></button>
      <span class="which">{primary === 0 ? 'Transparent' : pal[primary]?.slice(0, 7)}</span>
    </div>
  </section>

  <section>
    <div class="head">
      <h3>Palette</h3>
      <span class="dim">{pal.length - 1}</span>
      <span class="grow"></span>
      <button class="icon-btn" title="Add a colour" onclick={addColour}><Plus size={15} /></button>
      <button class="icon-btn" title="Take out the first colour (if no pixel uses it)" disabled={primary === 0} onclick={onremovecolour}><Minus size={15} /></button>
      <button class="icon-btn" title="Palettes" onclick={paletteMenu}><PaletteIcon size={15} /></button>
    </div>
    <div class="palette" role="listbox" aria-label="Palette">
      {#each pal as c, i (i)}
        <button
          class="cell"
          class:clear={i === 0}
          class:first={i === primary}
          class:second={i === secondary && i !== primary}
          style:--c={c}
          role="option"
          aria-selected={i === primary}
          title={i === 0 ? 'Transparent (0)' : `${c.slice(0, 7)}${c.endsWith('ff') ? '' : ` at ${Math.round((parseInt(c.slice(7), 16) / 255) * 100)}%`}${i < 10 ? ` (${i})` : ''}`}
          onclick={() => onprimary(i)}
          oncontextmenu={(e) => {
            e.preventDefault();
            onsecondary(i);
          }}
          ondblclick={() => editColour(i)}
        ></button>
      {/each}
    </div>
    <p class="dim tip">Click: first colour · right-click: second · double-click: change it</p>
    <input class="picker" type="color" bind:this={picker} {oninput} {onchange} tabindex="-1" aria-hidden="true" />
  </section>

  <section class="layers">
    <div class="head">
      <h3>Layers</h3>
      <span class="dim">{layers.length}</span>
      <span class="grow"></span>
      <button class="icon-btn" title="New layer" onclick={() => onlayer('add')}><Plus size={15} /></button>
      <button class="icon-btn" title="Duplicate" onclick={() => onlayer('duplicate')}><Copy size={15} /></button>
      <button class="icon-btn" title="Merge down" onclick={() => onlayer('merge')}><Merge size={15} /></button>
      <button class="icon-btn" title="Delete layer" disabled={layers.length < 2} onclick={() => onlayer('delete')}><Trash size={15} /></button>
    </div>
    <div class="list" role="listbox" aria-label="Layers">
      {#each layers as l (l.id)}
        <div class="layer" class:on={l.id === active} role="option" aria-selected={l.id === active} tabindex="-1" onclick={() => onactive(l.id)} onkeydown={() => {}}>
          <button class="icon-btn" title={l.show ? 'Hide' : 'Show'} onclick={(e) => (e.stopPropagation(), onlayerset(l.id, { show: !l.show }))}>
            {#if l.show}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
          </button>
          {#if renaming === l.id}
            <InlineEdit value={l.name} label="Layer name" oncommit={(n) => rename(l.id, n)} oncancel={() => (renaming = null)} />
          {:else}
            <span class="name" class:dim={!l.show} role="presentation" ondblclick={() => (renaming = l.id)}>{l.name}</span>
          {/if}
          {#if l.op < 100}<span class="op">{l.op}%</span>{/if}
          <button class="icon-btn" class:set={l.lock} title={l.lock ? 'Unlock' : 'Lock'} onclick={(e) => (e.stopPropagation(), onlayerset(l.id, { lock: !l.lock }))}>
            {#if l.lock}<Lock size={14} />{:else}<LockOpen size={14} />{/if}
          </button>
        </div>
      {/each}
    </div>
    {#if activeLayer}
      <div class="op-row">
        <Layers size={14} />
        <input
          type="range"
          min="0"
          max="100"
          value={activeLayer.op}
          aria-label="Opacity"
          oninput={(e) => onlayerset(activeLayer.id, { op: e.currentTarget.valueAsNumber })}
        />
        <span class="value">{activeLayer.op}%</span>
      </div>
      <div class="order">
        <button class="btn small" onclick={() => onlayer('up')}><ArrowUp size={13} /> Up</button>
        <button class="btn small" onclick={() => onlayer('down')}><ArrowDown size={13} /> Down</button>
      </div>
    {/if}
  </section>
</aside>

{#if menu}
  <ContextMenu {...menu} onclose={() => (menu = null)} />
{/if}

<style>
  .panel {
    width: 248px;
    flex: none;
    overflow-y: auto;
    border-left: 1px solid var(--faint);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
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
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .grow {
    flex: 1;
  }
  .dim {
    color: var(--dim);
    font-size: 11px;
  }
  .tip {
    margin: 0;
  }
  /* Transparent, shown as a checkerboard. */
  .clear {
    background:
      repeating-conic-gradient(var(--faint) 0 25%, transparent 0 50%) 0 0 / 8px 8px,
      var(--bg) !important;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .wells {
    position: relative;
    width: 54px;
    height: 46px;
    flex: none;
  }
  .well {
    position: absolute;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--c);
    cursor: default;
  }
  .well.first {
    top: 0;
    left: 0;
    box-shadow: 0 0 0 2px var(--bg);
  }
  .well.second {
    right: 0;
    bottom: 0;
  }
  .which {
    color: var(--dim);
    font-family: var(--mono);
    font-size: 12px;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .cell {
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid var(--faint);
    border-radius: 4px;
    background: var(--c);
    cursor: pointer;
  }
  .cell.first {
    box-shadow:
      0 0 0 1.5px var(--bg),
      0 0 0 3px var(--line);
  }
  .cell.second {
    outline: 1.5px dashed var(--line);
    outline-offset: 1.5px;
  }
  .picker {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .layer {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    padding: 0 2px;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: default;
  }
  .layer.on {
    border-color: var(--line);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .op {
    color: var(--dim);
    font-size: 11px;
  }
  .set {
    color: var(--ink);
  }
  .op-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--dim);
  }
  .op-row input {
    flex: 1;
    accent-color: var(--ink);
  }
  .value {
    width: 36px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .order {
    display: flex;
    gap: 6px;
  }
  .small {
    flex: 1;
    height: 26px;
    font-size: 12px;
  }
</style>
