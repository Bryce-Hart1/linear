// The one place the page talks to Rust. Inside the app, every call is an
// `invoke` of a command in src-tauri/src/commands.rs and every event comes
// from there too. In a plain browser (`npm run dev`) an in-memory fake serves
// the same interface (mock.ts), so the UI can be worked on without the app.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MenuId } from './menu-ids';
import { mockBackend } from './mock';
import type { Prefs } from './types';

export type Unlisten = () => void;

export interface Backend {
  /** True inside the app, false in a plain browser on the mock. */
  readonly isApp: boolean;
  getPrefs(): Promise<Prefs>;
  /** Sets one preference by its dotted key (`theme`, `ldw.pen.color`); returns them all. */
  setPref(key: string, value: unknown): Promise<Prefs>;
  /** Puts a preference, or a group (`ldw`), back to its default. */
  resetPref(key: string): Promise<Prefs>;
  /** The window's own light/dark look (title bar, traffic lights); null follows the system. */
  setWindowTheme(theme: 'light' | 'dark' | null): Promise<void>;
  /** A native menu item was chosen (or, on the mock, its key pressed). */
  onMenu(cb: (id: MenuId) => void): Promise<Unlisten>;
}

function tauri(): Backend {
  return {
    isApp: true,
    getPrefs: () => invoke<Prefs>('get_prefs'),
    setPref: (key, value) => invoke<Prefs>('set_pref', { key, value }),
    resetPref: (key) => invoke<Prefs>('reset_pref', { key }),
    setWindowTheme: (theme) => getCurrentWindow().setTheme(theme),
    onMenu: (cb) => listen<MenuId>('menu', (e) => cb(e.payload)),
  };
}

export const api: Backend = isTauri() ? tauri() : mockBackend();
