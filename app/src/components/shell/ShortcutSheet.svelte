<!-- The keyboard shortcuts for where you are (⌘/), in groups. -->
<script lang="ts">
  import type { ShortcutGroup } from '../../lib/lin-ui/shortcuts';
  import Dialog from '../ui/Dialog.svelte';

  let { title, groups, onclose }: { title: string; groups: ShortcutGroup[]; onclose: () => void } = $props();
</script>

<Dialog {title} {onclose} width={720}>
  <div class="groups">
    {#each groups as g (g.title)}
      <section>
        <h3>{g.title}</h3>
        <dl>
          {#each g.rows as r (r.keys + r.does)}
            <dt>{#each r.keys.split(' or ') as k, i (i)}{#if i}<span class="or">or</span>{/if}<kbd>{k}</kbd>{/each}</dt>
            <dd>{r.does}</dd>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</Dialog>

<style>
  .groups {
    columns: 2 300px;
    column-gap: 28px;
    max-height: min(70vh, 640px);
    overflow: auto;
    padding-bottom: 12px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 16px;
  }
  h3 {
    margin: 0 0 6px;
    color: var(--dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 5px 12px;
    margin: 0;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  dd {
    margin: 0;
    color: var(--dim);
  }
  kbd {
    display: inline-block;
    min-width: 20px;
    padding: 0 6px;
    border: 1px solid var(--faint);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--bg);
    font-family: var(--font);
    font-size: 11.5px;
    line-height: 18px;
    text-align: center;
    white-space: nowrap;
  }
  .or {
    color: var(--dim);
    font-size: 11px;
  }
</style>
