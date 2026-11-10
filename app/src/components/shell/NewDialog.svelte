<!--
  Names a new document before it's made. Pixel art also asks for its size and
  the palette it starts with; the choices are remembered for next time.
  Drawings will ask for their page size here too (M5).
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { api } from '../../lib/api';
  import { kindInfo, type NewOptions } from '../../lib/kinds';
  import { MAX_SIDE, PRESETS } from '../../lib/lpx/model';
  import { prefs } from '../../lib/prefs.svelte';
  import type { Kind, Palette } from '../../lib/types';
  import Dialog from '../ui/Dialog.svelte';

  let {
    kind,
    where,
    onclose,
    oncreate,
  }: { kind: Kind; where: string; onclose: () => void; oncreate: (name: string, opts?: NewOptions) => void } = $props();
  const info = $derived(kindInfo(kind));
  let name = $state(untrack(() => `Untitled ${kindInfo(kind).label.toLowerCase()}`));
  let input: HTMLInputElement | undefined = $state();

  // Pixel art: the size and the palette.
  const SIZES = [16, 32, 64, 128, 256];
  const start = untrack(() => prefs.value?.lpx);
  let w = $state(start?.defaultSize[0] ?? 32);
  let h = $state(start?.defaultSize[1] ?? 32);
  let palette = $state(start?.defaultPalette ?? 'linear16');
  let saved = $state<Palette[]>([]);

  const choices = $derived([
    ...PRESETS.map((p) => ({ id: p.id, name: p.name, colours: p.colours })),
    ...saved.map((p) => ({ id: `saved:${p.id}`, name: p.name, colours: p.colours })),
  ]);
  const chosen = $derived(choices.find((c) => c.id === palette) ?? choices[0]);
  const sizeOk = $derived([w, h].every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE));

  onMount(() => {
    input?.focus();
    input?.select();
    if (kind === 'lpx') api.listPalettes().then((p) => (saved = p)).catch(() => {});
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (kind !== 'lpx') return oncreate(name);
    if (!sizeOk) return;
    prefs.set('lpx.defaultSize', [w, h]);
    prefs.set('lpx.defaultPalette', chosen.id);
    oncreate(name, { w, h, colours: chosen.colours });
  }
</script>

<Dialog title="New {info.label.toLowerCase()}" {onclose} width={kind === 'lpx' ? 460 : 420}>
  <form id="new-doc" onsubmit={submit}>
    <label>
      <span>Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:this={input} bind:value={name} spellcheck="false" autofocus />
    </label>

    {#if kind === 'lpx'}
      <div class="field">
        <span>Size</span>
        <div class="sizes">
          <div class="seg" role="group" aria-label="Square sizes">
            {#each SIZES as s (s)}
              <button type="button" aria-pressed={w === s && h === s} onclick={() => ((w = s), (h = s))}>{s}</button>
            {/each}
          </div>
          <input class="input num" type="number" min="1" max={MAX_SIDE} bind:value={w} aria-label="Width" />
          <span class="x">×</span>
          <input class="input num" type="number" min="1" max={MAX_SIDE} bind:value={h} aria-label="Height" />
        </div>
      </div>
      <div class="field">
        <span>Palette</span>
        <div class="palettes">
          <select class="input" bind:value={palette}>
            {#each choices as c (c.id)}<option value={c.id}>{c.name} ({c.colours.length})</option>{/each}
          </select>
          <div class="swatches" aria-hidden="true">
            {#each chosen.colours.slice(0, 32) as c, i (i)}<span style:background={c}></span>{/each}
          </div>
        </div>
      </div>
    {/if}

    <p class="where">Goes in <strong>{where}</strong> as a <code>{info.ext}</code></p>
  </form>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>Cancel</button>
    <button class="btn primary" type="submit" form="new-doc" disabled={!name.trim() || (kind === 'lpx' && !sizeOk)}>Create</button>
  {/snippet}
</Dialog>

<style>
  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field {
    margin-top: 14px;
  }
  label span,
  .field > span {
    color: var(--dim);
    font-size: 12px;
  }
  .sizes {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .seg button {
    padding: 0 8px;
  }
  .num {
    width: 64px;
  }
  .x {
    color: var(--dim);
  }
  .palettes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  select {
    color: var(--ink);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .swatches span {
    width: 16px;
    height: 16px;
    border: 1px solid var(--faint);
    border-radius: 3px;
  }
  .where {
    margin: 14px 0 0;
    color: var(--dim);
  }
  .where strong {
    color: var(--ink);
    font-weight: 500;
  }
  code {
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
