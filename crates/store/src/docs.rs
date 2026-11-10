// Documents, their versions, drafts and the Trash.
//
// A document is a row in `documents` (its name, kind, folder, thumbnail) and
// its content lives in `versions`, newest id first: the newest is what the
// document is now. Saving appends a version and prunes old ones past
// `versions.keep`; restoring an old version appends a copy of it, so history
// is never rewritten. A draft is unsaved work, written a moment after each
// change and dropped when the document is saved.
//
// Names are unique within a folder, ignoring case, among documents not in the
// Trash. Renaming to a taken name is refused; creating, duplicating, moving
// and restoring pick the next free name ("Plan 2") instead, so they never fail
// for that reason.

use diesel::prelude::*;
use diesel::sqlite::Sqlite;
use serde::{Deserialize, Serialize};

use crate::prefs::LibrarySort;
use crate::schema::{documents, drafts, folders, versions};
use crate::{Error, Kind, Result, now_ms, prefs};

/// The most a document's content may be.
pub const MAX_CONTENT: usize = 16 * 1024 * 1024;
/// …and a `.lin`'s, the most drawBridge will open as a diagram.
pub const MAX_LIN: usize = 1024 * 1024;
pub const MAX_THUMBNAIL: usize = 512 * 1024;
pub const MAX_NAME: usize = 120;

/// What the library shows for a document.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMeta {
    pub id: i32,
    pub folder_id: Option<i32>,
    pub name: String,
    pub kind: Kind,
    pub has_thumbnail: bool,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub opened_at: Option<i64>,
    pub trashed_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    pub id: i32,
    pub bytes: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub base_version_id: i32,
    pub content: String,
    pub updated_at: i64,
}

