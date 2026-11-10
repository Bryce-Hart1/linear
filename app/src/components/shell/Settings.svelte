<!--
  Settings: every preference kept in the library (linear-store's prefs.rs),
  in tabs. Each control writes through `prefs.set` and shows what was stored,
  so a refused value springs back and the reason appears in the notes line.
  "Reset all" puts every preference back to its default (the window's size
  and the last export folder stay).
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { api } from '../../lib/api';
  import { INKS, MAX_SIDE as MAX_PAGE, MIN_SIDE as MIN_PAGE, WIDTHS } from '../../lib/ldw/model';
  import { MAX_SIDE, PRESETS } from '../../lib/lpx/model';
  import { prefs } from '../../lib/prefs.svelte';
  import type { Palette, Theme } from '../../lib/types';
  import Confirm from './Confirm.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  let tab = $state<'general' | 'library' | 'lin' | 'lpx' | 'ldw'>('general');
  let saved = $state<Palette[]>([]);
  let resetting = $state(false);

  onMount(() => {
    dialog?.showModal();
    api.listPalettes().then((p) => (saved = p)).catch(() => {});
  });

  const TABS: [typeof tab, string][] = [
    ['general', 'General'],
    ['library', 'Library'],
    ['lin', 'Diagrams'],
    ['lpx', 'Pixel art'],
    ['ldw', 'Drawings'],
  ];

  const THEMES: [Theme, string][] = [
    ['system', 'Match system'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];

  const read = (key: string) => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], prefs.value);

  /** Sets a number, then shows what was stored: after a refusal nothing changed, so Svelte wouldn't redraw the field. */
  async function setNumber(key: string, input: HTMLInputElement, scale = 1) {
    await prefs.set(key, input.valueAsNumber * scale);
    input.value = String((read(key) as number) / scale);
  }

  /** One side of a [w, h] pair. */
  async function setSide(key: string, i: 0 | 1, input: HTMLInputElement) {
    const pair = [...(read(key) as number[])];
    pair[i] = input.valueAsNumber;
    await prefs.set(key, pair);
    input.value = String((read(key) as number[])[i]);
  }

  async function resetAll() {
    for (const key of ['theme', 'library', 'ui', 'versions', 'draft', 'lin', 'lpx', 'ldw']) await prefs.reset(key);
  }

  function onclick(e: MouseEvent) {
    if (e.target === dialog) dialog?.close();
  }
</script>

