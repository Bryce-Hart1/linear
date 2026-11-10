// The commands the page calls (src/lib/api.ts). Diesel is synchronous, so
// every command hands its store work to a blocking thread and the webview's
// IPC never waits on SQLite.

use linear_store::{Prefs, Store};
use tauri::State;

use crate::error::{CmdError, CmdResult};

/// Runs `f` against the store on a blocking thread.
async fn on_store<T, F>(store: &Store, f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce(&Store) -> linear_store::Result<T> + Send + 'static,
{
    let store = store.clone();
    tauri::async_runtime::spawn_blocking(move || f(&store))
        .await
        .map_err(CmdError::internal)?
        .map_err(CmdError::from)
}

// ── Preferences ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_prefs(store: State<'_, Store>) -> CmdResult<Prefs> {
    on_store(&store, |s| s.prefs()).await
}

/// Sets one preference by its dotted key (`theme`, `ldw.pen.color`) and returns them all.
#[tauri::command]
pub async fn set_pref(store: State<'_, Store>, key: String, value: serde_json::Value) -> CmdResult<Prefs> {
    on_store(&store, move |s| s.set_pref(&key, value)).await
}

/// Puts one preference, or a group of them, back to the default.
#[tauri::command]
pub async fn reset_pref(store: State<'_, Store>, key: String) -> CmdResult<Prefs> {
    on_store(&store, move |s| s.reset_pref(&key)).await
}
