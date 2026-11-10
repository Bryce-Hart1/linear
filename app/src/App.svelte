<!--
  The window: sidebar and library now; the editors open here as they're built.
  The shell is the last stop for menu commands (menu-router.ts): it handles
  the ones that make sense with no document open, such as theme, sidebar,
  settings and new documents.
-->
<script lang="ts">
  import { LayoutGrid, List, PanelLeft } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import KeyTest from './components/dev/KeyTest.svelte';
  import Library from './components/shell/Library.svelte';
  import Settings from './components/shell/Settings.svelte';
  import Sidebar from './components/shell/Sidebar.svelte';
  import { api } from './lib/api';
  import { kindInfo } from './lib/kinds';
  import type { MenuId } from './lib/menu-ids';
  import { onMenu, route } from './lib/menu-router';
  import { prefs } from './lib/prefs.svelte';
  import { applyTheme } from './lib/theme';
  import { errorMessage, type Kind } from './lib/types';

  const DEV = import.meta.env.DEV;

  let settingsOpen = $state(false);
  let keyTestOpen = $state(false);
  let note = $state<string | null>(null);
  let loadError = $state<string | null>(null);
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (prefs.value) applyTheme(prefs.value.theme);
  });

  // A refused preference shows in the status line like any other note.
  $effect(() => {
    if (prefs.error) say(prefs.error.message);
  });

  function say(text: string) {
    note = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = null), 3500);
  }

  function newDocument(kind: Kind) {
    say(`${kindInfo(kind).label}s can be made once the library is in (milestone M1).`);
  }

  function shell(id: MenuId): boolean {
    const p = prefs.value;
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
      case 'help.shortcuts':
        if (DEV) keyTestOpen = true;
        else say('The shortcut sheet comes with the editors.');
        return true;
    }
    return false;
  }

  onMount(() => {
    prefs.load().catch((e) => (loadError = errorMessage(e)));
    const off = onMenu(shell);
    let unlisten: (() => void) | undefined;
    let gone = false;
    api.onMenu((id) => route(id)).then((u) => (gone ? u() : (unlisten = u)));
    return () => {
      gone = true;
      off();
      unlisten?.();
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
      <header class="topbar" data-tauri-drag-region>
        <button
          class="icon-btn"
          title={p.ui.sidebarOpen ? 'Hide sidebar (⌘\\)' : 'Show sidebar (⌘\\)'}
          aria-pressed={p.ui.sidebarOpen}
          onclick={() => prefs.set('ui.sidebarOpen', !p.ui.sidebarOpen)}
        >
          <PanelLeft size={17} />
        </button>
        <h1 data-tauri-drag-region>All documents</h1>
        <div class="seg views" role="group" aria-label="Show as">
          <button title="Grid" aria-pressed={p.library.view === 'grid'} onclick={() => prefs.set('library.view', 'grid')}>
            <LayoutGrid size={15} />
          </button>
          <button title="List" aria-pressed={p.library.view === 'list'} onclick={() => prefs.set('library.view', 'list')}>
            <List size={15} />
          </button>
        </div>
      </header>
      <Library onnew={newDocument} />
    </main>
  </div>
{:else if loadError}
  <div class="fatal">
    <h1>linear couldn't open its library</h1>
    <p>{loadError}</p>
  </div>
{/if}

{#if settingsOpen}
  <Settings onclose={() => (settingsOpen = false)} />
{/if}
{#if keyTestOpen}
  <KeyTest onclose={() => (keyTestOpen = false)} />
{/if}
{#if note}
  <div class="note" role="status">{note}</div>
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
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .views button {
    display: grid;
    place-items: center;
    padding: 0 8px;
  }
  .note {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    max-width: min(560px, calc(100vw - 32px));
    padding: 9px 14px;
    border-radius: var(--radius);
    background: var(--ink);
    color: var(--bg);
    box-shadow: var(--shadow);
  }
  .fatal {
    padding: 64px 32px;
    text-align: center;
  }
  .fatal p {
    color: var(--dim);
  }
</style>