<dialog bind:this={dialog} {onclick} {onclose} aria-labelledby="settings-title">
  {#if prefs.value}
    {@const p = prefs.value}
    <header>
      <h2 id="settings-title">Settings</h2>
      <button class="icon-btn" title="Close" onclick={() => dialog?.close()}><X size={16} /></button>
    </header>

    <div class="body">
      <nav aria-label="Settings sections">
        {#each TABS as [id, label] (id)}
          <button aria-current={tab === id ? 'page' : undefined} onclick={() => (tab = id)}>{label}</button>
        {/each}
        <span class="grow"></span>
        <button class="reset" onclick={() => (resetting = true)}>Reset all…</button>
      </nav>

      <div class="pane">
        {#if tab === 'general'}
          <div class="field">
            <span>Theme</span>
            <div class="seg" role="group" aria-label="Theme">
              {#each THEMES as [value, label] (value)}
                <button aria-pressed={p.theme === value} onclick={() => prefs.set('theme', value)}>{label}</button>
              {/each}
            </div>
          </div>
          <label class="field">
            <span>Show key hints under the canvas</span>
            <input type="checkbox" checked={p.ui.showHints} onchange={(e) => prefs.set('ui.showHints', e.currentTarget.checked)} />
          </label>
          <label class="field">
            <span>Show the inspector and panels in editors</span>
            <input type="checkbox" checked={p.ui.inspectorOpen} onchange={(e) => prefs.set('ui.inspectorOpen', e.currentTarget.checked)} />
          </label>
          <label class="field">
            <span>Sidebar width</span>
            <span class="unit">
              <input class="num" type="number" min="160" max="480" step="10" value={p.ui.sidebarWidth} onchange={(e) => setNumber('ui.sidebarWidth', e.currentTarget)} />
              px
            </span>
          </label>
        {:else if tab === 'library'}
          <label class="field">
            <span>Versions kept for each document</span>
            <input class="num" type="number" min="1" max="1000" value={p.versions.keep} onchange={(e) => setNumber('versions.keep', e.currentTarget)} />
          </label>
          <p class="help">Each save adds a version; past this many, the oldest go. Open a document's versions from its right-click menu or the clock in its editor.</p>
          <label class="field">
            <span>Keep unsaved work as a draft after</span>
            <span class="unit">
              <input
                class="num"
                type="number"
                min="0.25"
                max="60"
                step="0.25"
                value={p.draft.delayMs / 1000}
                onchange={(e) => setNumber('draft.delayMs', e.currentTarget, 1000)}
              />
              s
            </span>
          </label>
          <p class="help">A draft is offered back if linear closes before you save.</p>
        {:else if tab === 'lin'}
          <div class="field">
            <span>Open diagrams for</span>
            <div class="seg" role="group" aria-label="Open diagrams for">
              <button aria-pressed={p.lin.openIn === 'view'} onclick={() => prefs.set('lin.openIn', 'view')}>Viewing</button>
              <button aria-pressed={p.lin.openIn === 'edit'} onclick={() => prefs.set('lin.openIn', 'edit')}>Editing</button>
            </div>
          </div>
          <label class="field">
            <span>Play pulses when a diagram opens</span>
            <input type="checkbox" checked={p.lin.playOnOpen} onchange={(e) => prefs.set('lin.playOnOpen', e.currentTarget.checked)} />
          </label>
          <p class="help">If your system asks for reduced motion, pulses start paused whatever this says.</p>
          <label class="field">
            <span>Snap to the 10 px grid when a diagram opens</span>
            <input type="checkbox" checked={p.lin.grid} onchange={(e) => prefs.set('lin.grid', e.currentTarget.checked)} />
          </label>
        {:else if tab === 'lpx'}
          <div class="field">
            <span>New images are</span>
            <span class="unit">
              <input class="num" type="number" min="1" max={MAX_SIDE} value={p.lpx.defaultSize[0]} onchange={(e) => setSide('lpx.defaultSize', 0, e.currentTarget)} aria-label="Width" />
              ×
              <input class="num" type="number" min="1" max={MAX_SIDE} value={p.lpx.defaultSize[1]} onchange={(e) => setSide('lpx.defaultSize', 1, e.currentTarget)} aria-label="Height" />
            </span>
          </div>
          <label class="field">
            <span>Starting palette</span>
            <select class="input select" value={p.lpx.defaultPalette} onchange={(e) => prefs.set('lpx.defaultPalette', e.currentTarget.value)}>
              {#each PRESETS as pr (pr.id)}<option value={pr.id}>{pr.name}</option>{/each}
              {#each saved as s (s.id)}<option value="saved:{s.id}">{s.name}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span>Show the pixel grid when zoomed in</span>
            <input type="checkbox" checked={p.lpx.showGrid} onchange={(e) => prefs.set('lpx.showGrid', e.currentTarget.checked)} />
          </label>
          <label class="field">
            <span>Export PNGs at</span>
            <span class="unit">
              <input class="num" type="number" min="1" max="32" value={p.lpx.exportScale} onchange={(e) => setNumber('lpx.exportScale', e.currentTarget)} />
              ×
            </span>
          </label>
        {:else}
          <div class="field">
            <span>New pages are</span>
            <span class="unit">
              <input class="num" type="number" min={MIN_PAGE} max={MAX_PAGE} value={p.ldw.page[0]} onchange={(e) => setSide('ldw.page', 0, e.currentTarget)} aria-label="Width" />
              ×
              <input class="num" type="number" min={MIN_PAGE} max={MAX_PAGE} value={p.ldw.page[1]} onchange={(e) => setSide('ldw.page', 1, e.currentTarget)} aria-label="Height" />
            </span>
          </div>
          <div class="field">
            <span>Pen colour</span>
            <div class="inks" role="group" aria-label="Pen colour">
              {#each INKS as c (c)}
                <button class="ink" class:on={p.ldw.pen.color === c} style:--c={c} aria-label={c} onclick={() => prefs.set('ldw.pen.color', c)}></button>
              {/each}
            </div>
          </div>
          <div class="field">
            <span>Pen width</span>
            <div class="seg" role="group" aria-label="Pen width">
              {#each WIDTHS as w (w)}
                <button aria-pressed={p.ldw.pen.width === w} onclick={() => prefs.set('ldw.pen.width', w)}>{w}</button>
              {/each}
            </div>
          </div>
          <label class="field">
            <span>Pen opacity</span>
            <span class="unit">
              <input class="num" type="number" min="1" max="100" value={p.ldw.pen.opacity} onchange={(e) => setNumber('ldw.pen.opacity', e.currentTarget)} />
              %
            </span>
          </label>
          <label class="field">
            <span>How much the pen steadies a shaky hand</span>
            <input
              class="range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={p.ldw.smoothing}
              onchange={(e) => prefs.set('ldw.smoothing', e.currentTarget.valueAsNumber)}
            />
          </label>
        {/if}
      </div>
    </div>
  {/if}
</dialog>

{#if resetting}
  <Confirm
    title="Reset every setting?"
    message="Everything here goes back to how linear started. Your documents, palettes and their versions aren't touched."
    confirm="Reset all"
    onclose={() => (resetting = false)}
    onconfirm={resetAll}
  />
{/if}

<style>
  dialog {
    width: min(640px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--bg);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.72);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 10px 20px;
    border-bottom: 1px solid var(--faint);
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
  }
  .body {
    display: grid;
    grid-template-columns: 150px 1fr;
    min-height: 340px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 10px;
    border-right: 1px solid var(--faint);
  }
  nav button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--dim);
    text-align: left;
    cursor: pointer;
  }
  nav button:hover {
    color: var(--ink);
  }
  nav button[aria-current='page'] {
    border-color: var(--line);
    color: var(--ink);
  }
  nav .reset {
    font-size: 12px;
  }
  .grow {
    flex: 1;
  }
  .pane {
    padding: 14px 20px 18px;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
  }
  .help {
    margin: -4px 0 8px;
    color: var(--dim);
    font-size: 12px;
  }
  .unit {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
  }
  .num {
    width: 72px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--faint);
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    text-align: right;
  }
  .num:focus {
    border-color: var(--line);
    outline: none;
  }
  .select {
    width: 180px;
    height: 30px;
  }
  .range {
    width: 160px;
    accent-color: var(--ink);
  }
  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  .inks {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    max-width: 260px;
  }
  .ink {
    width: 18px;
    height: 18px;
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
  .seg button {
    padding: 0 9px;
  }
</style>
