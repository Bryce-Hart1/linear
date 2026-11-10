<!--
  The .lin editor's tools, down the left: select, the four shapes, the line,
  and the hand for moving the page. Choosing a shape or the line arms it, as
  its key does, and the next click places it. Any tool switches to editing.
-->
<script lang="ts">
  import { Circle, Diamond, Hand, Hash, Keyboard, MousePointer2, Spline, Square, Triangle } from '@lucide/svelte';
  import type { Component } from 'svelte';
  import type { Tool } from '../../../lib/lin-ui/tool';

  let {
    tool,
    grid,
    onpick,
    ongrid,
    onhelp,
  }: { tool: Tool; grid: boolean; onpick: (t: Tool) => void; ongrid: () => void; onhelp: () => void } = $props();

  const TOOLS: { tool: Tool; label: string; key: string; icon: Component }[] = [
    { tool: 'select', label: 'Select', key: 'esc', icon: MousePointer2 },
    { tool: 'hand', label: 'Move the page', key: 'drag while viewing', icon: Hand },
    { tool: 'rect', label: 'Rectangle', key: 'r', icon: Square },
    { tool: 'circle', label: 'Circle', key: 'c', icon: Circle },
    { tool: 'triangle', label: 'Triangle', key: 't', icon: Triangle },
    { tool: 'diamond', label: 'Diamond', key: 'd', icon: Diamond },
    { tool: 'line', label: 'Line', key: 'l', icon: Spline },
  ];
</script>

<div class="rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
  {#each TOOLS as t, i (t.tool)}
    {#if i === 2}<span class="rule"></span>{/if}
    <button class="tool" aria-pressed={tool === t.tool} title="{t.label} ({t.key})" onclick={() => onpick(t.tool)}>
      <t.icon size={18} strokeWidth={1.8} />
    </button>
  {/each}
  <span class="rule"></span>
  <button class="tool" aria-pressed={grid} title="Snap to a 10 px grid (g)" onclick={ongrid}><Hash size={18} strokeWidth={1.8} /></button>
  <span class="grow"></span>
  <button class="tool" title="Keyboard shortcuts (⌘/)" onclick={onhelp}><Keyboard size={18} strokeWidth={1.8} /></button>
</div>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 48px;
    flex: none;
    padding: 8px 0;
    border-right: 1px solid var(--faint);
    background: var(--sidebar);
  }
  .tool {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--dim);
    cursor: pointer;
  }
  .tool:hover {
    color: var(--ink);
  }
  .tool[aria-pressed='true'] {
    border-color: var(--line);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .rule {
    width: 22px;
    height: 1px;
    margin: 6px 0;
    background: var(--faint);
  }
  .grow {
    flex: 1;
  }
</style>
