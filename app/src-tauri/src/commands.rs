// The commands the page calls (src/lib/api.ts). Diesel is synchronous, so
// every command hands its store work to a blocking thread and the webview's
// IPC never waits on SQLite. Arguments arrive camelCased from the page and
// Tauri maps them onto these snake_case names.

use std::path::Path;

use linear_store::docs::{self, DocMeta, NewDoc, Opened, Query, Saved, VersionMeta};
use linear_store::folders::{self, Folder};
use linear_store::palettes::{self, Palette};
use linear_store::{Kind, Prefs, Store};
use serde::Serialize;
use tauri::State;

use crate::error::{CmdError, CmdResult};

/// Runs `f` with a store connection on a blocking thread.
async fn on_store<T, F>(store: &Store, f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut linear_store::SqliteConnection) -> linear_store::Result<T> + Send + 'static,
{
    let store = store.clone();
    tauri::async_runtime::spawn_blocking(move || store.with(f))
        .await
        .map_err(CmdError::internal)?
        .map_err(CmdError::from)
}

// ── Preferences ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_prefs(store: State<'_, Store>) -> CmdResult<Prefs> {
    on_store(&store, linear_store::prefs::get).await
}

/// Sets one preference by its dotted key (`theme`, `ldw.pen.color`) and returns them all.
#[tauri::command]
pub async fn set_pref(store: State<'_, Store>, key: String, value: serde_json::Value) -> CmdResult<Prefs> {
    on_store(&store, move |c| linear_store::prefs::set(c, &key, value)).await
}

/// Puts one preference, or a group of them, back to the default.
#[tauri::command]
pub async fn reset_pref(store: State<'_, Store>, key: String) -> CmdResult<Prefs> {
    on_store(&store, move |c| linear_store::prefs::reset(c, &key)).await
}

// ── Library ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_documents(store: State<'_, Store>, query: Query) -> CmdResult<Vec<DocMeta>> {
    on_store(&store, move |c| docs::list(c, &query)).await
}

#[tauri::command]
pub async fn list_folders(store: State<'_, Store>) -> CmdResult<Vec<Folder>> {
    on_store(&store, folders::list).await
}

#[tauri::command]
pub async fn create_folder(store: State<'_, Store>, parent: Option<i32>, name: String) -> CmdResult<Folder> {
    on_store(&store, move |c| folders::create(c, parent, &name)).await
}

#[tauri::command]
pub async fn rename_folder(store: State<'_, Store>, id: i32, name: String) -> CmdResult<Folder> {
    on_store(&store, move |c| folders::rename(c, id, &name)).await
}

#[tauri::command]
pub async fn move_folder(store: State<'_, Store>, id: i32, parent: Option<i32>) -> CmdResult<Folder> {
    on_store(&store, move |c| folders::move_to(c, id, parent)).await
}

/// Returns how many documents moved up out of it.
#[tauri::command]
pub async fn delete_folder(store: State<'_, Store>, id: i32) -> CmdResult<usize> {
    on_store(&store, move |c| folders::delete(c, id)).await
}

// ── Documents ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_document(store: State<'_, Store>, doc: NewDoc) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::create(c, &doc)).await
}

#[tauri::command]
pub async fn open_document(store: State<'_, Store>, id: i32) -> CmdResult<Opened> {
    on_store(&store, move |c| docs::open(c, id)).await
}

#[tauri::command]
pub async fn save_document(store: State<'_, Store>, id: i32, content: String, thumbnail: Option<Vec<u8>>) -> CmdResult<Saved> {
    on_store(&store, move |c| docs::save(c, id, &content, thumbnail)).await
}

/// The newest saved content, for exporting.
#[tauri::command]
pub async fn document_content(store: State<'_, Store>, id: i32) -> CmdResult<String> {
    on_store(&store, move |c| docs::content(c, id)).await
}

#[tauri::command]
pub async fn rename_document(store: State<'_, Store>, id: i32, name: String) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::rename(c, id, &name)).await
}

#[tauri::command]
pub async fn move_document(store: State<'_, Store>, id: i32, folder: Option<i32>) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::move_to(c, id, folder)).await
}

#[tauri::command]
pub async fn duplicate_document(store: State<'_, Store>, id: i32) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::duplicate(c, id)).await
}

#[tauri::command]
pub async fn set_pinned(store: State<'_, Store>, id: i32, pinned: bool) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::set_pinned(c, id, pinned)).await
}

#[tauri::command]
pub async fn trash_document(store: State<'_, Store>, id: i32) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::trash(c, id)).await
}

#[tauri::command]
pub async fn restore_document(store: State<'_, Store>, id: i32) -> CmdResult<DocMeta> {
    on_store(&store, move |c| docs::restore(c, id)).await
}

/// Deletes one document in the Trash for good.
#[tauri::command]
pub async fn delete_document(store: State<'_, Store>, id: i32) -> CmdResult<()> {
    on_store(&store, move |c| docs::delete_forever(c, id)).await
}

/// Returns how many documents were deleted.
#[tauri::command]
pub async fn empty_trash(store: State<'_, Store>) -> CmdResult<usize> {
    on_store(&store, docs::empty_trash).await
}

// ── Versions and drafts ──────────────────────────────────────────────────

