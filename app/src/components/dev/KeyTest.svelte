<!--
  Development only: shows where each key press and menu command goes, to
  settle how the native menu and the page share the keyboard (plan §8). Try
  ⌘Z, ⌘A, ⌘C, ⌘V, ⌘D and ⌘S, first in the text field, then in the canvas.
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { watchMenu } from '../../lib/menu-router';

  let { onclose }: { onclose: () => void } = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  let field: HTMLInputElement | undefined = $state();
  let canvas: HTMLDivElement | undefined = $state();
  let log = $state<{ n: number; what: string; detail: string }[]>([]);
  let n = 0;

  function add(what: string, detail: string) {
    log = [{ n: ++n, what, detail }, ...log].slice(0, 40);
  }

  function where(t: EventTarget | null): string {
    if (t === field) return 'field';
    if (t === canvas) return 'canvas';
    return (t as Element | null)?.tagName?.toLowerCase() ?? 'window';
  }

  function keys(e: KeyboardEvent): string {
    return [e.metaKey && '⌘', e.ctrlKey && '⌃', e.altKey && '⌥', e.shiftKey && '⇧', e.code].filter(Boolean).join('');
  }

  onMount(() => {
    dialog?.showModal();
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) add('keydown', `${keys(e)} in ${where(e.target)}`);
    };
    const onClip = (e: ClipboardEvent) => {
      add(e.type, `in ${where(document.activeElement)}`);
      // On the canvas, the editors will take these as their own copy/paste.
      if (document.activeElement === canvas) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    for (const t of ['copy', 'cut', 'paste']) document.addEventListener(t, onClip as EventListener);
    const unwatch = watchMenu((id, outcome) => add('menu', `${id} → ${outcome} (focus: ${where(document.activeElement)})`));
    return () => {
      window.removeEventListener('keydown', onKey);
      for (const t of ['copy', 'cut', 'paste']) document.removeEventListener(t, onClip as EventListener);
      unwatch();
    };
  });
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="keytest-title">
  <header>
    <h2 id="keytest-title">Key test</h2>
    <button class="icon-btn" title="Close" onclick={() => dialog?.close()}><X size={16} /></button>
  </header>
  <p class="how">Press ⌘Z, ⌘A, ⌘C, ⌘V, ⌘D and ⌘S in each target below and watch where each one goes.</p>
  <div class="targets">
    <input bind:this={field} placeholder="Text field: type, then ⌘Z" />
    <!-- Stands in for an editor's canvas, which takes focus the same way. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div bind:this={canvas} class="canvas" tabindex="0" role="application" aria-label="Canvas stand-in">Canvas: click, then press keys</div>
  </div>
  <div class="log-head">
    <span>Events, newest first</span>
    <button class="btn" onclick={() => (log = [])}>Clear</button>
  </div>
  <ol class="log">
    {#each log as e (e.n)}
      <li><span class="what">{e.what}</span>{e.detail}</li>
    {:else}
      <li class="none">Nothing yet</li>
    {/each}
  </ol>
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 32px));
    padding: 0 0 16px;
    border: 1px solid var(--faint);
    border-radius: var(--radius-lg);
    background: var(--bg);
    color: var(--ink);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.28);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 0 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .how {
    margin: 6px 20px 12px;
    color: var(--dim);
  }
  .targets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 0 20px;
  }
  .targets input {
    height: 64px;
    padding: 0 10px;
    border: 1px solid var(--faint);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .canvas {
    display: grid;
    place-items: center;
    height: 64px;
    border: 1px dashed var(--faint);
    border-radius: var(--radius);
    background: var(--paper);
    color: var(--dim);
  }
  .canvas:focus {
    border-color: var(--line);
    outline: none;
  }
  .log-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 20px 6px;
    color: var(--dim);
  }
  .log {
    height: 220px;
    margin: 0 20px;
    padding: 6px 10px;
    overflow: auto;
    border-radius: var(--radius);
    background: var(--bg);
    font-family: var(--mono);
    font-size: 12px;
    list-style: none;
  }
  .what {
    display: inline-block;
    width: 72px;
    color: var(--ink);
  }
  .none {
    color: var(--dim);
  }
</style>
