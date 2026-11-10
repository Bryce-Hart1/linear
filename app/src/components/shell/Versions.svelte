<!--
  A document's saved versions, newest first, with a picture of the selected
  one. Restoring copies that version to the top as a new save, so the ones in
  between stay and the restore can itself be undone by restoring again. The
  library keeps as many versions as Settings says (versions.keep).
-->
<script lang="ts">
  import { History, RotateCcw } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import { api } from '../../lib/api';
  import { kindInfo } from '../../lib/kinds';
  import { ago } from '../../lib/time';
  import { errorMessage, type DocMeta, type VersionMeta } from '../../lib/types';
  import Dialog from '../ui/Dialog.svelte';

  let {
    meta,
    dirty = false,
    onclose,
    onrestored,
  }: { meta: DocMeta; dirty?: boolean; onclose: () => void; onrestored: () => void } = $props();

  let versions = $state<VersionMeta[] | null>(null);
  let chosen = $state<number | null>(null);
  let picture = $state<string | null>(null);
  let content = $state<string | null>(null);
  let problem = $state<string | null>(null);
  let busy = $state(false);
  let asked = 0;

  const info = $derived(kindInfo(meta.kind));
  const newest = $derived(versions?.[0]?.id ?? null);

  onMount(async () => {
    try {
      versions = await api.listVersions(meta.id);
      if (versions.length) pick(versions[0].id);
    } catch (e) {
      problem = errorMessage(e);
    }
  });

  onDestroy(() => {
    if (picture) URL.revokeObjectURL(picture);
  });

  async function pick(id: number) {
    chosen = id;
    const n = ++asked;
    try {
      const text = await api.readVersion(id);
      const bytes = await info.thumbnail(text);
      if (n !== asked) return;
      content = text;
      if (picture) URL.revokeObjectURL(picture);
      picture = bytes ? URL.createObjectURL(new Blob([bytes as BlobPart])) : null;
      problem = null;
    } catch (e) {
      if (n === asked) problem = errorMessage(e);
    }
  }

  async function restore() {
    if (chosen === null || content === null || busy) return;
    busy = true;
    try {
      const thumb = await info.thumbnail(content);
      await api.restoreVersion(chosen, thumb);
      onrestored();
    } catch (e) {
      problem = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  const kb = (n: number) => (n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} KB`);
  const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<Dialog title="Versions of “{meta.name}”" {onclose} width={680}>
  {#if problem}<p class="problem">{problem}</p>{/if}
  {#if !versions}
    <p class="dim">Loading…</p>
  {:else if versions.length === 0}
    <p class="dim">No saved versions.</p>
  {:else}
    <div class="split">
      <ol class="list" aria-label="Versions">
        {#each versions as v, i (v.id)}
          <li>
            <button aria-pressed={chosen === v.id} onclick={() => pick(v.id)}>
              <span class="when">{i === 0 ? 'Now' : ago(v.createdAt)}</span>
              <span class="dim small">{when(v.createdAt)} · {kb(v.bytes)}</span>
            </button>
          </li>
        {/each}
      </ol>
      <div class="preview">
        {#if picture}
          <img src={picture} alt="Version preview" />
        {:else}
          <div class="blank"><info.icon size={30} strokeWidth={1.5} /><span>{content === null ? '' : 'Nothing drawn in this version'}</span></div>
        {/if}
      </div>
    </div>
    <p class="dim note">
      <History size={13} />
      Keeps the last {versions.length === 1 ? 'version' : `${versions.length} versions`}; Settings says how many. Restoring saves a copy on top, so nothing in between is lost.
      {#if dirty}<strong>Your unsaved changes are replaced.</strong>{/if}
    </p>
  {/if}
  {#snippet actions()}
    <button class="btn" onclick={onclose}>Close</button>
    <button class="btn primary" disabled={chosen === null || chosen === newest || busy || content === null} onclick={restore}>
      <RotateCcw size={14} />
      {busy ? 'Restoring…' : 'Restore this version'}
    </button>
  {/snippet}
</Dialog>

<style>
  .split {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 14px;
    height: 340px;
  }
  .list {
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }
  .list button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .list button[aria-pressed='true'] {
    border-color: var(--line);
  }
  .when {
    font-weight: 550;
  }
  .preview {
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--faint);
    border-radius: 10px;
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .blank {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--dim);
  }
  .dim {
    color: var(--dim);
  }
  .small {
    font-size: 11.5px;
  }
  .note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 12px 0 0;
    font-size: 12px;
  }
  .note strong {
    color: var(--ink);
    font-weight: 600;
  }
  .problem {
    margin: 0 0 10px;
    color: var(--danger);
  }
</style>
