// Pixel-art palettes the user saved, to start new images with or load into
// one. A palette is its colours after transparent (which every image has as
// colour 0), each `#rrggbb` or `#rrggbbaa`, kept as lowercase `#rrggbbaa`.

use diesel::prelude::*;
use serde::Serialize;

use crate::schema::palettes;
use crate::{Error, Result, now_ms};

/// Colours after transparent: an image's palette holds 256 in all.
pub const MAX_COLOURS: usize = 255;
pub const MAX_NAME: usize = 60;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub id: i32,
    pub name: String,
    pub colours: Vec<String>,
    pub created_at: i64,
}

/// `#rgb`, `#rrggbb` or `#rrggbbaa` as lowercase `#rrggbbaa`.
fn normal(c: &str) -> Option<String> {
    let h = c.trim().strip_prefix('#')?.to_ascii_lowercase();
    if !h.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    match h.len() {
        3 => Some(format!("#{}ff", h.chars().flat_map(|c| [c, c]).collect::<String>())),
        6 => Some(format!("#{h}ff")),
        8 => Some(format!("#{h}")),
        _ => None,
    }
}

pub fn list(conn: &mut SqliteConnection) -> Result<Vec<Palette>> {
    let rows: Vec<(i32, String, String, i64)> = palettes::table
        .select((palettes::id, palettes::name, palettes::colors, palettes::created_at))
        .order((palettes::name.asc(), palettes::id.asc()))
        .load(conn)?;
    Ok(rows
        .into_iter()
        // A row that no longer reads (another version wrote it) is left out, not fatal.
        .filter_map(|(id, name, colors, created_at)| {
            serde_json::from_str::<Vec<String>>(&colors).ok().map(|colours| Palette { id, name, colours, created_at })
        })
        .collect())
}

pub fn save(conn: &mut SqliteConnection, name: &str, colours: &[String]) -> Result<Palette> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::Invalid("a palette needs a name".into()));
    }
    if name.chars().count() > MAX_NAME {
        return Err(Error::Invalid(format!("a palette's name can be at most {MAX_NAME} characters")));
    }
    if colours.is_empty() || colours.len() > MAX_COLOURS {
        return Err(Error::Invalid(format!("a palette has 1 to {MAX_COLOURS} colours")));
    }
    let colours = colours
        .iter()
        .map(|c| normal(c).ok_or_else(|| Error::Invalid(format!("not a colour: {c}"))))
        .collect::<Result<Vec<_>>>()?;
    let json = serde_json::to_string(&colours).expect("strings serialise");
    let created_at = now_ms();
    let id = diesel::insert_into(palettes::table)
        .values((palettes::name.eq(name), palettes::colors.eq(json), palettes::created_at.eq(created_at)))
        .returning(palettes::id)
        .get_result::<i32>(conn)?;
    Ok(Palette { id, name: name.to_string(), colours, created_at })
}

pub fn delete(conn: &mut SqliteConnection, id: i32) -> Result<()> {
    match diesel::delete(palettes::table.find(id)).execute(conn)? {
        0 => Err(Error::NotFound("palette")),
        _ => Ok(()),
    }
}
