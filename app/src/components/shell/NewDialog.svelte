<!--
  Names a new document before it's made. Pixel art and drawings will ask for
  their size here too, once they exist (M4, M5).
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Dialog from '../ui/Dialog.svelte';
  import { kindInfo } from '../../lib/kinds';
  import type { Kind } from '../../lib/types';

  let { kind, where, onclose, oncreate }: { kind: Kind; where: string; onclose: () => void; oncreate: (name: string) => void } =
    $props();
  const info = $derived(kindInfo(kind));
  let name = $state(untrack(() => `Untitled ${kindInfo(kind).label.toLowerCase()}`));
  let input: HTMLInputElement | undefined = $state();

  onMount(() => {
    input?.focus();
    input?.select();
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (name.trim()) oncreate(name);
  }
</script>

<Dialog title="New {info.label.toLowerCase()}" {onclose}>
  <form id="new-doc" onsubmit={submit}>
    <label>
      <span>Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:this={input} bind:value={name} spellcheck="false" autofocus />
    </label>
    <p class="where">Goes in <strong>{where}</strong> as a <code>{info.ext}</code></p>
  </form>
  {#snippet actions()}
    <button class="btn" type="button" onclick={onclose}>Cancel</button>
    <button class="btn primary" type="submit" form="new-doc" disabled={!name.trim()}>Create</button>
  {/snippet}
</Dialog>

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  label span {
    color: var(--dim);
    font-size: 12px;
  }
  .where {
    margin: 10px 0 0;
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
