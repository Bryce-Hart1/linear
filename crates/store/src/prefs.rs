// The user's preferences: one typed struct, its defaults in code, and one row
// per changed preference in the `prefs` table.
//
// A row's key is a dotted path into the struct's JSON form (`theme`,
// `lpx.defaultSize`, `ldw.pen` or `ldw.pen.color`), and its value is JSON.
// Reading starts from the defaults and lays each row over them in key order,
// so a parent row (`ldw.pen`) comes before its children (`ldw.pen.color`). A
// row that no longer fits (a preference this version doesn't have, or a value
// it can't accept) is skipped rather than failing the whole read. Writing
// checks the result first, so a bad value never reaches the table.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::schema::prefs;
use crate::{Error, Kind, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LibraryView {
    Grid,
    List,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LibrarySort {
    Updated,
    Created,
    Name,
}

/// Which mode a `.lin` opens in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LinMode {
    View,
    Edit,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub theme: Theme,
    pub library: LibraryPrefs,
    pub ui: UiPrefs,
    pub window: WindowPrefs,
    pub versions: VersionPrefs,
    pub draft: DraftPrefs,
    pub lin: LinPrefs,
    pub lpx: LpxPrefs,
    pub ldw: LdwPrefs,
    pub export: ExportPrefs,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPrefs {
    pub view: LibraryView,
    pub sort: LibrarySort,
    /// Show only this kind; `null` shows every kind.
    pub kind: Option<Kind>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiPrefs {
    pub sidebar_width: u32,
    pub sidebar_open: bool,
    pub inspector_open: bool,
    pub show_hints: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPrefs {
    /// Where the window was when it last moved or resized, in logical pixels.
    pub bounds: Option<Bounds>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionPrefs {
    /// How many saved versions of each document are kept.
    pub keep: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPrefs {
    /// How long after the last change unsaved work is written as a draft.
    pub delay_ms: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinPrefs {
    pub open_in: LinMode,
    pub play_on_open: bool,
    pub grid: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LpxPrefs {
    /// Width and height of a new pixel-art canvas.
    pub default_size: [u32; 2],
    /// A built-in palette's name, or `saved:<id>` for one in the library.
    pub default_palette: String,
    pub show_grid: bool,
    pub export_scale: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LdwPrefs {
    /// Width and height of a new drawing's page.
    pub page: [u32; 2],
    pub pen: Pen,
    /// How much the pen steadies a stroke: 0 (raw input) to 1 (heavy).
    pub smoothing: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pen {
    /// `#rrggbb`.
    pub color: String,
    pub width: f64,
    /// 1–100.
    pub opacity: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPrefs {
    /// The folder the last export went to.
    pub last_dir: Option<String>,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            theme: Theme::System,
            library: LibraryPrefs { view: LibraryView::Grid, sort: LibrarySort::Updated, kind: None },
            ui: UiPrefs { sidebar_width: 240, sidebar_open: true, inspector_open: true, show_hints: true },
            window: WindowPrefs { bounds: None },
            versions: VersionPrefs { keep: 50 },
            draft: DraftPrefs { delay_ms: 2000 },
            lin: LinPrefs { open_in: LinMode::View, play_on_open: true, grid: false },
            lpx: LpxPrefs {
                default_size: [32, 32],
                default_palette: "linear16".into(),
                show_grid: true,
                export_scale: 8,
            },
            ldw: LdwPrefs {
                page: [1600, 1000],
                pen: Pen { color: "#111111".into(), width: 3.0, opacity: 100 },
                smoothing: 0.5,
            },
            export: ExportPrefs { last_dir: None },
        }
    }
}

impl Prefs {
    /// The ranges serde's types can't say. `Err` names the first thing out of range.
    pub fn validate(&self) -> std::result::Result<(), String> {
        fn within<T: PartialOrd + std::fmt::Display>(name: &str, v: T, lo: T, hi: T) -> std::result::Result<(), String> {
            if v >= lo && v <= hi { Ok(()) } else { Err(format!("{name} must be {lo}–{hi}, not {v}")) }
        }
        within("ui.sidebarWidth", self.ui.sidebar_width, 160, 480)?;
        within("versions.keep", self.versions.keep, 1, 1000)?;
        within("draft.delayMs", self.draft.delay_ms, 250, 60_000)?;
        for v in self.lpx.default_size {
            within("lpx.defaultSize", v, 1, 512)?;
        }
        if self.lpx.default_palette.trim().is_empty() {
            return Err("lpx.defaultPalette can't be empty".into());
        }
        within("lpx.exportScale", self.lpx.export_scale, 1, 32)?;
        for v in self.ldw.page {
            within("ldw.page", v, 200, 8000)?;
        }
        if !is_hex_rgb(&self.ldw.pen.color) {
            return Err(format!("ldw.pen.color must be #rrggbb, not {}", self.ldw.pen.color));
        }
        within("ldw.pen.width", self.ldw.pen.width, 0.5, 64.0)?;
        within("ldw.pen.opacity", self.ldw.pen.opacity, 1, 100)?;
        within("ldw.smoothing", self.ldw.smoothing, 0.0, 1.0)?;
        if let Some(b) = self.window.bounds
            && (!(b.w.is_finite() && b.h.is_finite() && b.x.is_finite() && b.y.is_finite()) || b.w < 100.0 || b.h < 100.0)
        {
            return Err("window.bounds must be finite and at least 100 × 100".into());
        }
        Ok(())
    }
}

fn is_hex_rgb(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

/// `a.bC.d`: letters only, dot-separated. Anything else can't name a preference.
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.split('.').all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_alphabetic()))
}

/// Puts `value` at `path` inside `node`, but only where the defaults already
/// have something: a preference that doesn't exist can't be created.
fn set_path(node: &mut Value, path: &[&str], value: Value) -> bool {
    let Some((first, rest)) = path.split_first() else { return false };
    let Some(child) = node.as_object_mut().and_then(|m| m.get_mut(*first)) else { return false };
    if rest.is_empty() {
        *child = value;
        true
    } else {
        set_path(child, rest, value)
    }
}

fn parse(tree: &Value) -> std::result::Result<Prefs, String> {
    let prefs: Prefs = serde_json::from_value(tree.clone()).map_err(|e| e.to_string())?;
    prefs.validate()?;
    Ok(prefs)
}

fn defaults_tree() -> Value {
    serde_json::to_value(Prefs::default()).expect("the defaults always serialise")
}

/// The defaults with every stored row that still fits laid over them.
pub fn get(conn: &mut SqliteConnection) -> Result<Prefs> {
    let rows: Vec<(String, String)> =
        prefs::table.select((prefs::key, prefs::value)).order(prefs::key.asc()).load(conn)?;
    let mut tree = defaults_tree();
    for (key, raw) in rows {
        let Ok(value) = serde_json::from_str::<Value>(&raw) else { continue };
        let mut trial = tree.clone();
        let path: Vec<&str> = key.split('.').collect();
        if set_path(&mut trial, &path, value) && parse(&trial).is_ok() {
            tree = trial;
        }
    }
    Ok(parse(&tree).expect("every step was checked"))
}

/// Sets one preference (or a whole group, like `ldw.pen`) and returns them all.
pub fn set(conn: &mut SqliteConnection, key: &str, value: Value) -> Result<Prefs> {
    if !valid_key(key) {
        return Err(Error::Invalid(format!("no preference called {key:?}")));
    }
    conn.immediate_transaction(|conn| {
        let mut tree = serde_json::to_value(get(conn)?).expect("prefs always serialise");
        let path: Vec<&str> = key.split('.').collect();
        if !set_path(&mut tree, &path, value.clone()) {
            return Err(Error::Invalid(format!("no preference called {key:?}")));
        }
        parse(&tree).map_err(|e| Error::Invalid(format!("{key}: {e}")))?;
        // This row now decides everything under it.
        diesel::delete(prefs::table.filter(prefs::key.eq(key).or(prefs::key.like(format!("{key}.%"))))).execute(conn)?;
        diesel::insert_into(prefs::table)
            .values((prefs::key.eq(key), prefs::value.eq(value.to_string())))
            .execute(conn)?;
        get(conn)
    })
}

/// Puts one preference (and everything under it) back to its default.
pub fn reset(conn: &mut SqliteConnection, key: &str) -> Result<Prefs> {
    if !valid_key(key) {
        return Err(Error::Invalid(format!("no preference called {key:?}")));
    }
    diesel::delete(prefs::table.filter(prefs::key.eq(key).or(prefs::key.like(format!("{key}.%"))))).execute(conn)?;
    get(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        Prefs::default().validate().unwrap();
    }

    #[test]
    fn keys_are_dotted_letters() {
        assert!(valid_key("theme"));
        assert!(valid_key("ldw.pen.color"));
        assert!(!valid_key(""));
        assert!(!valid_key("ldw..pen"));
        assert!(!valid_key("ldw.pen%"));
        assert!(!valid_key("a_b"));
    }

    #[test]
    fn set_path_only_reaches_existing_keys() {
        let mut tree = defaults_tree();
        assert!(set_path(&mut tree, &["ldw", "pen", "color"], Value::from("#ff0000")));
        assert!(!set_path(&mut tree, &["ldw", "pen", "colour"], Value::from("#ff0000")));
        assert!(!set_path(&mut tree, &["window", "bounds", "x"], Value::from(1)));
    }
}
