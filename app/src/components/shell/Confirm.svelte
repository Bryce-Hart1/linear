<!-- Asks before something that can't be undone. -->
<script lang="ts">
  import Dialog from '../ui/Dialog.svelte';

  let {
    title,
    message,
    confirm,
    danger = false,
    onclose,
    onconfirm,
  }: { title: string; message: string; confirm: string; danger?: boolean; onclose: () => void; onconfirm: () => void } = $props();
</script>

<Dialog {title} {onclose} width={400}>
  <p>{message}</p>
  {#snippet actions()}
    <button class="btn" onclick={onclose}>Cancel</button>
    <button
      class="btn"
      class:danger
      class:primary={!danger}
      onclick={() => {
        // Run first: closing clears the state the action may read.
        onconfirm();
        onclose();
      }}>{confirm}</button
    >
  {/snippet}
</Dialog>

<style>
  p {
    margin: 0;
    color: var(--dim);
  }
</style>
