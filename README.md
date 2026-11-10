<p align="center">
  <img src="docs/logo.png" alt="linear" width="128" height="128">
</p>

<h1 align="center">linear</h1>

<p align="center">
  A small, quiet Mac editor for <b>diagrams</b>, <b>pixel art</b> and <b>drawings</b>.<br>
  Everything you make lives in one library, with every earlier version kept.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="#diagrams-lin">Diagrams</a> ·
  <a href="#pixel-art-lpx">Pixel art</a> ·
  <a href="#drawings-ldw">Drawings</a> ·
  <a href="#your-library">Library</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#for-developers">Developers</a>
</p>

---

## What's in it

| | Kind | File | What it's for |
|---|---|---|---|
| 🔷 | **Diagram** | `.lin` | Shapes joined by lines and arrows, with text, colour and lines that can pulse. Files are identical to drawBridge's, so the two apps share them. |
| 🟪 | **Pixel art** | `.lpx` | One pixel at a time, with layers and a colour palette. Up to 512 × 512. |
| ✏️ | **Drawing** | `.ldw` | Pen and highlighter on a page of any size, kept as vector strokes so they stay sharp. |

Version 0.1.0. It looks like outlines on pure black (or white, in light mode), with one dark-purple accent, `#2A0047`.

---

## Install

You need an Apple Silicon Mac.

1. Open **`linear_0.1.0_aarch64.dmg`** and drag **linear** into **Applications**.
2. Open it.

