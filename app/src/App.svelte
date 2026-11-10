<!--
  The window: the sidebar, and either the library or an open document. The
  shell is the last stop for menu commands (menu-router.ts): it handles those
  that make sense here, such as new documents, import, the selected
  document's Duplicate/Delete/Export, theme, sidebar and settings.
-->
<script lang="ts">
  import { FileDown, LayoutGrid, List, PanelLeft } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import KeyTest from './components/dev/KeyTest.svelte';
  import LinEditor from './components/editors/LinEditor.svelte';
  import PixelEditor from './components/editors/PixelEditor.svelte';
  import DrawEditor from './components/editors/DrawEditor.svelte';
  import DocView from './components/shell/DocView.svelte';
  import Library from './components/shell/Library.svelte';
  import NewDialog from './components/shell/NewDialog.svelte';
  import Settings from './components/shell/Settings.svelte';
  import Versions from './components/shell/Versions.svelte';
  import ShortcutSheet from './components/shell/ShortcutSheet.svelte';
  import { LIBRARY_SHORTCUTS } from './lib/lin-ui/shortcuts';
  import Sidebar from './components/shell/Sidebar.svelte';
  import { api } from './lib/api';
  import { dragging } from './lib/drag';
  import { folderPath } from './lib/folder-tree';
  import { kindInfo, type NewOptions } from './lib/kinds';
  import { library } from './lib/library.svelte';
  import type { MenuId } from './lib/menu-ids';
  import { onMenu, route } from './lib/menu-router';
  import { notes } from './lib/notes.svelte';
  import { prefs } from './lib/prefs.svelte';
  import { applyTheme } from './lib/theme';
  import { errorMessage, type DocMeta, type Kind, type Opened } from './lib/types';

  const DEV = import.meta.env.DEV;

  let settingsOpen = $state(false);
  let keyTestOpen = $state(false);
  let sheetOpen = $state(false);
  let making = $state<Kind | null>(null);
  let opened = $state<Opened | null>(null);
  /** The open document was just made, so it opens ready to edit. */
  let fresh = $state(false);
  /** Bumped to open the same document afresh (after restoring a version). */
  let openRev = $state(0);
  let versionsOf = $state<{ meta: DocMeta; dirty: boolean } | null>(null);
  let dropping = $state(false);
  let loadError = $state<string | null>(null);

  $effect(() => {
    if (prefs.value) applyTheme(prefs.value.theme);
  });

  // A refused preference shows in the notes line like anything else.
  $effect(() => {
    if (prefs.error) notes.say(prefs.error.message);
  });

  // List again whenever where we are, the search, or the filter and sort change.
  $effect(() => {
    const p = prefs.value;
    void library.place;
    void p?.library.kind;
    void p?.library.sort;
    const typing = library.search;
    if (!p) return;
    const t = setTimeout(() => library.refresh(), typing ? 120 : 0);
    return () => clearTimeout(t);
  });

  const selected = $derived(library.docs.find((d) => d.id === library.selected));

  function newDocument(kind: Kind) {
    const info = kindInfo(kind);
    if (!info.blank) return notes.say(`${info.plural} arrive in ${info.comingIn}.`);
    making = kind;
  }

  async function create(kind: Kind, name: string, opts?: NewOptions) {
    making = null;
    const doc = await library.create(kind, name, opts);
    if (doc) open(doc, true);
  }

  async function open(doc: DocMeta, isNew = false) {
    try {
      const o = await api.openDocument(doc.id);
      fresh = isNew;
      opened = o;
      library.selected = doc.id;
    } catch (e) {
      notes.say(errorMessage(e));
    }
  }

  /** A version was restored: reopen the document if it's the one open, and list again. */
  async function restored(meta: DocMeta) {
    versionsOf = null;
    notes.say(`Restored an earlier version of ${meta.name}`);
    if (opened?.meta.id === meta.id) {
      try {
        const o = await api.openDocument(meta.id);
        fresh = false;
        opened = o;
        openRev++;
      } catch (e) {
        notes.say(errorMessage(e));
      }
    }
    library.refresh();
  }

  function close() {
    opened = null;
    library.refresh();
  }

  function shell(id: MenuId): boolean {
    const p = prefs.value;
    const doc = opened?.meta ?? selected;
    switch (id) {
      case 'settings':
        settingsOpen = true;
        return true;
      case 'theme.system':
      case 'theme.light':
      case 'theme.dark':
        prefs.set('theme', id.slice('theme.'.length));
        return true;
      case 'toggle.sidebar':
        if (p) prefs.set('ui.sidebarOpen', !p.ui.sidebarOpen);
        return true;
      case 'toggle.inspector':
        if (p) prefs.set('ui.inspectorOpen', !p.ui.inspectorOpen);
        return true;
      case 'new.lin':
      case 'new.lpx':
      case 'new.ldw':
        newDocument(id.slice('new.'.length) as Kind);
        return true;
      case 'import':
        library.import();
        return true;
      case 'export':
        if (doc) library.exportFile(doc);
        else notes.say('Select a document to export it');
        return true;
      case 'close':
        if (opened) close();
        return true;
      case 'duplicate':
        if (!opened && selected && !selected.trashedAt) library.duplicate(selected);
        return true;
      case 'delete':
        if (!opened && selected && !selected.trashedAt) library.trash(selected);
        return true;
      case 'help.shortcuts':
        sheetOpen = true;
        return true;
    }
    return false;
  }

  onMount(() => {
    prefs
      .load()
      .then(() => library.refreshFolders())
      .then(() => takeOpened())
      .catch((e) => (loadError = errorMessage(e)));
    const off = onMenu(shell);
    const unlisten: (() => void)[] = [];
    let gone = false;
    const keep = (u: () => void) => (gone ? u() : unlisten.push(u));
    api.onMenu((id) => route(id)).then(keep);
    // Files opened with linear from Finder: import them; open one straight away.
    const takeOpened = async () => {
      const paths = await api.takeOpenedFiles().catch(() => [] as string[]);
      if (!paths.length) return;
      const made = await library.importPaths(paths);
      if (made.length === 1) open(made[0]);
    };
    api.onFilesOpened(takeOpened).then(keep);
    api
      .onDragDrop((e) => {
        if (dragging.active) return;
        if (e.type === 'over') dropping = true;
        else if (e.type === 'leave') dropping = false;
        else {
          dropping = false;
          if (e.paths.length) library.importPaths(e.paths);
        }
      })
      .then(keep);
    return () => {
      gone = true;
      off();
      unlisten.forEach((u) => u());
    };
  });
