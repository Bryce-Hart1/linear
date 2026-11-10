// linear's library, kept in one SQLite file through Diesel.
//
// `Store` owns a small connection pool. Every connection gets the same
// pragmas (WAL, foreign keys, a busy timeout), and the migrations in
// migrations/ are compiled in and run when the store opens, so a fresh install
// and an upgrade take the same path. The app keeps one `Store` in its state
// and calls it from commands; tests use `Store::memory()`.

use std::path::Path;

use diesel::connection::SimpleConnection;
use diesel::r2d2::{ConnectionManager, CustomizeConnection, Pool, PooledConnection};
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use serde::{Deserialize, Serialize};

mod error;
pub mod prefs;
pub mod schema;

pub use error::{Error, Result};
pub use prefs::Prefs;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

/// The three kinds of document linear edits.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// A `.lin` diagram.
    Lin,
    /// A `.lpx` pixel-art image.
    Lpx,
    /// A `.ldw` drawing.
    Ldw,
}

impl Kind {
    pub const ALL: [Kind; 3] = [Kind::Lin, Kind::Lpx, Kind::Ldw];

    /// The value stored in `documents.kind`, and the file extension without its dot.
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Lin => "lin",
            Kind::Lpx => "lpx",
            Kind::Ldw => "ldw",
        }
    }

    pub fn parse(s: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.as_str() == s)
    }
}

pub type Conn = PooledConnection<ConnectionManager<SqliteConnection>>;

/// Set on every connection the pool opens.
#[derive(Debug)]
struct Pragmas;

impl CustomizeConnection<SqliteConnection, diesel::r2d2::Error> for Pragmas {
    fn on_acquire(&self, conn: &mut SqliteConnection) -> std::result::Result<(), diesel::r2d2::Error> {
        conn.batch_execute(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )
        .map_err(diesel::r2d2::Error::QueryError)
    }
}

#[derive(Clone)]
pub struct Store {
    pool: Pool<ConnectionManager<SqliteConnection>>,
}

impl Store {
    /// Opens (creating if needed) the library at `path` and brings its tables up to date.
    pub fn open(path: &Path) -> Result<Store> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| Error::Open(format!("{}: {e}", dir.display())))?;
        }
        let url = path.to_str().ok_or_else(|| Error::Open(format!("{} isn't valid UTF-8", path.display())))?;
        Store::with_pool(url, 4)
    }

    /// A private in-memory library, for tests. One connection, since each
    /// in-memory connection would otherwise be its own empty database.
    pub fn memory() -> Result<Store> {
        Store::with_pool(":memory:", 1)
    }

    fn with_pool(url: &str, size: u32) -> Result<Store> {
        let pool = Pool::builder()
            .max_size(size)
            .connection_customizer(Box::new(Pragmas))
            .build(ConnectionManager::<SqliteConnection>::new(url))
            .map_err(|e| Error::Open(e.to_string()))?;
        let store = Store { pool };
        store.conn()?.run_pending_migrations(MIGRATIONS).map_err(|e| Error::Migrate(e.to_string()))?;
        Ok(store)
    }

    /// A connection from the pool. Blocks until one is free.
    pub fn conn(&self) -> Result<Conn> {
        self.pool.get().map_err(|e| Error::Open(e.to_string()))
    }

    // ── Preferences ────────────────────────────────────────────────────

    pub fn prefs(&self) -> Result<Prefs> {
        prefs::get(&mut *self.conn()?)
    }

    pub fn set_pref(&self, key: &str, value: serde_json::Value) -> Result<Prefs> {
        prefs::set(&mut *self.conn()?, key, value)
    }

    pub fn reset_pref(&self, key: &str) -> Result<Prefs> {
        prefs::reset(&mut *self.conn()?, key)
    }
}

/// Now, in unix milliseconds: how every time in the library is kept.
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
