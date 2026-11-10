// Folders: a tree, one level inside another. Names are unique among a
// folder's siblings, ignoring case. Deleting a folder deletes the folders in
// it, and moves every document from all of them up into the deleted folder's
// parent, so nothing a user made disappears with a folder.

use std::collections::HashMap;

use diesel::prelude::*;
use diesel::sqlite::Sqlite;
use serde::Serialize;

use crate::schema::{documents, folders};
use crate::{Error, Result, now_ms};

#[derive(Debug, Clone, PartialEq, Serialize, Queryable)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i32,
    pub parent_id: Option<i32>,
    pub name: String,
    pub created_at: i64,
}

const COLUMNS: (folders::id, folders::parent_id, folders::name, folders::created_at) =
    (folders::id, folders::parent_id, folders::name, folders::created_at);

/// Every folder, by name. The page builds the tree from `parent_id`.
pub fn list(conn: &mut SqliteConnection) -> Result<Vec<Folder>> {
    let mut all: Vec<Folder> = folders::table.select(COLUMNS).load(conn)?;
    all.sort_by_cached_key(|f| (f.name.to_lowercase(), f.id));
    Ok(all)
}

pub fn get(conn: &mut SqliteConnection, id: i32) -> Result<Folder> {
    folders::table.find(id).select(COLUMNS).first(conn).optional()?.ok_or(Error::NotFound("folder"))
}

fn clean_name(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::Invalid("a folder's name can't be empty".into()));
    }
    if name.chars().count() > crate::docs::MAX_NAME {
        return Err(Error::Invalid(format!("a folder's name can be at most {} characters", crate::docs::MAX_NAME)));
    }
    if name.chars().any(|c| c == '/' || c == ':' || c.is_control()) {
        return Err(Error::Invalid("a folder's name can't contain / or :".into()));
    }
    Ok(name.to_string())
}

/// Refuses `name` if a sibling under `parent` (other than `except`) already has it.
fn check_free(conn: &mut SqliteConnection, parent: Option<i32>, name: &str, except: Option<i32>) -> Result<()> {
    let mut q = folders::table.select((folders::id, folders::name)).into_boxed::<Sqlite>();
    q = match parent {
        Some(p) => q.filter(folders::parent_id.eq(p)),
        None => q.filter(folders::parent_id.is_null()),
    };
    let rows: Vec<(i32, String)> = q.load(conn)?;
    if rows.iter().any(|(id, n)| Some(*id) != except && n.to_lowercase() == name.to_lowercase()) {
        return Err(Error::Invalid(format!("there's already a folder called {name:?} here")));
    }
    Ok(())
}

pub fn create(conn: &mut SqliteConnection, parent: Option<i32>, name: &str) -> Result<Folder> {
    let name = clean_name(name)?;
    crate::write(conn, |conn| {
        if let Some(p) = parent {
            get(conn, p)?;
        }
        check_free(conn, parent, &name, None)?;
        let id = diesel::insert_into(folders::table)
            .values((folders::parent_id.eq(parent), folders::name.eq(&name), folders::created_at.eq(now_ms())))
            .returning(folders::id)
            .get_result::<i32>(conn)?;
        get(conn, id)
    })
}

pub fn rename(conn: &mut SqliteConnection, id: i32, name: &str) -> Result<Folder> {
    let name = clean_name(name)?;
    crate::write(conn, |conn| {
        let f = get(conn, id)?;
        check_free(conn, f.parent_id, &name, Some(id))?;
        diesel::update(folders::table.find(id)).set(folders::name.eq(&name)).execute(conn)?;
        get(conn, id)
    })
}

/// `id` and every folder inside it, at any depth.
fn subtree(conn: &mut SqliteConnection, id: i32) -> Result<Vec<i32>> {
    let all: Vec<(i32, Option<i32>)> = folders::table.select((folders::id, folders::parent_id)).load(conn)?;
    let mut children: HashMap<i32, Vec<i32>> = HashMap::new();
    for (child, parent) in all {
        if let Some(p) = parent {
            children.entry(p).or_default().push(child);
        }
    }
    let mut out = vec![id];
    let mut i = 0;
    while i < out.len() {
        if let Some(c) = children.get(&out[i]) {
            out.extend(c);
        }
        i += 1;
    }
    Ok(out)
}

/// Moves a folder into `parent` (none: to the top). It can't go inside itself.
pub fn move_to(conn: &mut SqliteConnection, id: i32, parent: Option<i32>) -> Result<Folder> {
    crate::write(conn, |conn| {
        let f = get(conn, id)?;
        if let Some(p) = parent {
            get(conn, p)?;
            if subtree(conn, id)?.contains(&p) {
                return Err(Error::Invalid(format!("{} can't go inside itself", f.name)));
            }
        }
        if f.parent_id == parent {
            return Ok(f);
        }
        check_free(conn, parent, &f.name, Some(id))?;
        diesel::update(folders::table.find(id)).set(folders::parent_id.eq(parent)).execute(conn)?;
        get(conn, id)
    })
}

/// Deletes a folder and the folders inside it. Their documents (those in the
/// Trash too) move up into its parent, renamed where a name is taken there.
/// Returns how many documents moved.
pub fn delete(conn: &mut SqliteConnection, id: i32) -> Result<usize> {
    crate::write(conn, |conn| {
        let f = get(conn, id)?;
        let gone = subtree(conn, id)?;
        let docs: Vec<i32> = documents::table
            .filter(documents::folder_id.eq_any(&gone))
            .order(documents::id.asc())
            .select(documents::id)
            .load(conn)?;
        for doc in &docs {
            crate::docs::move_to(conn, *doc, f.parent_id)?;
        }
        diesel::delete(folders::table.find(id)).execute(conn)?;
        Ok(docs.len())
    })
}
