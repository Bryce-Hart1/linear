// The native menu bar. Every item of linear's own sends its id to the page as
// a `menu` event, and src/lib/menu-router.ts decides what it means there: the
// focused text field gets Undo or Select All as text editing, otherwise the
// open editor or the library acts. Cut, Copy and Paste are the system's own
// items, so text fields keep their native behaviour; while nothing is selected
// in the page they're disabled, and the key reaches the canvas as a keydown.
//
// The ids here are the contract with menu-router.ts.

use tauri::menu::{Menu, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accel: Option<&str>) -> tauri::Result<MenuItem<R>> {
    let mut b = MenuItemBuilder::with_id(id, label);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    b.build(app)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "linear")
        .about(None)
        .separator()
        .item(&item(app, "settings", "Settings…", Some("CmdOrCtrl+Comma"))?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "new.lin", "New Diagram", Some("CmdOrCtrl+N"))?)
        .item(&item(app, "new.lpx", "New Pixel Art", None)?)
        .item(&item(app, "new.ldw", "New Drawing", None)?)
        .separator()
        .item(&item(app, "import", "Import…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item(app, "save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "export", "Export…", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&item(app, "close", "Close", Some("CmdOrCtrl+W"))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&item(app, "duplicate", "Duplicate", Some("CmdOrCtrl+D"))?)
        // No key: Backspace and Delete stay with the page, or text fields would lose them.
        .item(&item(app, "delete", "Delete", None)?)
        .separator()
        .item(&item(app, "selectAll", "Select All", Some("CmdOrCtrl+A"))?)
        .build()?;

    let theme = SubmenuBuilder::new(app, "Theme")
        .item(&item(app, "theme.system", "Match System", None)?)
        .item(&item(app, "theme.light", "Light", None)?)
        .item(&item(app, "theme.dark", "Dark", None)?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "zoom.in", "Zoom In", Some("CmdOrCtrl+Equal"))?)
        .item(&item(app, "zoom.out", "Zoom Out", Some("CmdOrCtrl+Minus"))?)
        .item(&item(app, "zoom.fit", "Zoom to Fit", Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&item(app, "toggle.sidebar", "Show/Hide Sidebar", Some("CmdOrCtrl+Backslash"))?)
        .item(&item(app, "toggle.inspector", "Show/Hide Inspector", Some("CmdOrCtrl+Alt+I"))?)
        .separator()
        .item(&theme)
        .separator()
        .fullscreen()
        .build()?;

    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().build()?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&item(app, "help.shortcuts", "Keyboard Shortcuts", Some("CmdOrCtrl+Slash"))?)
        .build()?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window, &help])
}
