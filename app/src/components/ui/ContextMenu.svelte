<!--
  A menu at the pointer, for right-clicks. It stays inside the window, closes
  on Escape, on a click anywhere else, or when an item runs, and the arrow
  keys move through its items.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { MenuItem } from './menu';

  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();
  let el: HTMLDivElement | undefined = $state();
  let left = $state(0);
  let top = $state(0);

  onMount(async () => {
    left = x;
    top = y;
    await tick();
    if (!el) return;
    const r = el.getBoundingClientRect();
    left = Math.max(8, Math.min(x, innerWidth - r.width - 8));
    top = Math.max(8, Math.min(y, innerHeight - r.height - 8));
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  });

  function run(item: Extract<MenuItem, { label: string }>) {
    onclose();
    item.run();
  }

  function onpointerdown(e: PointerEvent) {
    if (el && !el.contains(e.target as Node)) onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const buttons = [...(el?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }
</script>

<svelte:window {onpointerdown} {onkeydown} onblur={onclose} onresize={onclose} />

<div class="menu" role="menu" bind:this={el} style:left="{left}px" style:top="{top}px">
  {#each items as item, i (i)}
    {#if 'separator' in item}
      <hr />
    {:else}
      <button role="menuitem" class:danger={item.danger} disabled={item.disabled} onclick={() => run(item)}>
        {#if item.icon}<item.icon size={15} />{:else}<span class="pad"></span>{/if}
        <span class="label">{item.label}</span>
        {#if item.hint}<span class="hint">{item.hint}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
  }
  button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--accent);
    color: var(--accent-ink);
    outline: none;
  }
  button:disabled {
    color: var(--dim);
    opacity: 0.6;
    cursor: default;
  }
  .danger {
    color: var(--danger);
  }
  .pad {
    width: 15px;
  }
  .label {
    flex: 1;
  }
  .hint {
    color: var(--dim);
    font-size: 12px;
  }
  button:hover .hint,
  button:focus-visible .hint {
    color: inherit;
    opacity: 0.8;
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 1px solid var(--faint);
  }
</style>
