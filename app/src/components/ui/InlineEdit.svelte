<!--
  A name edited where it's shown. Enter or clicking away keeps it, Escape
  puts it back. If keeping it fails (the name is taken), the field stays open
  so it can be fixed.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';

  let {
    value,
    oncommit,
    oncancel,
    label = 'Name',
  }: { value: string; oncommit: (name: string) => Promise<boolean> | boolean; oncancel: () => void; label?: string } = $props();
  // Starts from the name as it was; later changes to it don't overwrite what's being typed.
  let text = $state(untrack(() => value));
  let input: HTMLInputElement | undefined = $state();
  let busy = false;

  onMount(() => {
    input?.focus();
    input?.select();
  });

  async function commit() {
    if (busy) return;
    if (!text.trim()) return oncancel();
    busy = true;
    const ok = await oncommit(text);
    busy = false;
    if (!ok) input?.select();
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<input
  class="inline"
  aria-label={label}
  bind:this={input}
  bind:value={text}
  spellcheck="false"
  {onkeydown}
  onblur={commit}
  onclick={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
/>

<style>
  .inline {
    width: 100%;
    min-width: 0;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--bg);
    outline: none;
    font: inherit;
  }
</style>