The disk image comes from [building the app](#build-the-app) yourself.

> **If macOS says it "can't be opened":** linear is signed only for the Mac it was built on, not notarised by Apple. On another Mac, right-click **linear** in Applications, choose **Open**, then **Open** again. Or go to **System Settings → Privacy & Security** and click **Open Anyway**. You only do this once.

linear opens `.lin`, `.lpx` and `.ldw` files too: double-click one in Finder and it's added to your library.

---

## Get started

### Make your first document

1. Click **New** (top left), or press **⌘N**, and choose Diagram, Pixel art or Drawing.
2. Give it a name. Pixel art also asks for a size and a palette, and a drawing for a page size.
3. It opens ready to work in.
4. Press **⌘S** to save. Your work is also kept automatically as a draft every couple of seconds, so a crash won't lose it.
5. Press **⌘W**, or click **‹ Library**, to go back. If you have unsaved changes, linear asks first.

### Find your way around

| Where | What's there |
|---|---|
| **Sidebar** | New, search, Recent, Pinned, All documents, Trash, and your folders. |
| **Library** | Your documents as a grid or list, with a filter by kind and sorting. |
| **Editor** | Tools on the left, the canvas in the middle, properties or colours and layers on the right, hints along the bottom. |

Right-click almost anything for what you can do to it. **⌘/** shows the keyboard shortcuts for where you are.

---

## Diagrams (`.lin`)

Place shapes, join them with lines, type in them, colour them.

### The basics

1. Pick a shape on the left (**Rectangle, Circle, Triangle, Diamond**) and click the page to place it.
2. **Draw a line** by hovering a shape and dragging from one of the four dots on its edge onto another shape. Or pick the **Line** tool and click twice.
3. **Type in a shape** by double-clicking it, or select it and press **⏎**. Press **esc** when you're done.
4. **Select** by clicking, by dragging a box, or by pressing **tab**. Hold **⇧** to add to the selection.
5. Change anything in the **inspector** on the right: colour, size, outline, text size, arrowheads, curved or square lines.

### Lines that pulse

Select a line and choose **Pulse** in the inspector: from the start, from the end, or out from the middle. Pick a **Ball** or a **Light** to travel along it. Pulses play in **View** mode, and you can pause them with the button in the top bar.

### Good to know

- **View and Edit.** Diagrams open for viewing, so pulses play and you can't change anything by accident. Press **e** to edit. A new diagram opens ready to edit. (Settings can change which one is the default.)
- **Side-by-side lines.** Several lines between the same two shapes run next to each other, and their labels move apart so you can read them.
- **Limits.** A shape holds up to 200 characters, as many as fit. A label on a line is one row, up to 40.
- **Ten colours**, plus plain: press **0–9** on a selection.

<details>
<summary><b>All diagram shortcuts</b></summary>

| Keys | Does |
|---|---|
| `e` | Switch between viewing and editing |
| `space` | Play or pause pulses (while viewing) |
| `r` `c` `t` `d` | Rectangle, circle, triangle, diamond: then click to place |
| `l` | Line: click where it starts, then where it ends |
| `g` | Snap to a 10 px grid (hold ⌥ while dragging to skip it) |
| `tab` / `⇧tab` | Select the next / previous part |
| `⌘A` | Select everything |
| `0`–`9` | Colour |
| `i` `o` `p` | Small, medium, large text |
| `w` | Outline: solid, dashed, dotted |
| arrows | Resize a shape 10 px (`⇧`: 40) |
| `⌥` arrows | Move the selection 10 px (`⌥⇧`: 1) |
| `[` `]` `{` `}` | Back one, forward one, to the back, to the front |
| `⌘C` `⌘V` `⌘D` | Copy, paste (at the pointer), duplicate |
| `⌫` | Delete |
| `⌘Z` / `⇧⌘Z` | Undo, redo |
| `a` `f` `b` `m` `s` | Line: arrowheads, flip, bend, pulse, ball or light |
| `⏎` | Type in the selected shape or line |
| `⌥B` `⌥I` `⌥U` | Bold, italic, underline while typing in a shape |
| `+` `−` `z` | Zoom in, out, fit |
| `x` | Export |
| `⌘S` | Save |

</details>

**Export** (**x**, or the Export button): PNG, JPEG, SVG, or the `.lin` file itself.

---

## Pixel art (`.lpx`)

Draw with a small palette on as many layers as you like.

### The basics

1. **New ▸ Pixel art.** Pick a size (16, 32, 64, 128 or 256, or anything up to 512) and a palette.
2. **Pick a colour** in the palette on the right, and draw. **Left-click** paints with the first colour, **right-click** with the second. **x** swaps them.
3. **⌥-click** anywhere to pick up a colour, whatever tool you're on.
4. **Zoom** with **+** and **−**, or pinch. The pixel grid appears when you're zoomed in.

### The tools

| Key | Tool | Notes |
|---|---|---|
| `b` | Pencil | Brush size 1–8, square or round. *Pixel-perfect* takes out the extra corner pixels. |
| `e` | Eraser | |
| `g` | Fill | Fills touching pixels, or every pixel of that colour. |
| `l` `r` `o` | Line, rectangle, ellipse | Rectangle and ellipse can be outline or filled. Hold `⇧` for 45° lines, squares and circles. |
| `i` | Eyedropper | |
| `m` | Select | Drag a box. Drag inside it to lift and move the pixels. |
| `v` | Move | Moves the selection, or the whole layer. |
| `h` | Hand | Moves the page. Or hold `space` with any tool. |

Along the top you'll also find **mirror** drawing (left-right and up-down).

### Palettes

- Click a colour to use it. **Double-click** to change it: every pixel of that colour changes with it.
- **+** adds a colour; **−** takes out a colour nothing uses.
- The palette button offers built-in palettes (*linear 16*, *Greyscale*, *1-bit*) and any you've saved. **Save this palette…** keeps yours for new images.
- An image holds up to 256 colours; colour 0 is always transparent.

### Layers

Up to 16. Each can be hidden, locked, renamed and given an opacity. Add, duplicate, merge down, reorder and delete from the panel. Merging ignores opacity, because palette colours can't blend.

### Image menu

Change the **canvas size** (choosing which edge stays put), **flip** it, or **turn** it a quarter.

**Export** (**⌘E**): PNG at 1×, 4×, 8×, 16× or the scale you last used (up to 32×), crisp and transparent where the image is. Or the `.lpx` file.

<details>
<summary><b>All pixel-art shortcuts</b></summary>

| Keys | Does |
|---|---|
| `b` `e` `g` `l` `r` `o` `i` `m` `v` `h` | Tools, as above |
| `x` | Swap the two colours |
| `1`–`9` | Pick palette colour 1–9 (`0`: transparent) |
| `[` `]` | Smaller or bigger brush |
| `⌘A` | Select everything |
| `⌘C` `⌘X` `⌘V` | Copy, cut, paste |
| arrows | Nudge a selection 1 px (`⇧`: 10) |
| `⏎` or `esc` | Put a moved selection down |
| `⌫` | Clear the selection |
| `+` `−` `z` | Zoom in, out, fit |
| `⌘Z` / `⇧⌘Z` | Undo, redo |
| `⌘S` / `⌘E` | Save / export |

</details>

---

## Drawings (`.ldw`)

A sketchbook: pen, highlighter, shapes, on a page.

### The basics

1. **New ▸ Drawing.** Choose Landscape, Portrait, Square, or your own size.
2. **Draw** with the pen (`p`). Pick a colour and a width along the top.
3. **Highlight** with `h`: wide, yellow and see-through to start.
4. **Rub out** with `e`: it takes out each whole stroke it touches.
5. **Select** with `s`: click a stroke, or draw a loop round several. Drag inside to move them. The bar along the top recolours, resizes, reorders, duplicates or deletes them.

### Smooth by design

The pen trails your pointer a little, so a shaky hand draws a steady line; the **Steady** slider sets how much. When you lift the pen, the stroke is trimmed to the points that matter. Strokes are curves, so they look sharp at any zoom and in any export.

### Page

The **Page** menu switches between a white and a **transparent** page, and changes the page size (200 to 8000 px a side).

**Export** (**x**): PNG or JPEG of what you drew (with a margin), PNG or SVG of the whole page, or the `.ldw` file.

<details>
<summary><b>All drawing shortcuts</b></summary>

| Keys | Does |
|---|---|
| `p` `h` `e` `s` | Pen, highlighter, eraser, select |
| `l` `r` `o` | Line, rectangle, ellipse (`⇧`: 45° lines, squares, circles) |
| `space` | Hold and drag to move the page |
| `[` `]` | Thinner or thicker |
| `⌘A` | Select every stroke |
| `⌘C` `⌘X` `⌘V` `⌘D` | Copy, cut, paste, duplicate |
| arrows | Nudge a selection 1 px (`⇧`: 10) |
| `⌫` | Delete the selection |
| `esc` | Deselect |
| `+` `−` `z` | Zoom in, out, fit |
| `⌘Z` / `⇧⌘Z` | Undo, redo |
| `⌘S` / `x` | Save / export |

</details>

---

## Your library

### Organising

- **Folders** nest. Click **+** next to *Folders*, or right-click a folder for *New folder inside*, *Rename*, *Move to…* and *Delete*. Drag a document onto a folder to move it.
- **Pin** a document (right-click) to keep it under *Pinned*. *Recent* lists what you opened last.
- **Search** looks at document names. The buttons along the top filter by kind, and *Sort by* orders by last edited, date made or name.
- Switch between **grid** and **list** at the top right.
- Names are unique within a folder. If you duplicate or move something to where its name is taken, linear numbers it (*Plan 2*).

### Trash

Deleting (**⌫**) moves a document to the Trash, and a note offers **Undo**. Open *Trash* to put things back, or delete them for good. **Empty Trash** and *Delete forever* ask first, because they can't be undone.

### Versions

Every save keeps a version. Click the **clock** in an editor's top bar, or right-click a document and choose **Versions…**, to see them, preview any one, and **Restore** it. Restoring saves that version again on top, so the ones in between aren't lost. linear keeps the last 50 by default (change it in Settings).

### Drafts

Unsaved changes are written as a draft a couple of seconds after each change. If linear closes before you save, the document opens with a banner offering **Restore them** or **Discard**.

### Bringing files in and out

- **In:** **⌘O**, drag files in from Finder, or double-click a `.lin`, `.lpx` or `.ldw` file. Each is checked first; one that can't be read says why and isn't imported.
- **Out:** right-click a document ▸ **Export file…** (or **⌘E**) saves it as a plain file. Each editor also exports images.

### Library shortcuts

| Keys | Does |
|---|---|
| `⌘N` | New diagram |
| `⌘O` | Import files |
| `⏎` | Open the selected document |
| arrows | Select the previous or next document |
| `⌘D` | Duplicate |
| `⌫` | Move to the Trash |
| `⌘E` | Export the file |
| `⌘\` | Show or hide the sidebar |
| `⌘,` | Settings |
| `⌘/` | Keyboard shortcuts |

---

## Settings

Open with **⌘,**. Every setting applies at once.

| Tab | You can change |
|---|---|
| **General** | Theme (match system, light or dark), key hints, panels, sidebar width |
| **Library** | How many versions to keep; how soon unsaved work is kept as a draft |
| **Diagrams** | Open for viewing or editing; play pulses on open; snap to the grid |
| **Pixel art** | Size and palette of new images; the pixel grid; export scale |
| **Drawings** | Page size of new drawings; pen colour, width and opacity; smoothing |

**Reset all…** puts everything back as it started. It never touches your documents.

---

## Where your things live

Everything is in one database: documents, versions, drafts, folders, palettes and settings.

```
~/Library/Application Support/io.github.bryce-hart1.linear/linear.db
```

**To back it up,** quit linear and copy that whole folder. **To move to another Mac,** copy it to the same place there. Individual documents can always be exported as plain files.

---

## Limits

| | |
|---|---|
| Diagram page | 1200 × 800 (changeable in the file only); shapes 24–800 px |
| Pixel art | Up to 512 × 512, 16 layers, 256 colours |
| Drawing page | 200–8000 px a side; stroke width 0.5–64 |
| Document size | `.lin` up to 1 MiB; `.lpx` and `.ldw` up to 16 MiB |
| Undo | 200 steps |

---

## File formats

All three are plain text (JSON, one part per line), so they diff cleanly and are easy to read with other tools.

| File | Holds |
|---|---|
| `.lin` | Shapes and lines in stacking order. **Byte-for-byte the same as drawBridge's**: a file made in either opens in the other. |
| `.lpx` | A palette and layers of colour numbers, compressed. |
| `.ldw` | The page and a list of strokes, each a colour, width, opacity and points. |

---

## For developers

linear is a [Tauri](https://tauri.app) app. The screens are Svelte 5 and TypeScript. Your library is SQLite, through [Diesel](https://diesel.rs). The full design and the milestones are in [docs/PLAN.md](docs/PLAN.md).

### Build the app

You need Rust, Node and the Xcode command-line tools.

```bash
npm --prefix app install
```

```bash
npm --prefix app run tauri build
```

This writes `target/release/bundle/macos/linear.app` and `target/release/bundle/dmg/linear_0.1.0_aarch64.dmg`. It's signed ad hoc (`signingIdentity: "-"`), so it runs on the Mac that built it. To give it to anyone else it needs a Developer ID signature and notarising.

### Run it while you work

The app, with live reload:

```bash
npm --prefix app run tauri dev
```

Just the screens in a browser, on an in-memory fake backend with sample documents, at http://127.0.0.1:1420:

```bash
npm --prefix app run dev
```

Development builds keep a separate library (`linear-dev.db`), so trying things out never touches your real one.

### Check it

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

### Layout

| Path | What it is |
|---|---|
| `crates/store` | `linear-store`: Diesel and SQLite. Its migrations are compiled in and run when the library opens. |
| `app/src-tauri` | The shell: window, native menu, commands, the `thumb://` protocol, files opened from Finder |
| `app/src/components` | The screens: library, editors, dialogs |
| `app/src/lib/lin` | The `.lin` format and editor logic, **drawBridge's, unchanged** except one colour. `fixtures/flow.lin` is the golden file it must round-trip byte for byte. |
| `app/src/lib/lin-ui` | linear's own `.lin` additions: handles, dots, set-to-value edits, shortcut lists |
| `app/src/lib/lpx`, `lib/ldw` | The pixel-art and drawing formats, and everything that draws on them |
| `docs/PLAN.md` | The design |

### Changing the tables

Add a migration, then regenerate `schema.rs` from a scratch database:

```bash
cd crates/store && diesel migration generate <name>
```

```bash
cd crates/store && DATABASE_URL=/tmp/linear-schema.db diesel migration run && DATABASE_URL=/tmp/linear-schema.db diesel print-schema > src/schema.rs
```

### How menus and keys fit together

linear's menu items send their id to the page as a `menu` event, and `app/src/lib/menu-router.ts` decides where each one goes. In a text field, Undo, Redo, Select All and Delete edit the text; anything else goes to the open editor, or to the library. Cut, Copy and Paste are the system's own items. In development builds the sidebar has a **Key test** button that shows where each key press goes.

### What's next

Tabs, align and distribute for diagrams, pen pressure for drawings, pixel-art animation, full-text search, importing palettes from other apps, and a command-line tool.

---

<p align="center"><sub>MIT licensed · © 2026 Bryce Hart</sub></p>
