// linear's desktop shell: one window on the system webview, the native menu,
// the library (linear-store) in the app's data folder, and the commands the
// page calls (commands.rs). Editing, drawing and file formats all live in the
// page (src/lib); Rust keeps the library and talks to the system.

mod commands;
mod error;
mod menu;
mod window_state;

use linear_store::Store;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/// Development builds keep their own library, so trying things out never touches real work.
const DB_FILE: &str = if cfg!(debug_assertions) { "linear-dev.db" } else { "linear.db" };

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let store = Store::open(&app.path().app_data_dir()?.join(DB_FILE))?;
            app.manage(store.clone());
            app.set_menu(menu::build(app.handle())?)?;
            if let Some(window) = app.get_webview_window("main") {
                window_state::restore(&window, &store);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event
                && let Some(w) = window.app_handle().get_webview_window(window.label())
            {
                window_state::save(&w);
            }
        })
        .invoke_handler(tauri::generate_handler![commands::get_prefs, commands::set_pref, commands::reset_pref])
        .build(tauri::generate_context!())
        .expect("linear couldn't start");

    app.run(|app, event| {
        if let RunEvent::ExitRequested { .. } = event
            && let Some(w) = app.get_webview_window("main")
        {
            window_state::save(&w);
        }
    });
}
