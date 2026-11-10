// linear's desktop shell: one window on the system webview, the native menu,
// the library (linear-store) in the app's data folder, and the commands the
// page calls (commands.rs). Editing, drawing and file formats all live in the
// page (src/lib); Rust keeps the library and talks to the system.

mod commands;
mod error;
mod menu;
mod thumbs;
mod window_state;

use linear_store::Store;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/// Development builds keep their own library, so trying things out never touches real work.
const DB_FILE: &str = if cfg!(debug_assertions) { "linear-dev.db" } else { "linear.db" };

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::Opens::default())
        .register_asynchronous_uri_scheme_protocol("thumb", thumbs::protocol)
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
        .invoke_handler(tauri::generate_handler![
            commands::get_prefs,
            commands::set_pref,
            commands::reset_pref,
            commands::list_documents,
            commands::list_folders,
            commands::create_folder,
            commands::rename_folder,
            commands::move_folder,
            commands::delete_folder,
            commands::create_document,
            commands::open_document,
            commands::save_document,
            commands::document_content,
            commands::rename_document,
            commands::move_document,
            commands::duplicate_document,
            commands::set_pinned,
            commands::trash_document,
            commands::restore_document,
            commands::delete_document,
            commands::empty_trash,
            commands::list_versions,
            commands::read_version,
            commands::restore_version,
            commands::put_draft,
            commands::discard_draft,
            commands::list_palettes,
            commands::save_palette,
            commands::delete_palette,
            commands::take_opened_files,
            commands::read_import,
            commands::write_export,
        ])
        .build(tauri::generate_context!())
        .expect("linear couldn't start");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { .. } => {
            if let Some(w) = app.get_webview_window("main") {
                window_state::save(&w);
            }
        }
        // Files opened with linear from Finder: queue them and tell the page.
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if !paths.is_empty() {
                app.state::<commands::Opens>().0.lock().unwrap_or_else(|e| e.into_inner()).extend(paths);
                let _ = app.emit("files-opened", ());
            }
        }
        _ => {}
    });
}
