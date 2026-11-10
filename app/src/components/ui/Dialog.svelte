<!--
  A modal dialog: a title, its content, and a row of buttons. Escape or a
  click outside closes it. Built on <dialog>, which keeps focus inside.
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { onMount, type Snippet } from 'svelte';

  let {
    title,
    onclose,
    children,
    actions,
    width = 420,
  }: { title: string; onclose: () => void; children: Snippet; actions?: Snippet; width?: number } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  onMount(() => dialog?.showModal());

  function onclick(e: MouseEvent) {
    if (e.target === dialog) dialog?.close();
  }
</script>

<dialog bind:this={dialog} {onclick} {onclose} style:width="min({width}px, calc(100vw - 32px))" aria-label={title}>
  <header>
    <h2>{title}</h2>
    <button class="icon-btn" title="Close" onclick={() => dialog?.close()}><X size={16} /></button>
  </header>
  <div class="body">{@render children()}</div>
  {#if actions}<footer>{@render actions()}</footer>{/if}
</dialog>

<style>
  dialog {
    padding: 0;
    border: 1px solid var(--faint);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.28);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 4px 20px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
  }
  .body {
    padding: 8px 20px 4px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px 18px;
  }
</style>
