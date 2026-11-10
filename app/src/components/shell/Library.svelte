<!--
  The library's main area: a toolbar (kind filter, sort, Empty Trash), then
  the documents here as a grid of cards or a list. Click selects, double-click
  or Enter opens, right-click shows everything else you can do to a document,
  and cards drag onto the sidebar's folders.
-->
<script lang="ts">
  import { ArchiveRestore, Copy, History, FileOutput, FolderInput, FolderOpen, Pencil, Pin, PinOff, Trash, Trash2 } from '@lucide/svelte';
  import { api } from '../../lib/api';
  import { dragging } from '../../lib/drag';
  import { folderPath } from '../../lib/folder-tree';
  import { KINDS, kindInfo } from '../../lib/kinds';
  import { library } from '../../lib/library.svelte';
  import { prefs } from '../../lib/prefs.svelte';
  import { ago } from '../../lib/time';
  import type { DocMeta, Kind, Sort } from '../../lib/types';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import InlineEdit from '../ui/InlineEdit.svelte';
  import type { MenuItem } from '../ui/menu';
  import Confirm from './Confirm.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let {
    onopen,
    onnew,
    onversions,
  }: { onopen: (doc: DocMeta) => void; onnew: (kind: Kind) => void; onversions: (doc: DocMeta) => void } = $props();

  const p = $derived(prefs.value!);
  const view = $derived(library.place.view);
  const inTrash = $derived(view === 'trash');
  const showWhere = $derived(view !== 'folder');

  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let renaming = $state<number | null>(null);
  let moving = $state<DocMeta | null>(null);
  let confirm = $state<{ title: string; message: string; confirm: string; run: () => void } | null>(null);
  let list: HTMLElement | undefined = $state();

  const SORTS: [Sort, string][] = [
    ['updated', 'Last edited'],
    ['created', 'Date made'],
    ['name', 'Name'],
  ];

  function when(d: DocMeta): string {
    if (view === 'trash' && d.trashedAt) return `deleted ${ago(d.trashedAt)}`;
    if (view === 'recent' && d.openedAt) return `opened ${ago(d.openedAt)}`;
    if (p.library.sort === 'created') return `made ${ago(d.createdAt)}`;
    return `edited ${ago(d.updatedAt)}`;
  }

  function where(d: DocMeta): string {
    return d.folderId === null ? '' : folderPath(library.folders, d.folderId);
  }

  function select(d: DocMeta) {
    library.selected = d.id;
    list?.focus();
  }

  function docMenu(e: MouseEvent, d: DocMeta) {
    e.preventDefault();
    select(d);
    const items: MenuItem[] = inTrash
      ? [
          { label: 'Put back', icon: ArchiveRestore, run: () => library.restore(d) },
          { separator: true },
          {
            label: 'Delete forever…',
            icon: Trash2,
            danger: true,
            run: () =>
              (confirm = {
                title: `Delete “${d.name}” forever?`,
                message: 'It and every earlier version of it are deleted. This can’t be undone.',
                confirm: 'Delete forever',
                run: () => library.deleteForever(d),
              }),
          },
        ]
      : [
          { label: 'Open', icon: FolderOpen, run: () => onopen(d) },
          { label: 'Rename', icon: Pencil, run: () => (renaming = d.id) },
          { label: 'Duplicate', icon: Copy, hint: '⌘D', run: () => library.duplicate(d) },
          d.pinned
            ? { label: 'Unpin', icon: PinOff, run: () => library.setPinned(d, false) }
            : { label: 'Pin', icon: Pin, run: () => library.setPinned(d, true) },
          { label: 'Move to…', icon: FolderInput, run: () => (moving = d) },
          { label: 'Versions…', icon: History, run: () => onversions(d) },
          { label: 'Export file…', icon: FileOutput, hint: '⌘E', run: () => library.exportFile(d) },
          { separator: true },
          { label: 'Move to Trash', icon: Trash, danger: true, run: () => library.trash(d) },
        ];
    menu = { x: e.clientX, y: e.clientY, items };
  }

  function emptyTrash() {
    confirm = {
      title: 'Empty the Trash?',
      message: `${library.docs.length === 1 ? 'The document' : `All ${library.docs.length} documents`} in the Trash, and every earlier version, are deleted. This can’t be undone.`,
      confirm: 'Empty Trash',
      run: () => library.emptyTrash(),
    };
  }

  async function rename(d: DocMeta, name: string): Promise<boolean> {
    const ok = await library.rename(d, name);
    if (ok) {
      renaming = null;
      list?.focus();
    }
    return ok;
  }

  function onkeydown(e: KeyboardEvent) {
    if (renaming !== null || e.metaKey || e.ctrlKey || e.altKey) return;
    const docs = library.docs;
    const i = docs.findIndex((d) => d.id === library.selected);
    const doc = i >= 0 ? docs[i] : undefined;
    switch (e.key) {
      case 'Enter':
        if (doc && !inTrash) onopen(doc);
        break;
      case 'Backspace':
      case 'Delete':
        if (doc && !inTrash) library.trash(doc);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        if (docs.length) library.selected = docs[Math.min(docs.length - 1, i + 1)].id;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        if (docs.length) library.selected = docs[Math.max(0, i - 1)].id;
        break;
      case 'Escape':
        library.selected = null;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // Keep the selected document in sight as the arrow keys move it.
  $effect(() => {
    const id = library.selected;
    if (id !== null) list?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  function ondragstart(e: DragEvent, d: DocMeta) {
    if (inTrash || !e.dataTransfer) return e.preventDefault();
    e.dataTransfer.setData('application/x-linear-doc', String(d.id));
    e.dataTransfer.effectAllowed = 'move';
    dragging.active = true;
  }
</script>

<div class="toolbar">
  <div class="seg" role="group" aria-label="Show">
    <button aria-pressed={p.library.kind === null} onclick={() => prefs.set('library.kind', null)}>All</button>
    {#each KINDS as k (k.kind)}
      <button aria-pressed={p.library.kind === k.kind} onclick={() => prefs.set('library.kind', k.kind)}>{k.plural}</button>
    {/each}
  </div>
  <div class="spacer"></div>
  {#if library.loaded && library.docs.length}
    <span class="count">{library.docs.length} {library.docs.length === 1 ? 'document' : 'documents'}</span>
  {/if}
  {#if inTrash}
    <button class="btn" disabled={!library.docs.length} onclick={emptyTrash}>Empty Trash</button>
  {:else if view !== 'recent'}
    <label class="sort">
      <span>Sort by</span>
      <select value={p.library.sort} onchange={(e) => prefs.set('library.sort', e.currentTarget.value)}>
        {#each SORTS as [value, label] (value)}<option {value}>{label}</option>{/each}
      </select>
    </label>
  {/if}
</div>

<div
  class="library"
  role="listbox"
  aria-label={library.title}
  tabindex="0"
  bind:this={list}
  {onkeydown}
  onclick={(e) => e.target === e.currentTarget && (library.selected = null)}
>
  {#if !library.loaded}
    <!-- Nothing yet: avoids flashing an empty state before the first listing. -->
  {:else if library.docs.length === 0}
    <div class="empty">
      {#if library.search.trim()}
        <h2>Nothing called “{library.search.trim()}”</h2>
        <p>Search looks at document names{p.library.kind ? `, among ${kindInfo(p.library.kind).plural.toLowerCase()}` : ''}.</p>
      {:else if view === 'trash'}
        <h2>The Trash is empty</h2>
        <p>Documents you delete wait here until you empty it.</p>
      {:else if view === 'recent'}
        <h2>Nothing opened yet</h2>
        <p>Documents you open show up here, the latest first.</p>
      {:else if view === 'pinned'}
        <h2>Nothing pinned</h2>
        <p>Pin a document (right-click it) to keep it here.</p>
      {:else if p.library.kind}
        <h2>No {kindInfo(p.library.kind).plural.toLowerCase()} {view === 'folder' ? 'in this folder' : 'yet'}</h2>
        <button class="btn" onclick={() => prefs.set('library.kind', null)}>Show everything</button>
      {:else}
        <h2>{view === 'folder' ? 'This folder is empty' : 'Make something'}</h2>
        <p>{view === 'folder' ? 'New documents made here go in it.' : 'Everything you make is kept in your library, with its earlier versions.'}</p>
        <div class="kinds">
          {#each KINDS as k (k.kind)}
            <button class="kind" disabled={!k.blank} onclick={() => onnew(k.kind)}>
              <span class="glyph"><k.icon size={26} /></span>
              <span class="label">{k.label}</span>
              <span class="blurb">{k.blank ? k.blurb : `Coming in ${k.comingIn}`}</span>
              <span class="ext">{k.ext}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if p.library.view === 'grid'}
    <div class="grid">
      {#each library.docs as d (d.id)}
        {@const info = kindInfo(d.kind)}
        {@const url = api.thumbUrl(d)}
        <div
          class="card"
          data-id={d.id}
          role="option"
          tabindex="-1"
          aria-selected={library.selected === d.id}
          draggable={!inTrash && renaming !== d.id}
          onclick={() => select(d)}
          ondblclick={() => !inTrash && onopen(d)}
          oncontextmenu={(e) => docMenu(e, d)}
          ondragstart={(e) => ondragstart(e, d)}
          ondragend={() => (dragging.active = false)}
          onkeydown={() => {}}
        >
          <div class="thumb">
            {#if url}<img src={url} alt="" loading="lazy" draggable="false" />{:else}<info.icon size={34} strokeWidth={1.6} />{/if}
            {#if d.pinned}<span class="pin" title="Pinned"><Pin size={12} /></span>{/if}
          </div>
          <div class="name">
            {#if renaming === d.id}
              <InlineEdit value={d.name} oncommit={(n) => rename(d, n)} oncancel={() => (renaming = null)} />
            {:else}
              <span title={d.name}>{d.name}</span>
            {/if}
          </div>
          <div class="meta">
            <span>{info.label}</span>
            <span>·</span>
            <span>{when(d)}</span>
          </div>
          {#if showWhere && where(d)}<div class="meta where">{where(d)}</div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="rows">
      <div class="head" role="presentation">
        <span>Name</span><span>Kind</span>{#if showWhere}<span>Folder</span>{/if}<span>{inTrash ? 'Deleted' : view === 'recent' ? 'Opened' : p.library.sort === 'created' ? 'Made' : 'Edited'}</span>
      </div>
      {#each library.docs as d (d.id)}
        {@const info = kindInfo(d.kind)}
        <div
          class="line"
          class:where={showWhere}
          data-id={d.id}
          role="option"
          tabindex="-1"
          aria-selected={library.selected === d.id}
          draggable={!inTrash && renaming !== d.id}
          onclick={() => select(d)}
          ondblclick={() => !inTrash && onopen(d)}
          oncontextmenu={(e) => docMenu(e, d)}
          ondragstart={(e) => ondragstart(e, d)}
          ondragend={() => (dragging.active = false)}
          onkeydown={() => {}}
        >
          <span class="cell name">
            <span class="icon"><info.icon size={16} /></span>
            {#if renaming === d.id}
              <InlineEdit value={d.name} oncommit={(n) => rename(d, n)} oncancel={() => (renaming = null)} />
            {:else}
              <span class="text" title={d.name}>{d.name}</span>
              {#if d.pinned}<Pin size={12} class="pinned" />{/if}
            {/if}
          </span>
          <span class="cell dim">{info.label}</span>
          {#if showWhere}<span class="cell dim">{where(d) || '—'}</span>{/if}
          <span class="cell dim">{when(d).replace(/^\w+ /, '')}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if menu}
  <ContextMenu {...menu} onclose={() => (menu = null)} />
{/if}
{#if moving}
  {@const d = moving}
  <FolderPicker
    title="Move “{d.name}” to"
    folders={library.folders}
    current={d.folderId}
    onclose={() => (moving = null)}
    onpick={(to) => {
      library.moveTo(d, to);
      moving = null;
    }}
  />
{/if}
{#if confirm}
  {@const c = confirm}
  <Confirm title={c.title} message={c.message} confirm={c.confirm} danger onclose={() => (confirm = null)} onconfirm={c.run} />
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    height: 46px;
    padding: 0 16px;
  }
  .spacer {
    flex: 1;
  }
  .count {
    color: var(--dim);
    font-size: 12px;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
  }
  select {
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--faint);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }
  .library {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 16px 24px;
    outline: none;
  }

  /* ── Grid ── */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 18px 16px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 6px;
    border-radius: var(--radius-lg);
    cursor: default;
    outline: none;
  }
  .thumb {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    margin-bottom: 6px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: transparent;
    color: var(--dim);
  }
  .card:hover .thumb {
    color: var(--ink);
  }
  .card[aria-selected='true'] .thumb {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 3.5px var(--line);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: var(--paper);
  }
  .pin {
    position: absolute;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }
  .name {
    min-width: 0;
    padding: 0 2px;
    font-weight: 550;
  }
  .name span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card[aria-selected='true'] .name span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .meta {
    display: flex;
    gap: 4px;
    padding: 0 2px;
    overflow: hidden;
    color: var(--dim);
    font-size: 12px;
    white-space: nowrap;
  }
  .meta.where {
    text-overflow: ellipsis;
  }

  /* ── List ── */
  .rows {
    display: flex;
    flex-direction: column;
  }
  .head,
  .line {
    display: grid;
    grid-template-columns: minmax(0, 3fr) 110px 140px;
    align-items: center;
    gap: 12px;
    padding: 0 10px;
  }
  .rows:has(.line.where) .head,
  .line.where {
    grid-template-columns: minmax(0, 3fr) 110px minmax(0, 1.4fr) 140px;
  }
  .head {
    height: 30px;
    border-bottom: 1px solid var(--faint);
    color: var(--dim);
    font-size: 12px;
  }
  .line {
    height: 36px;
    border-radius: 7px;
    outline: none;
  }
  .line {
    border: 1px solid transparent;
  }
  .line[aria-selected='true'] {
    border-color: var(--line);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .line[aria-selected='true'] .dim,
  .line[aria-selected='true'] .icon {
    color: inherit;
  }
  .cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell.name {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0;
  }
  .cell.name .text {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    display: grid;
    flex: none;
    color: var(--dim);
  }
  .dim {
    color: var(--dim);
  }
  .rows :global(.pinned) {
    flex: none;
    opacity: 0.6;
  }

  /* ── Empty ── */
  .empty {
    max-width: 720px;
    margin: 0 auto;
    padding: 12vh 0 24px;
    text-align: center;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .empty p {
    margin: 0 0 24px;
    color: var(--dim);
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
  }
  .kind {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .kind:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .kind:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    margin-bottom: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .kind .label {
    font-size: 15px;
    font-weight: 600;
  }
  .kind .blurb {
    color: var(--dim);
  }
  .kind .ext {
    margin-top: 8px;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 11px;
  }
</style>