#[tauri::command]
pub async fn list_versions(store: State<'_, Store>, id: i32) -> CmdResult<Vec<VersionMeta>> {
    on_store(&store, move |c| docs::list_versions(c, id)).await
}

#[tauri::command]
pub async fn read_version(store: State<'_, Store>, version: i32) -> CmdResult<String> {
    on_store(&store, move |c| docs::read_version(c, version)).await
}

#[tauri::command]
pub async fn restore_version(store: State<'_, Store>, version: i32, thumbnail: Option<Vec<u8>>) -> CmdResult<Saved> {
    on_store(&store, move |c| docs::restore_version(c, version, thumbnail)).await
}

#[tauri::command]
pub async fn put_draft(store: State<'_, Store>, id: i32, base_version_id: i32, content: String) -> CmdResult<()> {
    on_store(&store, move |c| docs::put_draft(c, id, base_version_id, &content)).await
}

#[tauri::command]
pub async fn discard_draft(store: State<'_, Store>, id: i32) -> CmdResult<()> {
    on_store(&store, move |c| docs::discard_draft(c, id)).await
}

// ── Palettes ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_palettes(store: State<'_, Store>) -> CmdResult<Vec<Palette>> {
    on_store(&store, palettes::list).await
}

/// Saves a palette: its colours after transparent.
#[tauri::command]
pub async fn save_palette(store: State<'_, Store>, name: String, colours: Vec<String>) -> CmdResult<Palette> {
    on_store(&store, move |c| palettes::save(c, &name, &colours)).await
}

#[tauri::command]
pub async fn delete_palette(store: State<'_, Store>, id: i32) -> CmdResult<()> {
    on_store(&store, move |c| palettes::delete(c, id)).await
}

// ── Files opened from Finder ─────────────────────────────────────────────

/// Paths of files opened with linear (double-clicked, or dropped on its Dock
/// icon), waiting for the page to import them. They can arrive before the page
/// has loaded, so they're queued here and the page takes them when it's ready.
#[derive(Default)]
pub struct Opens(pub std::sync::Mutex<Vec<String>>);

#[tauri::command]
pub fn take_opened_files(opens: State<'_, Opens>) -> Vec<String> {
    std::mem::take(&mut *opens.0.lock().unwrap_or_else(|e| e.into_inner()))
}

// ── Files ────────────────────────────────────────────────────────────────

/// A file picked or dropped to import, read but not yet checked: the page
/// parses it with the kind's own reader, which says what's wrong in detail.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    /// The file's name without its extension.
    pub name: String,
    pub kind: Kind,
    pub text: String,
}

#[tauri::command]
pub async fn read_import(path: String) -> CmdResult<Import> {
    tauri::async_runtime::spawn_blocking(move || read_import_at(Path::new(&path)))
        .await
        .map_err(CmdError::internal)?
}

fn invalid(message: String) -> CmdError {
    CmdError { code: "invalid", message }
}

fn read_import_at(path: &Path) -> CmdResult<Import> {
    let file = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let kind = path
        .extension()
        .and_then(|e| e.to_str())
        .and_then(|e| Kind::parse(&e.to_lowercase()))
        .ok_or_else(|| invalid(format!("{file}: linear opens .lin, .lpx and .ldw files")))?;
    let max = if kind == Kind::Lin { docs::MAX_LIN } else { docs::MAX_CONTENT };
    let len = std::fs::metadata(path).map_err(|e| invalid(format!("{file}: {e}")))?.len();
    if len > max as u64 {
        return Err(invalid(format!("{file} is too big to open (over {} MiB)", max / (1024 * 1024))));
    }
    let bytes = std::fs::read(path).map_err(|e| invalid(format!("{file}: {e}")))?;
    let text = String::from_utf8(bytes).map_err(|_| invalid(format!("{file} isn't text, so it isn't a .{}", kind.as_str())))?;
    let name = path.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Imported".into());
    Ok(Import { name, kind, text })
}

/// Writes an export to a path the user picked in the save panel.
#[tauri::command]
pub async fn write_export(path: String, bytes: Vec<u8>) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || std::fs::write(&path, bytes).map_err(|e| invalid(format!("couldn't write {path}: {e}"))))
        .await
        .map_err(CmdError::internal)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_by_extension_and_size() {
        let dir = std::env::temp_dir().join(format!("linear-import-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let good = dir.join("Flow.LIN");
        std::fs::write(&good, "{\"lin\":1}").unwrap();
        let got = read_import_at(&good).unwrap();
        assert_eq!((got.name.as_str(), got.kind, got.text.as_str()), ("Flow", Kind::Lin, "{\"lin\":1}"));

        let other = dir.join("notes.txt");
        std::fs::write(&other, "hi").unwrap();
        assert!(read_import_at(&other).unwrap_err().message.contains(".lin, .lpx and .ldw"));

        let binary = dir.join("x.ldw");
        std::fs::write(&binary, [0xff, 0xfe, 0x00]).unwrap();
        assert!(read_import_at(&binary).unwrap_err().message.contains("isn't text"));

        let big = dir.join("big.lin");
        std::fs::write(&big, vec![b' '; docs::MAX_LIN + 1]).unwrap();
        assert!(read_import_at(&big).unwrap_err().message.contains("too big"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
