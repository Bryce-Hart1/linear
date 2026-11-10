<!--
  The library's sidebar: New, search, the library's views, the folder tree,
  and settings. Folders take documents dragged onto them, and right-click
  for New folder, Rename, Move and Delete.
-->
<script lang="ts">
  import { ChevronDown, Clock, Files, Folder as FolderIcon, FolderInput, FolderPlus, Keyboard, Pencil, Pin, Plus, Search, Settings, Trash } from '@lucide/svelte';
  import { folderTree } from '../../lib/folder-tree';
  import { KINDS } from '../../lib/kinds';
  import { library } from '../../lib/library.svelte';
  import type { Folder, Kind, View } from '../../lib/types';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import InlineEdit from '../ui/InlineEdit.svelte';
  import type { MenuItem } from '../ui/menu';
  import Confirm from './Confirm.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let {
    onnew,
    onsettings,
    onkeytest,
  }: { onnew: (kind: Kind) => void; onsettings: () => void; onkeytest?: () => void } = $props();

  const VIEWS: { view: Exclude<View, 'folder'>; label: string; icon: typeof Clock }[] = [
    { view: 'recent', label: 'Recent', icon: Clock },
    { view: 'pinned', label: 'Pinned', icon: Pin },
    { view: 'all', label: 'All documents', icon: Files },
    { view: 'trash', label: 'Trash', icon: Trash },
  ];

  const rows = $derived(folderTree(library.folders));

  let newOpen = $state(false);
  let newWrap: HTMLElement | undefined = $state();
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** A folder being made: inside which folder. */
  let making = $state<{ parent: number | null } | null>(null);
  let renaming = $state<number | null>(null);
  let moving = $state<Folder | null>(null);
  let deleting = $state<Folder | null>(null);
  let dropOn = $state<number | null>(null);

  function pick(kind: Kind) {
    newOpen = false;
    onnew(kind);
  }

  function onpointerdown(e: PointerEvent) {
    if (newOpen && newWrap && !newWrap.contains(e.target as Node)) newOpen = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (newOpen && e.key === 'Escape') newOpen = false;
  }

  function subtree(id: number): number[] {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const f of library.folders) if (f.parentId === out[i]) out.push(f.id);
    return out;
  }

  function folderMenu(e: MouseEvent, f: Folder) {
    e.preventDefault();
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New folder inside', icon: FolderPlus, run: () => (making = { parent: f.id }) },
        { label: 'Rename', icon: Pencil, run: () => (renaming = f.id) },
        { label: 'Move to…', icon: FolderInput, run: () => (moving = f) },
        { separator: true },
        { label: 'Delete folder…', icon: Trash, danger: true, run: () => (deleting = f) },
      ],
    };
  }

  async function make(name: string): Promise<boolean> {
    const parent = making?.parent ?? null;
    const f = await library.createFolder(parent, name);
    if (!f) return false;
    making = null;
    library.go({ view: 'folder', folder: f.id });
    return true;
  }

  async function rename(f: Folder, name: string): Promise<boolean> {
    const ok = await library.renameFolder(f, name);
    if (ok) renaming = null;
    return ok;
  }

  const DOC_TYPE = 'application/x-linear-doc';

  function ondragover(e: DragEvent, folder: number) {
    if (!e.dataTransfer?.types.includes(DOC_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dropOn = folder;
  }

  function ondrop(e: DragEvent, folder: number) {
    dropOn = null;
    const id = Number(e.dataTransfer?.getData(DOC_TYPE));
    const doc = library.docs.find((d) => d.id === id);
    if (!doc) return;
    e.preventDefault();
    library.moveTo(doc, folder);
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<aside class="sidebar">
  <div class="lights" data-tauri-drag-region></div>

  <div class="new" bind:this={newWrap}>
    <button class="btn primary wide" aria-haspopup="menu" aria-expanded={newOpen} onclick={() => (newOpen = !newOpen)}>
      <Plus size={16} strokeWidth={2.4} />
      <span>New</span>
      <ChevronDown size={14} />
    </button>
    {#if newOpen}
      <div class="menu" role="menu">
        {#each KINDS as k (k.kind)}
          <button class="menu-item" role="menuitem" disabled={!k.blank} onclick={() => pick(k.kind)}>
            <span class="glyph"><k.icon size={18} /></span>
            <span class="text">
              <span class="label">{k.label} <span class="ext">{k.ext}</span></span>
              <span class="blurb">{k.blank ? k.blurb : `Coming in ${k.comingIn}`}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <label class="search">
    <Search size={14} />
    <input type="search" placeholder="Search" bind:value={library.search} spellcheck="false" />
  </label>

  <nav>
    {#each VIEWS as v (v.view)}
      <button
        class="row"
        aria-current={library.place.view === v.view ? 'page' : undefined}
        onclick={() => library.go({ view: v.view, folder: null })}
      >
        <v.icon size={16} />
        <span>{v.label}</span>
      </button>
    {/each}
  </nav>

  <div class="section">
    <span>Folders</span>
    <button class="icon-btn" title="New folder" onclick={() => (making = { parent: null })}><FolderPlus size={15} /></button>
  </div>

  <div class="folders">
    {#if making && making.parent === null}
      <div class="row editing"><FolderIcon size={16} /><InlineEdit value="New folder" label="Folder name" oncommit={make} oncancel={() => (making = null)} /></div>
    {/if}
    {#each rows as r (r.folder.id)}
      {#if renaming === r.folder.id}
        <div class="row editing" style:padding-left="{8 + r.depth * 14}px">
          <FolderIcon size={16} />
          <InlineEdit value={r.folder.name} label="Folder name" oncommit={(n) => rename(r.folder, n)} oncancel={() => (renaming = null)} />
        </div>
      {:else}
        <button
          class="row"
          class:drop={dropOn === r.folder.id}
          style:padding-left="{8 + r.depth * 14}px"
          aria-current={library.place.view === 'folder' && library.place.folder === r.folder.id ? 'page' : undefined}
          onclick={() => library.go({ view: 'folder', folder: r.folder.id })}
          ondblclick={() => (renaming = r.folder.id)}
          oncontextmenu={(e) => folderMenu(e, r.folder)}
          ondragover={(e) => ondragover(e, r.folder.id)}
          ondragleave={() => (dropOn = null)}
          ondrop={(e) => ondrop(e, r.folder.id)}
        >
          <FolderIcon size={16} />
          <span>{r.folder.name}</span>
        </button>
      {/if}
      {#if making && making.parent === r.folder.id}
        <div class="row editing" style:padding-left="{8 + (r.depth + 1) * 14}px">
          <FolderIcon size={16} /><InlineEdit value="New folder" label="Folder name" oncommit={make} oncancel={() => (making = null)} />
        </div>
      {/if}
    {:else}
      {#if !making}<p class="none">No folders yet</p>{/if}
    {/each}
  </div>

  <div class="grow" data-tauri-drag-region></div>

  <footer>
    {#if onkeytest}
      <button class="row" onclick={onkeytest}><Keyboard size={16} /><span>Key test</span></button>
    {/if}
    <button class="row" onclick={onsettings}><Settings size={16} /><span>Settings</span></button>
  </footer>
</aside>

{#if menu}
  <ContextMenu {...menu} onclose={() => (menu = null)} />
{/if}
{#if moving}
  {@const f = moving}
  <FolderPicker
    title="Move “{f.name}” to"
    folders={library.folders}
    current={f.parentId}
    exclude={subtree(f.id)}
    onclose={() => (moving = null)}
    onpick={(to) => {
      library.moveFolder(f, to);
      moving = null;
    }}
  />
{/if}
{#if deleting}
  {@const f = deleting}
  <Confirm
    title="Delete “{f.name}”?"
    message="The folder and the folders inside it are deleted. Their documents aren't: they move up a level."
    confirm="Delete folder"
    danger
    onclose={() => (deleting = null)}
    onconfirm={() => library.deleteFolder(f)}
  />
{/if}

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0 10px 10px;
    background: var(--sidebar);
    border-right: 1px solid var(--faint);
  }
  .lights {
    flex: none;
    height: 44px;
  }
  .new {
    position: relative;
    margin-bottom: 10px;
  }
  .wide {
    width: 100%;
    height: 32px;
  }
  .wide span {
    flex: 1;
    text-align: left;
  }
  .menu {
    position: absolute;
    z-index: 10;
    top: calc(100% + 6px);
    left: 0;
    width: 280px;
    padding: 6px;
    border: 1px solid var(--faint);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .menu-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .menu-item:hover:not(:disabled),
  .menu-item:focus-visible {
    background: var(--hover);
    outline: none;
  }
  .menu-item:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: var(--radius);
    background: color-mix(in srgb, currentColor 13%, transparent);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .label {
    font-weight: 600;
  }
  .ext {
    color: var(--dim);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 400;
  }
  .blurb {
    color: var(--dim);
    font-size: 12px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin-bottom: 12px;
    padding: 0 8px;
    border-radius: var(--radius);
    background: var(--press);
    color: var(--dim);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
  }
  nav,
  footer,
  .folders {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .folders {
    min-height: 0;
    overflow: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    flex: none;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--dim);
    text-align: left;
    cursor: pointer;
  }
  .row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .row[aria-current='page'] {
    background: var(--press);
    color: var(--ink);
    font-weight: 500;
  }
  .row.drop {
    background: var(--accent-soft);
    color: var(--ink);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .row.editing {
    cursor: default;
    color: var(--ink);
  }
  .row.editing:hover {
    background: transparent;
  }
  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 18px 0 2px 8px;
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .none {
    margin: 4px 8px;
    color: var(--dim);
    font-size: 12px;
  }
  .grow {
    flex: 1;
    min-height: 12px;
  }
</style>
