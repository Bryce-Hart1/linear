<!--
  The export popup every editor shares: the file type, a light or dark page
  (or a transparent one, where the type can have it), grid marks or not, and
  the few things only one kind has (a pixel scale, a drawing's area). It is
  always available, whatever is on the page. Saving the document itself
  (.lin, .lpx, .ldw) has no page, so those options step aside for it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { rememberChoice, recallChoice, GRID_INK, PAPER, type Backdrop, type ExportChoice, type ExportFormat } from '../../lib/export-look';
  import Dialog from '../ui/Dialog.svelte';

  let {
    kind,
    formats,
    fallback,
    scales,
    gridFrom = 1,
    area = false,
    clear = false,
    size,
    onclose,
    onexport,
  }: {
    /** Names the kind of document, so the last choice is remembered per kind. */
    kind: string;
    formats: ExportFormat[];
    /** What to start from when nothing was remembered. */
    fallback: Partial<ExportChoice>;
    /** Pixel art: the sizes on offer. */
    scales?: number[];
    /** The smallest scale at which grid marks still leave the picture readable. */
    gridFrom?: number;
    /** Drawings: ask whether to export the drawn area or the whole page. */
    area?: boolean;
    /** Whether a transparent page is on offer at all. */
    clear?: boolean;
    /** The picture's size in its own units, for the size readout at each scale. */
    size?: { w: number; h: number };
    onclose: () => void;
    onexport: (choice: ExportChoice) => void;
  } = $props();

  const start = untrack(() => {
    const mine: ExportChoice = { format: formats[0].id, backdrop: 'light', grid: false, scale: 8, whole: false, ...fallback, ...recallChoice(kind) };
    if (!formats.some((f) => f.id === mine.format)) mine.format = formats[0].id;
    if (scales && !scales.includes(mine.scale)) mine.scale = scales.reduce((a, b) => (Math.abs(b - mine.scale) < Math.abs(a - mine.scale) ? b : a));
    return mine;
  });

  let format = $state(start.format);
  let backdrop = $state<Backdrop>(start.backdrop);
  let grid = $state(start.grid);
  let scale = $state(start.scale);
  let whole = $state(start.whole);

  const current = $derived(formats.find((f) => f.id === format)!);
  const styled = $derived(current.styled);
  const canClear = $derived(clear && (current.clear ?? true));
  // A transparent page the format can't have falls back to the light one.
  const page = $derived<Backdrop>(backdrop === 'none' && !canClear ? 'light' : backdrop);
  const gridOk = $derived(scale >= gridFrom || !scales);
  const looks: { id: Backdrop; label: string }[] = $derived([
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    ...(canClear ? [{ id: 'none' as Backdrop, label: 'Transparent' }] : []),
  ]);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const choice: ExportChoice = { format, backdrop: page, grid: grid && gridOk, scale, whole };
    rememberChoice(kind, { ...choice, grid, backdrop });
    onexport(choice);
  }
</script>

<Dialog title="Export" {onclose} width={440}>
  <form id="export" onsubmit={submit}>
    <div class="field">
      <span class="label" id="x-type">File type</span>
      <div class="seg" role="group" aria-labelledby="x-type">
        {#each formats as f (f.id)}
          <button type="button" aria-pressed={format === f.id} onclick={() => (format = f.id)}>{f.label}</button>
        {/each}
      </div>
    </div>

    {#if styled}
      <div class="field">
        <span class="label" id="x-look">Page</span>
        <div class="seg" role="group" aria-labelledby="x-look">
          {#each looks as l (l.id)}
            <button type="button" aria-pressed={page === l.id} onclick={() => (backdrop = l.id)}>{l.label}</button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="label" id="x-grid">Grid marks</span>
        <div class="seg" role="group" aria-labelledby="x-grid">
          <button type="button" aria-pressed={!(grid && gridOk)} onclick={() => (grid = false)}>Without</button>
          <button type="button" aria-pressed={grid && gridOk} disabled={!gridOk} onclick={() => (grid = true)}>With</button>
        </div>
        {#if !gridOk}<span class="hint">Grid marks need {gridFrom}× or bigger.</span>{/if}
      </div>

      {#if scales}
        <div class="field">
          <span class="label" id="x-scale">Size</span>
          <div class="seg" role="group" aria-labelledby="x-scale">
            {#each scales as s (s)}
              <button type="button" aria-pressed={scale === s} onclick={() => (scale = s)}>{s}×</button>
            {/each}
          </div>
          {#if size}<span class="hint">{size.w * scale} × {size.h * scale} pixels</span>{/if}
        </div>
      {/if}

      {#if area}
        <div class="field">
          <span class="label" id="x-area">Area</span>
          <div class="seg" role="group" aria-labelledby="x-area">
            <button type="button" aria-pressed={!whole} onclick={() => (whole = false)}>What’s drawn</button>
            <button type="button" aria-pressed={whole} onclick={() => (whole = true)}>Whole page</button>
          </div>
        </div>
      {/if}

      <div class="sample" style:background={page === 'none' ? undefined : PAPER[page]} class:clear={page === 'none'} aria-hidden="true">
        {#if grid && gridOk}
          <span class="dots" style:--dot={GRID_INK[page]}></span>
        {/if}
        <svg viewBox="0 0 120 56" width="120" height="56">
          <rect x="14" y="14" width="40" height="28" rx="3" fill="none" stroke={page === 'dark' ? '#ffffff' : '#111111'} stroke-width="2" />
          <path d="M54 28 H96" stroke={page === 'dark' ? '#ffffff' : '#111111'} stroke-width="2" fill="none" />
          <path d="M90 22 L98 28 L90 34 Z" fill={page === 'dark' ? '#ffffff' : '#111111'} />
        </svg>
      </div>
    {:else}
      <p class="note">This saves the document itself, so it opens in {current.label} again, with nothing about the page or grid.</p>
    {/if}
  </form>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>Cancel</button>
    <button class="btn primary" type="submit" form="export">Export {current.label}…</button>
  {/snippet}
</Dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .label {
    flex: 0 0 76px;
    color: var(--dim);
    font-size: 12px;
  }
  .seg {
    flex-wrap: wrap;
  }
  .seg button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .hint,
  .note {
    margin: 0;
    color: var(--dim);
    font-size: 12px;
  }
  .note {
    padding: 8px 0 4px;
  }
  .sample {
    position: relative;
    display: grid;
    place-items: center;
    height: 80px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .sample.clear {
    background:
      conic-gradient(#d9d9d9 25%, #ffffff 0 50%, #d9d9d9 0 75%, #ffffff 0) 0 0 / 14px 14px;
  }
  .dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, var(--dot) 1px, transparent 1.5px);
    background-size: 10px 10px;
  }
  svg {
    position: relative;
  }
</style>