/// A document opened for editing: its newest version, and unsaved work if there is any.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub meta: DocMeta,
    pub version: VersionMeta,
    pub content: String,
    pub draft: Option<Draft>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum Saved {
    Saved { meta: DocMeta, version: VersionMeta },
    /// The content is what the newest version already holds.
    Unchanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum View {
    /// Everything not in the Trash.
    #[default]
    All,
    /// Opened at some point, most recently opened first.
    Recent,
    Pinned,
    Trash,
    /// One folder's documents (`folder`; none means those in no folder).
    Folder,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Query {
    pub view: View,
    pub folder: Option<i32>,
    pub kind: Option<Kind>,
    /// Part of a name, any case.
    pub search: Option<String>,
    pub sort: Option<LibrarySort>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDoc {
    pub name: String,
    pub kind: Kind,
    pub folder: Option<i32>,
    pub content: String,
    #[serde(default)]
    pub thumbnail: Option<Vec<u8>>,
}

/// How many documents are recent.
const RECENT: i64 = 50;

macro_rules! meta_columns {
    () => {
        (
            documents::id,
            documents::folder_id,
            documents::name,
            documents::kind,
            documents::thumbnail.is_not_null(),
            documents::pinned,
            documents::created_at,
            documents::updated_at,
            documents::opened_at,
            documents::trashed_at,
        )
    };
}

type MetaRow = (i32, Option<i32>, String, String, bool, bool, i64, i64, Option<i64>, Option<i64>);

fn to_meta(r: MetaRow) -> Result<DocMeta> {
    let kind = Kind::parse(&r.3).ok_or_else(|| Error::Invalid(format!("document {} has an unknown kind {:?}", r.0, r.3)))?;
    Ok(DocMeta {
        id: r.0,
        folder_id: r.1,
        name: r.2,
        kind,
        has_thumbnail: r.4,
        pinned: r.5,
        created_at: r.6,
        updated_at: r.7,
        opened_at: r.8,
        trashed_at: r.9,
    })
}

pub fn meta(conn: &mut SqliteConnection, id: i32) -> Result<DocMeta> {
    let row: Option<MetaRow> = documents::table.find(id).select(meta_columns!()).first(conn).optional()?;
    to_meta(row.ok_or(Error::NotFound("document"))?)
}

pub fn list(conn: &mut SqliteConnection, q: &Query) -> Result<Vec<DocMeta>> {
    let mut sel = documents::table.select(meta_columns!()).into_boxed::<Sqlite>();
    sel = match q.view {
        View::All => sel.filter(documents::trashed_at.is_null()),
        View::Recent => sel.filter(documents::trashed_at.is_null()).filter(documents::opened_at.is_not_null()),
        View::Pinned => sel.filter(documents::trashed_at.is_null()).filter(documents::pinned.eq(true)),
        View::Trash => sel.filter(documents::trashed_at.is_not_null()),
        View::Folder => {
            let sel = sel.filter(documents::trashed_at.is_null());
            match q.folder {
                Some(f) => sel.filter(documents::folder_id.eq(f)),
                None => sel.filter(documents::folder_id.is_null()),
            }
        }
    };
    if let Some(kind) = q.kind {
        sel = sel.filter(documents::kind.eq(kind.as_str()));
    }
    if let Some(s) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        sel = sel.filter(documents::name.like(format!("%{}%", escape_like(s))).escape('\\'));
    }
    sel = match q.view {
        View::Recent => sel.order((documents::opened_at.desc(), documents::id.desc())).limit(RECENT),
        View::Trash => sel.order((documents::trashed_at.desc(), documents::id.desc())),
        _ => match q.sort.unwrap_or(LibrarySort::Updated) {
            LibrarySort::Created => sel.order((documents::created_at.desc(), documents::id.desc())),
            // Sorted by name below, ignoring case.
            LibrarySort::Updated | LibrarySort::Name => sel.order((documents::updated_at.desc(), documents::id.desc())),
        },
    };
    let mut out = sel.load::<MetaRow>(conn)?.into_iter().map(to_meta).collect::<Result<Vec<_>>>()?;
    if q.sort == Some(LibrarySort::Name) && !matches!(q.view, View::Recent | View::Trash) {
        out.sort_by_cached_key(|d| (d.name.to_lowercase(), d.id));
    }
    Ok(out)
}

fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

// ── Names ────────────────────────────────────────────────────────────────

/// A name as typed, made fit to keep: trimmed, without its own kind's
/// extension, and refused if it's empty, too long, or has a character a file
/// name can't (/ or :) or a control character.
pub fn clean_name(name: &str, kind: Kind) -> Result<String> {
    let mut name = name.trim();
    let ext = format!(".{}", kind.as_str());
    if name.len() > ext.len() && name.to_lowercase().ends_with(&ext) {
        name = name[..name.len() - ext.len()].trim_end();
    }
    if name.is_empty() {
        return Err(Error::Invalid("a name can't be empty".into()));
    }
    if name.chars().count() > MAX_NAME {
        return Err(Error::Invalid(format!("a name can be at most {MAX_NAME} characters")));
    }
    if name.chars().any(|c| c == '/' || c == ':' || c.is_control()) {
        return Err(Error::Invalid("a name can't contain / or :".into()));
    }
    Ok(name.to_string())
}

/// The lowercased names of the documents in `folder` (not in the Trash), leaving out `except`.
fn names_in(conn: &mut SqliteConnection, folder: Option<i32>, except: Option<i32>) -> Result<Vec<String>> {
    let mut q = documents::table
        .filter(documents::trashed_at.is_null())
        .select((documents::id, documents::name))
        .into_boxed::<Sqlite>();
    q = match folder {
        Some(f) => q.filter(documents::folder_id.eq(f)),
        None => q.filter(documents::folder_id.is_null()),
    };
    let rows: Vec<(i32, String)> = q.load(conn)?;
    Ok(rows.into_iter().filter(|(id, _)| Some(*id) != except).map(|(_, n)| n.to_lowercase()).collect())
}

/// `wanted` if no other document in `folder` has it, else the first of "wanted 2", "wanted 3", … that's free.
fn free_name(conn: &mut SqliteConnection, folder: Option<i32>, wanted: &str, except: Option<i32>) -> Result<String> {
    let taken = names_in(conn, folder, except)?;
    if !taken.contains(&wanted.to_lowercase()) {
        return Ok(wanted.to_string());
    }
    // Keep "Plan 2" from becoming "Plan 2 2": count on from a number already there.
    let (stem, start) = match wanted.rsplit_once(' ') {
        Some((stem, n)) if n.parse::<u32>().is_ok_and(|n| n >= 2) => (stem, n.parse::<u32>().unwrap() + 1),
        _ => (wanted, 2),
    };
    (start..start + 10_000)
        .map(|n| format!("{stem} {n}"))
        .find(|n| !taken.contains(&n.to_lowercase()))
        .ok_or_else(|| Error::Invalid(format!("too many documents called {wanted:?} here")))
}

fn check_folder(conn: &mut SqliteConnection, folder: Option<i32>) -> Result<()> {
    if let Some(f) = folder {
        let n: i64 = folders::table.filter(folders::id.eq(f)).count().get_result(conn)?;
        if n == 0 {
            return Err(Error::NotFound("folder"));
        }
    }
    Ok(())
}

fn check_content(kind: Kind, content: &str) -> Result<()> {
    let max = if kind == Kind::Lin { MAX_LIN } else { MAX_CONTENT };
    if content.len() > max {
        return Err(Error::Invalid(format!("too big: a {} can be at most {} MiB", kind.as_str(), max / (1024 * 1024))));
    }
    Ok(())
}

fn check_thumbnail(thumb: &Option<Vec<u8>>) -> Result<()> {
    match thumb {
        Some(t) if t.len() > MAX_THUMBNAIL => Err(Error::Invalid("thumbnail too big".into())),
        _ => Ok(()),
    }
}

// ── Making, saving, opening ──────────────────────────────────────────────

fn add_version(conn: &mut SqliteConnection, doc: i32, content: &str, at: i64) -> Result<VersionMeta> {
    let bytes = content.len() as i64;
    let id = diesel::insert_into(versions::table)
        .values((
            versions::document_id.eq(doc),
            versions::content.eq(content),
            versions::bytes.eq(bytes),
            versions::created_at.eq(at),
        ))
        .returning(versions::id)
        .get_result::<i32>(conn)?;
    Ok(VersionMeta { id, bytes, created_at: at })
}

/// The newest version: what the document is now.
fn head(conn: &mut SqliteConnection, doc: i32) -> Result<(VersionMeta, String)> {
    let row: Option<(i32, i64, i64, String)> = versions::table
        .filter(versions::document_id.eq(doc))
        .order(versions::id.desc())
        .select((versions::id, versions::bytes, versions::created_at, versions::content))
        .first(conn)
        .optional()?;
    let (id, bytes, created_at, content) = row.ok_or(Error::NotFound("version"))?;
    Ok((VersionMeta { id, bytes, created_at }, content))
}

/// Keeps only the newest `keep` versions of `doc`.
fn prune(conn: &mut SqliteConnection, doc: i32, keep: u32) -> Result<()> {
    let kept: Vec<i32> = versions::table
        .filter(versions::document_id.eq(doc))
        .order(versions::id.desc())
        .limit(keep.max(1) as i64)
        .select(versions::id)
        .load(conn)?;
    diesel::delete(versions::table.filter(versions::document_id.eq(doc)).filter(versions::id.ne_all(kept))).execute(conn)?;
    Ok(())
}

pub fn create(conn: &mut SqliteConnection, new: &NewDoc) -> Result<DocMeta> {
    check_content(new.kind, &new.content)?;
    check_thumbnail(&new.thumbnail)?;
    let name = clean_name(&new.name, new.kind)?;
    crate::write(conn, |conn| {
        check_folder(conn, new.folder)?;
        let name = free_name(conn, new.folder, &name, None)?;
        let now = now_ms();
        let id = diesel::insert_into(documents::table)
            .values((
                documents::folder_id.eq(new.folder),
                documents::name.eq(&name),
                documents::kind.eq(new.kind.as_str()),
                documents::thumbnail.eq(&new.thumbnail),
                documents::created_at.eq(now),
                documents::updated_at.eq(now),
            ))
            .returning(documents::id)
            .get_result::<i32>(conn)?;
        add_version(conn, id, &new.content, now)?;
        meta(conn, id)
    })
}

/// Opens a document: its newest version and any draft. Opening one that
/// isn't in the Trash makes it the most recent.
pub fn open(conn: &mut SqliteConnection, id: i32) -> Result<Opened> {
    crate::write(conn, |conn| {
        diesel::update(documents::table.find(id).filter(documents::trashed_at.is_null()))
            .set(documents::opened_at.eq(now_ms()))
            .execute(conn)?;
        let meta = meta(conn, id)?;
        let (version, content) = head(conn, id)?;
        let draft = drafts::table
            .find(id)
            .select((drafts::base_version_id, drafts::content, drafts::updated_at))
            .first::<(i32, String, i64)>(conn)
            .optional()?
            .map(|(base_version_id, content, updated_at)| Draft { base_version_id, content, updated_at });
        Ok(Opened { meta, version, content, draft })
    })
}

/// Saves `content` as a new version, with the thumbnail drawn from it, and drops the draft.
pub fn save(conn: &mut SqliteConnection, id: i32, content: &str, thumbnail: Option<Vec<u8>>) -> Result<Saved> {
    check_thumbnail(&thumbnail)?;
    crate::write(conn, |conn| {
        let m = meta(conn, id)?;
        if m.trashed_at.is_some() {
            return Err(Error::Invalid(format!("{} is in the Trash; put it back to save it", m.name)));
        }
        check_content(m.kind, content)?;
        let (_, current) = head(conn, id)?;
        if current == content {
            diesel::delete(drafts::table.find(id)).execute(conn)?;
            return Ok(Saved::Unchanged);
        }
        let now = now_ms();
        let version = add_version(conn, id, content, now)?;
        diesel::update(documents::table.find(id))
            .set((documents::updated_at.eq(now), documents::thumbnail.eq(&thumbnail)))
            .execute(conn)?;
        diesel::delete(drafts::table.find(id)).execute(conn)?;
        let keep = prefs::get(conn)?.versions.keep;
        prune(conn, id, keep)?;
        Ok(Saved::Saved { meta: meta(conn, id)?, version })
    })
}

pub fn put_draft(conn: &mut SqliteConnection, id: i32, base_version_id: i32, content: &str) -> Result<()> {
    let m = meta(conn, id)?;
    check_content(m.kind, content)?;
    diesel::replace_into(drafts::table)
        .values((
            drafts::document_id.eq(id),
            drafts::base_version_id.eq(base_version_id),
            drafts::content.eq(content),
            drafts::updated_at.eq(now_ms()),
        ))
        .execute(conn)?;
    Ok(())
}

pub fn discard_draft(conn: &mut SqliteConnection, id: i32) -> Result<()> {
    diesel::delete(drafts::table.find(id)).execute(conn)?;
    Ok(())
}

/// The newest saved content, without marking the document opened (for exporting).
pub fn content(conn: &mut SqliteConnection, id: i32) -> Result<String> {
    meta(conn, id)?;
    Ok(head(conn, id)?.1)
}

pub fn thumbnail(conn: &mut SqliteConnection, id: i32) -> Result<Option<Vec<u8>>> {
    Ok(documents::table.find(id).select(documents::thumbnail).first::<Option<Vec<u8>>>(conn).optional()?.flatten())
}

// ── Organising ───────────────────────────────────────────────────────────

pub fn rename(conn: &mut SqliteConnection, id: i32, name: &str) -> Result<DocMeta> {
    crate::write(conn, |conn| {
        let m = meta(conn, id)?;
        let name = clean_name(name, m.kind)?;
        if m.trashed_at.is_none() && names_in(conn, m.folder_id, Some(id))?.contains(&name.to_lowercase()) {
            return Err(Error::Invalid(format!("there's already a document called {name:?} here")));
        }
        diesel::update(documents::table.find(id)).set(documents::name.eq(&name)).execute(conn)?;
        meta(conn, id)
    })
}

/// Moves a document into `folder` (none: out of every folder).
pub fn move_to(conn: &mut SqliteConnection, id: i32, folder: Option<i32>) -> Result<DocMeta> {
    crate::write(conn, |conn| {
        let m = meta(conn, id)?;
        check_folder(conn, folder)?;
        if m.folder_id == folder {
            return Ok(m);
        }
        let name = if m.trashed_at.is_none() { free_name(conn, folder, &m.name, Some(id))? } else { m.name };
        diesel::update(documents::table.find(id))
            .set((documents::folder_id.eq(folder), documents::name.eq(name)))
            .execute(conn)?;
        meta(conn, id)
    })
}

/// A new document beside the original, with its newest content and thumbnail.
pub fn duplicate(conn: &mut SqliteConnection, id: i32) -> Result<DocMeta> {
    crate::write(conn, |conn| {
        let m = meta(conn, id)?;
        let content = head(conn, id)?.1;
        let thumbnail = thumbnail(conn, id)?;
        create(conn, &NewDoc { name: format!("{} copy", m.name), kind: m.kind, folder: m.folder_id, content, thumbnail })
    })
}

pub fn set_pinned(conn: &mut SqliteConnection, id: i32, pinned: bool) -> Result<DocMeta> {
    meta(conn, id)?;
    diesel::update(documents::table.find(id)).set(documents::pinned.eq(pinned)).execute(conn)?;
    meta(conn, id)
}

pub fn trash(conn: &mut SqliteConnection, id: i32) -> Result<DocMeta> {
    meta(conn, id)?;
    diesel::update(documents::table.find(id).filter(documents::trashed_at.is_null()))
        .set(documents::trashed_at.eq(now_ms()))
        .execute(conn)?;
    meta(conn, id)
}

/// Takes a document out of the Trash, back into its folder (or out of every
/// folder, if its folder has gone), under a free name.
pub fn restore(conn: &mut SqliteConnection, id: i32) -> Result<DocMeta> {
    crate::write(conn, |conn| {
        let m = meta(conn, id)?;
        if m.trashed_at.is_none() {
            return Ok(m);
        }
        let name = free_name(conn, m.folder_id, &m.name, Some(id))?;
        diesel::update(documents::table.find(id))
            .set((documents::trashed_at.eq(None::<i64>), documents::name.eq(name)))
            .execute(conn)?;
        meta(conn, id)
    })
}

/// Deletes a document in the Trash, with all its versions, for good.
pub fn delete_forever(conn: &mut SqliteConnection, id: i32) -> Result<()> {
    let m = meta(conn, id)?;
    if m.trashed_at.is_none() {
        return Err(Error::Invalid(format!("{} isn't in the Trash", m.name)));
    }
    diesel::delete(documents::table.find(id)).execute(conn)?;
    Ok(())
}

/// Deletes everything in the Trash for good. Returns how many documents went.
pub fn empty_trash(conn: &mut SqliteConnection) -> Result<usize> {
    Ok(diesel::delete(documents::table.filter(documents::trashed_at.is_not_null())).execute(conn)?)
}

// ── Versions ─────────────────────────────────────────────────────────────

pub fn list_versions(conn: &mut SqliteConnection, id: i32) -> Result<Vec<VersionMeta>> {
    meta(conn, id)?;
    let rows: Vec<(i32, i64, i64)> = versions::table
        .filter(versions::document_id.eq(id))
        .order(versions::id.desc())
        .select((versions::id, versions::bytes, versions::created_at))
        .load(conn)?;
    Ok(rows.into_iter().map(|(id, bytes, created_at)| VersionMeta { id, bytes, created_at }).collect())
}

pub fn read_version(conn: &mut SqliteConnection, version: i32) -> Result<String> {
    versions::table
        .find(version)
        .select(versions::content)
        .first(conn)
        .optional()?
        .ok_or(Error::NotFound("version"))
}

/// Makes an old version the newest again, by copying it to the top, with a
/// thumbnail drawn from it. The versions in between stay.
pub fn restore_version(conn: &mut SqliteConnection, version: i32, thumbnail: Option<Vec<u8>>) -> Result<Saved> {
    let doc: i32 = versions::table
        .find(version)
        .select(versions::document_id)
        .first(conn)
        .optional()?
        .ok_or(Error::NotFound("version"))?;
    let content = read_version(conn, version)?;
    save(conn, doc, &content, thumbnail)
}
