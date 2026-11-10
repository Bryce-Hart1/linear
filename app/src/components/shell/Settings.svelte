<!--
  Settings: the preferences kept in the library (linear-store's prefs.rs).
  Every control writes through `prefs.set`, and shows what was stored, so a
  refused value springs back and the reason appears in the status line.
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { prefs } from '../../lib/prefs.svelte';
  import type { Theme } from '../../lib/types';

  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  onMount(() => dialog?.showModal());

  const THEMES: [Theme, string][] = [
    ['system', 'Match system'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];

  /** Sets a number, then shows what was stored: after a refusal nothing changed, so Svelte wouldn't redraw the field. */
  async function setNumber(key: string, input: HTMLInputElement) {
    await prefs.set(key, input.valueAsNumber);
    const stored = key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], prefs.value);
    input.value = String(stored);
  }

  function onclick(e: MouseEvent) {
    if (e.target === dialog) dialog?.close();
  }
</script>

<dialog bind:this={dialog} {onclick} {onclose} aria-labelledby="settings-title">
  {#if prefs.value}
    {@const p = prefs.value}
    <header>
      <h2 id="settings-title">Settings</h2>
      <button class="icon-btn" title="Close" onclick={() => dialog?.close()}><X size={16} /></button>
    </header>

    <section>
      <h3>Appearance</h3>
      <div class="field">
        <span>Theme</span>
        <div class="seg" role="group" aria-label="Theme">
          {#each THEMES as [value, label] (value)}
            <button aria-pressed={p.theme === value} onclick={() => prefs.set('theme', value)}>{label}</button>
          {/each}
        </div>
      </div>
      <label class="field">
        <span>Show key hints under the canvas</span>
        <input type="checkbox" checked={p.ui.showHints} onchange={(e) => prefs.set('ui.showHints', e.currentTarget.checked)} />
      </label>
    </section>

    <section>
      <h3>Library</h3>
      <label class="field">
        <span>Versions kept for each document</span>
        <input
          class="num"
          type="number"
          min="1"
          max="1000"
          value={p.versions.keep}
          onchange={(e) => setNumber('versions.keep', e.currentTarget)}
        />
      </label>
    </section>

    <section>
      <h3>Diagrams</h3>
      <div class="field">
        <span>Open diagrams for</span>
        <div class="seg" role="group" aria-label="Open diagrams for">
          <button aria-pressed={p.lin.openIn === 'view'} onclick={() => prefs.set('lin.openIn', 'view')}>Viewing</button>
          <button aria-pressed={p.lin.openIn === 'edit'} onclick={() => prefs.set('lin.openIn', 'edit')}>Editing</button>
        </div>
      </div>
      <label class="field">
        <span>Play pulses when a diagram opens</span>
        <input type="checkbox" checked={p.lin.playOnOpen} onchange={(e) => prefs.set('lin.playOnOpen', e.currentTarget.checked)} />
      </label>
    </section>
  {/if}
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
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
    padding: 14px 14px 6px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
  }
  section {
    padding: 8px 20px 14px;
  }
  section + section {
    border-top: 1px solid var(--faint);
    padding-top: 14px;
  }
  h3 {
    margin: 0 0 8px;
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 36px;
  }
  .num {
    width: 80px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--faint);
    border-radius: 6px;
    background: var(--bg);
    text-align: right;
  }
  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
</style>
