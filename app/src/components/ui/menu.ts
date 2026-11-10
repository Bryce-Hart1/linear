import type { Component } from 'svelte';

/** One line of a context menu, or a divider. */
export type MenuItem =
  | { label: string; icon?: Component; run: () => void; danger?: boolean; disabled?: boolean; hint?: string }
  | { separator: true };
