-- linear's library. Times are unix milliseconds.

CREATE TABLE folders (
  id         INTEGER PRIMARY KEY NOT NULL,
  parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- A document's content lives in `versions`; the newest version is the current one.
CREATE TABLE documents (
  id         INTEGER PRIMARY KEY NOT NULL,
  folder_id  INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('lin', 'lpx', 'ldw')),
  thumbnail  BLOB,
  pinned     BOOLEAN NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  opened_at  BIGINT,
  trashed_at BIGINT
);
CREATE INDEX documents_by_folder ON documents(folder_id);

-- Append-only: a save adds one, a restore copies an old one to the top.
CREATE TABLE versions (
  id          INTEGER PRIMARY KEY NOT NULL,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  bytes       BIGINT NOT NULL,
  created_at  BIGINT NOT NULL
);
CREATE INDEX versions_by_doc ON versions(document_id, id DESC);

-- Unsaved work, written a moment after each change so a crash loses little.
CREATE TABLE drafts (
  document_id     INTEGER PRIMARY KEY NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  base_version_id INTEGER NOT NULL,
  content         TEXT NOT NULL,
  updated_at      BIGINT NOT NULL
);

-- One row per preference; the value is JSON. Defaults live in the code.
CREATE TABLE prefs (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

-- Pixel-art palettes the user saved. `colors` is a JSON array of "#rrggbbaa".
CREATE TABLE palettes (
  id         INTEGER PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  colors     TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
