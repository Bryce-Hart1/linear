<!--
  The library's sidebar: New, search, the library's views, folders, and
  settings. The views and folders fill in with the library itself (M1); for
  now they show where things will be.
-->
<script lang="ts">
  import { ChevronDown, Clock, Files, FolderPlus, Keyboard, Pin, Plus, Search, Settings, Trash } from '@lucide/svelte';
  import { KINDS } from '../../lib/kinds';
  import type { Kind } from '../../lib/types';

  let {
    onnew,
    onsettings,
    onkeytest,
  }: { onnew: (kind: Kind) => void; onsettings: () => void; onkeytest?: () => void } = $props();

  const VIEWS = [
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'pinned', label: 'Pinned', icon: Pin },
    { id: 'all', label: 'All documents', icon: Files },
    { id: 'trash', label: 'Trash', icon: Trash },
  ];

  let current = $state('all');
  let query = $state('');
  let menuOpen = $state(false);
  let newWrap: HTMLElement | undefined = $state();

  function pick(kind: Kind) {
    menuOpen = false;
    onnew(kind);
  }

  function onpointerdown(e: PointerEvent) {
    if (menuOpen && newWrap && !newWrap.contains(e.target as Node)) menuOpen = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (menuOpen && e.key === 'Escape') menuOpen = false;
  }
</script>

<svelte:window {onpointerdown} {onkeydown} />

<aside class="sidebar">
  <div class="lights" data-tauri-drag-region></div>

  <div class="new" bind:this={newWrap}>
    <button class="btn primary wide" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
      <Plus size={16} strokeWidth={2.4} />
      <span>New</span>
      <ChevronDown size={14} />
    </button>
    {#if menuOpen}
      <div class="menu" role="menu">
        {#each KINDS as k (k.kind)}
          <button class="menu-item" role="menuitem" onclick={() => pick(k.kind)}>
            <span class="glyph" style:color={k.tint}><k.icon size={18} /></span>
            <span class="text">
              <span class="label">{k.label} <span class="ext">{k.ext}</span></span>
              <span class="blurb">{k.blurb}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <label class="search">
    <Search size={14} />
    <input type="search" placeholder="Search" bind:value={query} spellcheck="false" />
  </label>

  <nav>
    {#each VIEWS as v (v.id)}
      <button class="row" aria-current={current === v.id ? 'page' : undefined} onclick={() => (current = v.id)}>
        <v.icon size={16} />
        <span>{v.label}</span>
      </button>
    {/each}
  </nav>

  <div class="section">
    <span>Folders</span>
    <button class="icon-btn" title="New folder" disabled><FolderPlus size={15} /></button>
  </div>
  <p class="none">No folders yet</p>

  <div class="grow" data-tauri-drag-region></div>

  <footer>
    {#if onkeytest}
      <button class="row" onclick={onkeytest}><Keyboard size={16} /><span>Key test</span></button>
    {/if}
    <button class="row" onclick={onsettings}><Settings size={16} /><span>Settings</span></button>
  </footer>
</aside>

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
  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--hover);
    outline: none;
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
  footer {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--dim);
    text-align: left;
    cursor: pointer;
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
  }
</style>
