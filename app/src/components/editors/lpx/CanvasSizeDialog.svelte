<!--
  A new canvas size, and where the picture sits in it: the anchor is the edge
  or corner that stays put, so growing adds space on the other sides and
  shrinking crops them.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { MAX_SIDE } from '../../../lib/lpx/model';
  import Dialog from '../../ui/Dialog.svelte';

  let { w, h, onclose, onresize }: { w: number; h: number; onclose: () => void; onresize: (w: number, h: number, ax: number, ay: number) => void } =
    $props();

  let nw = $state(untrack(() => w));
  let nh = $state(untrack(() => h));
  let ax = $state(0.5);
  let ay = $state(0.5);
  const valid = $derived([nw, nh].every((v) => Number.isInteger(v) && v >= 1 && v <= MAX_SIDE) && (nw !== w || nh !== h));
  const STOPS = [0, 0.5, 1];

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (valid) onresize(nw, nh, ax, ay);
  }
</script>

<Dialog title="Canvas size" {onclose} width={380}>
  <form id="canvas-size" onsubmit={submit}>
    <div class="sizes">
      <label><span>Width</span><input class="input" type="number" min="1" max={MAX_SIDE} bind:value={nw} /></label>
      <span class="x">×</span>
      <label><span>Height</span><input class="input" type="number" min="1" max={MAX_SIDE} bind:value={nh} /></label>
    </div>
    <div class="anchor-row">
      <span class="label">Anchor</span>
      <div class="anchor" role="group" aria-label="Anchor">
        {#each STOPS as y (y)}
          {#each STOPS as x (x)}
            <button type="button" aria-pressed={ax === x && ay === y} aria-label="Anchor {x},{y}" onclick={() => ((ax = x), (ay = y))}></button>
          {/each}
        {/each}
      </div>
      <p>Now {w} × {h}. Pixels outside the new size are cut off; new space is transparent.</p>
    </div>
  </form>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>Cancel</button>
    <button class="btn primary" type="submit" form="canvas-size" disabled={!valid}>Resize</button>
  {/snippet}
</Dialog>

<style>
  .sizes {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
  }
  label span,
  .label {
    color: var(--dim);
    font-size: 12px;
  }
  .x {
    padding-bottom: 7px;
    color: var(--dim);
  }
  .anchor-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin-top: 14px;
  }
  .label {
    grid-column: 1 / -1;
  }
  .anchor {
    display: grid;
    grid-template-columns: repeat(3, 22px);
    gap: 3px;
  }
  .anchor button {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--faint);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
  }
  .anchor button[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--accent);
  }
  p {
    margin: 0;
    color: var(--dim);
    font-size: 12px;
  }
</style>
