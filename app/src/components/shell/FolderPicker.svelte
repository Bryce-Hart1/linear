<!--
  Picks a folder to move something into: the top level, or any folder that
  isn't excluded (a folder can't go inside itself).
-->
<script lang="ts">
  import { Folder as FolderIcon, Home } from '@lucide/svelte';
  import Dialog from '../ui/Dialog.svelte';
  import { folderTree } from '../../lib/folder-tree';
  import type { Folder } from '../../lib/types';

  let {
    title,
    folders,
    current,
    exclude = [],
    onclose,
    onpick,
  }: {
    title: string;
    folders: Folder[];
    current: number | null;
    exclude?: number[];
    onclose: () => void;
    onpick: (folder: number | null) => void;
  } = $props();

  const rows = $derived(folderTree(folders).filter((r) => !exclude.includes(r.folder.id)));
  let choice = $state<number | null>(null);
</script>

<Dialog {title} {onclose} width={380}>
  <div class="list" role="listbox" aria-label="Folders">
    <button role="option" aria-selected={choice === null} class:here={current === null} onclick={() => (choice = null)} ondblclick={() => onpick(null)}>
      <Home size={15} /><span>Top level</span>
      {#if current === null}<em>here now</em>{/if}
    </button>
    {#each rows as r (r.folder.id)}
      <button
        role="option"
        aria-selected={choice === r.folder.id}
        style:padding-left="{10 + r.depth * 16}px"
        onclick={() => (choice = r.folder.id)}
        ondblclick={() => onpick(r.folder.id)}
      >
        <FolderIcon size={15} /><span>{r.folder.name}</span>
        {#if current === r.folder.id}<em>here now</em>{/if}
      </button>
    {/each}
  </div>
  {#snippet actions()}
    <button class="btn" onclick={onclose}>Cancel</button>
    <button class="btn primary" disabled={choice === current} onclick={() => onpick(choice)}>Move</button>
  {/snippet}
</Dialog>

<style>
  .list {
    display: flex;
    flex-direction: column;
    max-height: 300px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--faint);
    border-radius: var(--radius);
    background: var(--bg);
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    background: var(--hover);
  }
  button[aria-selected='true'] {
    background: var(--accent);
    color: var(--accent-ink);
  }
  span {
    flex: 1;
  }
  em {
    color: inherit;
    opacity: 0.6;
    font-size: 12px;
    font-style: normal;
  }
</style>
