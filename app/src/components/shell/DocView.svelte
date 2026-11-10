<!--
  An open document, until its editor exists: what it is, how many versions
  it has, and its saved content. The .lin editor replaces this in M2.
-->
<script lang="ts">
  import { ChevronLeft, FileOutput } from '@lucide/svelte';
  import { api } from '../../lib/api';
  import { kindInfo } from '../../lib/kinds';
  import { parseLin } from '../../lib/lin/format';
  import { library } from '../../lib/library.svelte';
  import { ago } from '../../lib/time';
  import type { Opened, VersionMeta } from '../../lib/types';

  let { opened, onclose }: { opened: Opened; onclose: () => void } = $props();
  const info = $derived(kindInfo(opened.meta.kind));
  let versions = $state<VersionMeta[] | null>(null);

  $effect(() => {
    api.listVersions(opened.meta.id).then((v) => (versions = v)).catch(() => (versions = []));
  });

  const summary = $derived.by(() => {
    if (opened.meta.kind !== 'lin') return null;
    try {
      const d = parseLin(opened.content);
      const lines = d.items.filter((p) => p.t === 'line').length;
      return `${d.items.length - lines} shapes and ${lines} lines on a ${d.w} × ${d.h} page`;
    } catch (e) {
      return `can't be read: ${(e as Error).message}`;
    }
  });
</script>

<header class="topbar" data-tauri-drag-region>
  <button class="btn back" onclick={onclose}><ChevronLeft size={16} /> Library</button>
  <h1 data-tauri-drag-region>{opened.meta.name}<span class="ext">{info.ext}</span></h1>
  <button class="btn" onclick={() => library.exportFile(opened.meta)}><FileOutput size={15} /> Export file…</button>
</header>

<div class="body">
  <div class="panel">
    <span class="glyph" style:color={info.tint}><info.icon size={28} /></span>
    <h2>The {info.label.toLowerCase()} editor isn't here yet</h2>
    <p>
      {opened.meta.kind === 'lin' ? 'It arrives in the next milestone (M2).' : `It arrives in ${info.comingIn}.`} For now, here is what
      the library holds for this document.
    </p>
    <dl>
      {#if summary}<dt>Content</dt><dd>{summary}</dd>{/if}
      <dt>Saved</dt><dd>{ago(opened.meta.updatedAt)}, {opened.version.bytes.toLocaleString()} bytes</dd>
      <dt>Versions</dt><dd>{versions ? versions.length : '…'}</dd>
      {#if opened.draft}<dt>Draft</dt><dd>unsaved changes from {ago(opened.draft.updatedAt)}</dd>{/if}
    </dl>
    <details>
      <summary>Saved content</summary>
      <pre>{opened.content}</pre>
    </details>
  </div>
</div>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    flex: none;
    padding: 0 12px;
    border-bottom: 1px solid var(--faint);
  }
  :global(.app.closed) .topbar {
    padding-left: calc(12px + var(--lights));
  }
  .back {
    height: 28px;
    padding: 0 10px 0 6px;
  }
  h1 {
    flex: 1;
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ext {
    margin-left: 4px;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 400;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8vh 24px 24px;
  }
  .panel {
    max-width: 640px;
    margin: 0 auto;
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    margin-bottom: 14px;
    border-radius: 14px;
    background: color-mix(in srgb, currentColor 13%, transparent);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 20px;
  }
  p {
    margin: 0 0 20px;
    color: var(--dim);
  }
  dl {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 6px 12px;
    margin: 0 0 20px;
  }
  dt {
    color: var(--dim);
  }
  dd {
    margin: 0;
  }
  summary {
    color: var(--dim);
    cursor: pointer;
  }
  pre {
    max-height: 320px;
    margin: 10px 0 0;
    padding: 12px;
    overflow: auto;
    border: 1px solid var(--faint);
    border-radius: var(--radius);
    background: var(--bg);
    font-family: var(--mono);
    font-size: 12px;
    -webkit-user-select: text;
    user-select: text;
  }
</style>
