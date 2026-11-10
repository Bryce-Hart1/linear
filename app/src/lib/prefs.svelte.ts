// The user's preferences, live. Components read `prefs.value`; changes go
// through `prefs.set`, which writes to the library and takes back the whole
// set as stored, so the page never shows a value the store refused.

import { api } from './api';
import { errorMessage, type Prefs } from './types';

class PrefsStore {
  /** Null until loaded. */
  value = $state<Prefs | null>(null);
  /** The last refusal or failure, for the status line. A new object each time, so a repeat still shows. */
  error = $state<{ message: string } | null>(null);

  async load() {
    this.value = await api.getPrefs();
  }

  async set(key: string, value: unknown) {
    try {
      this.value = await api.setPref(key, value);
      this.error = null;
    } catch (e) {
      this.error = { message: errorMessage(e) };
    }
  }

  async reset(key: string) {
    try {
      this.value = await api.resetPref(key);
      this.error = null;
    } catch (e) {
      this.error = { message: errorMessage(e) };
    }
  }
}

export const prefs = new PrefsStore();
