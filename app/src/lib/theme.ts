// Light, dark, or whatever the system is. The page's colours come from CSS
// variables (styles/tokens.css) that follow `prefers-color-scheme` unless the
// root carries `data-theme`; the window's own chrome is told separately.

import { api } from './api';
import type { Theme } from './types';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  api.setWindowTheme(theme === 'system' ? null : theme).catch(() => {});
}
