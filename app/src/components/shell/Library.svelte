<!--
  The library's main area. Until documents exist (M1) it is the empty state:
  one large card per kind of document.
-->
<script lang="ts">
  import { KINDS } from '../../lib/kinds';
  import type { Kind } from '../../lib/types';

  let { onnew }: { onnew: (kind: Kind) => void } = $props();
</script>

<section class="library">
  <div class="empty">
    <h2>Make something</h2>
    <p>Everything you make is kept in your library, with its earlier versions.</p>
    <div class="kinds">
      {#each KINDS as k (k.kind)}
        <button class="card" onclick={() => onnew(k.kind)}>
          <span class="glyph" style:color={k.tint}><k.icon size={26} /></span>
          <span class="label">{k.label}</span>
          <span class="blurb">{k.blurb}</span>
          <span class="ext">{k.ext}</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .library {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .empty {
    width: 100%;
    max-width: 720px;
    text-align: center;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  p {
    margin: 0 0 28px;
    color: var(--dim);
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 14px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 18px;
    border: 1px solid var(--faint);
    border-radius: var(--radius-lg);
    background: var(--surface);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 120ms,
      box-shadow 120ms,
      transform 120ms;
  }
  .card:hover {
    border-color: color-mix(in srgb, var(--faint), var(--ink) 20%);
    box-shadow: var(--shadow);
    transform: translateY(-1px);
  }
  .glyph {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    margin-bottom: 10px;
    border-radius: 12px;
    background: color-mix(in srgb, currentColor 13%, transparent);
  }
  .label {
    font-size: 15px;
    font-weight: 600;
  }
  .blurb {
    color: var(--dim);
  }
  .ext {
    margin-top: 8px;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 11px;
  }
</style>
