import { isTauri } from '@tauri-apps/api/core';
import { mount } from 'svelte';
import App from './App.svelte';
import './styles/tokens.css';
import './styles/base.css';

// On macOS the window has no title bar of its own (tauri.conf.json,
// `titleBarStyle: Overlay`): the traffic lights sit over the top-left corner,
// so whatever is there leaves them room.
if (isTauri() && navigator.userAgent.includes('Mac')) {
  document.documentElement.classList.add('mac-overlay');
}

mount(App, { target: document.getElementById('app')! });
