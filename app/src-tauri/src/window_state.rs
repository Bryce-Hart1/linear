// The window opens where it was last closed. Its bounds are a preference
// (`window.bounds`, in logical pixels) like any other, kept in the library.
// The window starts hidden (tauri.conf.json) and is shown once it is in place,
// so it never jumps.

use linear_store::Store;
use linear_store::prefs::Bounds;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewWindow};

/// Moves and sizes `window` to the saved bounds, if they still land on a screen, then shows it.
pub fn restore(window: &WebviewWindow, store: &Store) {
    if let Some(b) = store.prefs().ok().and_then(|p| p.window.bounds) {
        let _ = window.set_size(LogicalSize::new(b.w, b.h));
        if on_a_monitor(window, &b) {
            let _ = window.set_position(LogicalPosition::new(b.x, b.y));
        }
    }
    let _ = window.show();
}

/// Writes where `window` is now. Called when it closes and when the app quits.
pub fn save(window: &WebviewWindow) {
    let Some(store) = window.try_state::<Store>() else { return };
    let (Ok(pos), Ok(size), Ok(scale)) = (window.outer_position(), window.inner_size(), window.scale_factor()) else {
        return;
    };
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let pos = pos.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    let bounds = Bounds { x: pos.x, y: pos.y, w: size.width, h: size.height };
    if let Ok(value) = serde_json::to_value(bounds) {
        let _ = store.set_pref("window.bounds", value);
    }
}

/// Whether the window's title strip would be on some monitor (a screen may have been unplugged).
fn on_a_monitor(window: &WebviewWindow, b: &Bounds) -> bool {
    let Ok(monitors) = window.available_monitors() else { return false };
    monitors.iter().any(|m| {
        let scale = m.scale_factor();
        let pos = m.position().to_logical::<f64>(scale);
        let size = m.size().to_logical::<f64>(scale);
        let (cx, cy) = (b.x + b.w / 2.0, b.y + 10.0);
        cx >= pos.x && cx < pos.x + size.width && cy >= pos.y && cy < pos.y + size.height
    })
}
