# linear

An editor for three kinds of document:

- `.lin` diagrams: shapes and lines that can pulse, read and written byte-for-byte as drawBridge does.
- `.lpx` pixel art: layers and an indexed palette.
- `.ldw` drawings: vector pen strokes.

It is a Tauri app. The UI is Svelte, and the library (documents with their version history,
drafts, folders, palettes and preferences) is kept in SQLite through Diesel.

The plan is in [docs/PLAN.md](docs/PLAN.md). **Status: M1 (the library).** Done so far:

- the window, the native menu, light and dark themes, and preferences kept in the library;
- documents with version history, drafts, pinning and a Trash;
- nested folders;
- a grid or list of documents, with search, a kind filter and sorting;
- importing `.lin` files (from the file picker or dropped from Finder) and exporting them as files.

Diagrams can be made, opened and exported. Their editor arrives in M2; until then, opening one shows what the
library holds for it. Pixel art (M4) and drawings (M5) follow.

## Layout

| Path | What it is |
|---|---|
| `crates/store` | `linear-store`: Diesel + SQLite. Its migrations are compiled in and run when the library opens. |
| `app/src` | The UI: Svelte 5 and TypeScript |
| `app/src-tauri` | The shell: window, native menu, commands |
| `docs/PLAN.md` | The design and the milestones |

## Running it

```bash
npm --prefix app install
```

The app itself:

```bash
npm --prefix app run tauri dev
```

The UI alone in a browser, on an in-memory mock backend, at http://127.0.0.1:1420:

```bash
npm --prefix app run dev
```

Development builds keep their library apart from the real one:
`~/Library/Application Support/io.github.bryce-hart1.linear/linear-dev.db`. Release builds use `linear.db`.

## Checks

```bash
cargo test --workspace
```

```bash
cargo clippy --workspace --all-targets -- -D warnings
```

```bash
npm --prefix app test
```

```bash
npm --prefix app run check
```

## Changing the tables

Add a migration, then regenerate `schema.rs` from a scratch database:

```bash
cd crates/store && diesel migration generate <name>
```

```bash
cd crates/store && DATABASE_URL=/tmp/linear-schema.db diesel migration run && DATABASE_URL=/tmp/linear-schema.db diesel print-schema > src/schema.rs
```

## Keyboard and the menu

linear's own menu items send their id to the page as a `menu` event, and
`app/src/lib/menu-router.ts` decides where each one goes. In a text field, Undo, Redo, Select All and
Delete edit the text. Anything else goes to the open editor, or to the shell when no editor
handles it. Cut, Copy and Paste are the system's own items. In development builds,
**Help → Keyboard Shortcuts** (⌘/) opens a key test panel that shows where each key press goes.