</script>

{#if prefs.value}
  {@const p = prefs.value}
  <div class="app" class:closed={!p.ui.sidebarOpen} style:--sidebar-w="{p.ui.sidebarWidth}px">
    {#if p.ui.sidebarOpen}
      <Sidebar onnew={newDocument} onsettings={() => (settingsOpen = true)} onkeytest={DEV ? () => (keyTestOpen = true) : undefined} />
    {/if}
    <main>
      {#if opened}
        {#key `${opened.meta.id}:${openRev}`}
          {#if opened.meta.kind === 'lin'}
            <LinEditor {opened} {fresh} onclose={close} onversions={(meta, dirty) => (versionsOf = { meta, dirty })} />
          {:else if opened.meta.kind === 'lpx'}
            <PixelEditor {opened} {fresh} onclose={close} onversions={(meta, dirty) => (versionsOf = { meta, dirty })} />
          {:else if opened.meta.kind === 'ldw'}
            <DrawEditor {opened} {fresh} onclose={close} onversions={(meta, dirty) => (versionsOf = { meta, dirty })} />
          {:else}
            <DocView {opened} onclose={close} />
          {/if}
        {/key}
      {:else}
        <header class="topbar" data-tauri-drag-region>
          <button
            class="icon-btn"
            title={p.ui.sidebarOpen ? 'Hide sidebar (⌘\\)' : 'Show sidebar (⌘\\)'}
            aria-pressed={p.ui.sidebarOpen}
            onclick={() => prefs.set('ui.sidebarOpen', !p.ui.sidebarOpen)}
          >
            <PanelLeft size={17} />
          </button>
          <h1 data-tauri-drag-region>
            {library.title}
            {#if library.place.view === 'folder'}
              {@const parent = library.folders.find((f) => f.id === library.place.folder)?.parentId ?? null}
              {#if parent !== null}<span class="path">in {folderPath(library.folders, parent)}</span>{/if}
            {/if}
          </h1>
          <div class="seg views" role="group" aria-label="Show as">
            <button title="Grid" aria-pressed={p.library.view === 'grid'} onclick={() => prefs.set('library.view', 'grid')}>
              <LayoutGrid size={15} />
            </button>
            <button title="List" aria-pressed={p.library.view === 'list'} onclick={() => prefs.set('library.view', 'list')}>
              <List size={15} />
            </button>
          </div>
        </header>
        <Library onopen={open} onnew={newDocument} onversions={(meta) => (versionsOf = { meta, dirty: false })} />
      {/if}
    </main>
  </div>
{:else if loadError}
  <div class="fatal">
    <h1>linear couldn't open its library</h1>
    <p>{loadError}</p>
  </div>
{/if}

{#if making}
  {@const kind = making}
  <NewDialog
    {kind}
    where={library.newFolder === null ? 'the top level' : folderPath(library.folders, library.newFolder)}
    onclose={() => (making = null)}
    oncreate={(name, opts) => create(kind, name, opts)}
  />
{/if}
{#if versionsOf}
  {@const v = versionsOf}
  <Versions meta={v.meta} dirty={v.dirty} onclose={() => (versionsOf = null)} onrestored={() => restored(v.meta)} />
{/if}
{#if settingsOpen}
  <Settings onclose={() => (settingsOpen = false)} />
{/if}
{#if sheetOpen}
  <ShortcutSheet title="Shortcuts" groups={LIBRARY_SHORTCUTS} onclose={() => (sheetOpen = false)} />
{/if}
{#if keyTestOpen}
  <KeyTest onclose={() => (keyTestOpen = false)} />
{/if}
{#if dropping}
  <div class="drop">
    <div class="drop-card">
      <FileDown size={28} />
      <strong>Drop to import</strong>
      <span>.lin files go in {library.newFolder === null ? 'the top level' : folderPath(library.folders, library.newFolder)}</span>
    </div>
  </div>
{/if}
{#if notes.current}
  {@const n = notes.current}
  <div class="note" role="status">
    <span>{n.text}</span>
    {#if n.action}
      <button
        onclick={() => {
          n.action?.run();
          notes.dismiss();
        }}>{n.action.label}</button
      >
    {/if}
  </div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    height: 100%;
  }
  .app.closed {
    grid-template-columns: minmax(0, 1fr);
  }
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    flex: none;
    padding: 0 12px;
    border-bottom: 1px solid var(--faint);
  }
  .closed .topbar {
    padding-left: calc(12px + var(--lights));
  }
  h1 {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    margin-left: 6px;
    color: var(--dim);
    font-weight: 400;
  }
  .views button {
    display: grid;
    place-items: center;
    padding: 0 8px;
  }
  .note {
    position: fixed;
    z-index: 200;
    left: 50%;
    bottom: 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    transform: translateX(-50%);
    max-width: min(620px, calc(100vw - 32px));
    padding: 9px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--ink);
  }
  .note button {
    flex: none;
    padding: 2px 6px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-weight: 600;
    cursor: pointer;
  }
  .note button:hover {
    text-decoration-thickness: 2px;
  }
  .drop {
    position: fixed;
    z-index: 150;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    pointer-events: none;
  }
  .drop-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 40px;
    border: 2px dashed var(--line);
    border-radius: 16px;
    background: var(--bg);
    color: var(--ink);
  }
  .drop-card span {
    color: var(--dim);
  }
  .fatal {
    padding: 64px 32px;
    text-align: center;
  }
  .fatal p {
    color: var(--dim);
  }
</style>
