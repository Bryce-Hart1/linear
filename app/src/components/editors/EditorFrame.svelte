<!--
  What every editor sits in: a top bar (back to the library, the document's
  name, which a click renames, an unsaved dot, then the editor's own
  controls), the canvas area, and a status bar. The .lin editor uses it now;
  the pixel and drawing editors will too (M4, M5).
-->
<script lang="ts">
  import { ChevronLeft } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import InlineEdit from '../ui/InlineEdit.svelte';

  let {
    name,
    ext,
    dirty,
    onback,
    onrename,
    actions,
    children,
    status,
    banner,
  }: {
    name: string;
    ext: string;
    dirty: boolean;
    onback: () => void;
    onrename: (name: string) => Promise<boolean>;
    actions?: Snippet;
    children: Snippet;
    status?: Snippet;
    banner?: Snippet;
  } = $props();

  let renaming = $state(false);

  async function rename(next: string): Promise<boolean> {
    const ok = await onrename(next);
    if (ok) renaming = false;
    return ok;
  }
</script>

<div class="frame">
  <header class="topbar" data-tauri-drag-region>
    <button class="btn back" title="Back to the library (⌘W)" onclick={onback}><ChevronLeft size={16} /> Library</button>
    <div class="title" data-tauri-drag-region>
      {#if renaming}
        <InlineEdit value={name} label="Document name" oncommit={rename} oncancel={() => (renaming = false)} />
      {:else}
        <button class="name" title="Rename" onclick={() => (renaming = true)}>{name}</button>
        <span class="ext">{ext}</span>
        {#if dirty}<span class="dot" title="Unsaved changes">●</span>{/if}
      {/if}
    </div>
    <div class="actions">{@render actions?.()}</div>
  </header>
  {#if banner}{@render banner()}{/if}
  <div class="stage">{@render children()}</div>
  {#if status}<footer class="status">{@render status()}</footer>{/if}
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    flex: none;
    padding: 0 10px 0 12px;
    border-bottom: 1px solid var(--faint);
  }
  :global(.app.closed) .topbar {
    padding-left: calc(12px + var(--lights));
  }
  .back {
    flex: none;
    height: 28px;
    padding: 0 10px 0 6px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 120px;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    padding: 2px 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: text;
  }
  .name:hover {
    background: var(--hover);
  }
  .ext {
    flex: none;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 12px;
  }
  .dot {
    flex: none;
    margin-left: 4px;
    color: var(--accent);
    font-size: 11px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .status {
    flex: none;
    border-top: 1px solid var(--faint);
    background: var(--sidebar);
  }
</style>
