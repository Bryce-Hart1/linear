// The one place the page talks to Rust. Inside the app, every call is an
// `invoke` of a command in src-tauri/src/commands.rs and every event comes
// from there too. In a plain browser (`npm run dev`) an in-memory fake serves
// the same interface (mock.ts), so the UI can be worked on without the app.

import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { MenuId } from './menu-ids';
import { mockBackend } from './mock';
import type { DocMeta, Folder, Import, NewDoc, Opened, Palette, Prefs, Query, Saved, VersionMeta } from './types';

export type Unlisten = () => void;

/** Files dragged over or dropped on the window, from Finder. */
export type DropEvent = { type: 'over' } | { type: 'drop'; paths: string[] } | { type: 'leave' };

export interface Backend {
  /** True inside the app, false in a plain browser on the mock. */
  readonly isApp: boolean;

  getPrefs(): Promise<Prefs>;
  /** Sets one preference by its dotted key (`theme`, `ldw.pen.color`); returns them all. */
  setPref(key: string, value: unknown): Promise<Prefs>;
  /** Puts a preference, or a group (`ldw`), back to its default. */
  resetPref(key: string): Promise<Prefs>;

  listDocuments(query: Query): Promise<DocMeta[]>;
  listFolders(): Promise<Folder[]>;
  createFolder(parent: number | null, name: string): Promise<Folder>;
  renameFolder(id: number, name: string): Promise<Folder>;
  moveFolder(id: number, parent: number | null): Promise<Folder>;
  /** Returns how many documents moved up out of it. */
  deleteFolder(id: number): Promise<number>;

  createDocument(doc: NewDoc): Promise<DocMeta>;
  openDocument(id: number): Promise<Opened>;
  saveDocument(id: number, content: string, thumbnail: Uint8Array | null): Promise<Saved>;
  /** The newest saved content, for exporting. */
  documentContent(id: number): Promise<string>;
  renameDocument(id: number, name: string): Promise<DocMeta>;
  moveDocument(id: number, folder: number | null): Promise<DocMeta>;
  duplicateDocument(id: number): Promise<DocMeta>;
  setPinned(id: number, pinned: boolean): Promise<DocMeta>;
  trashDocument(id: number): Promise<DocMeta>;
  restoreDocument(id: number): Promise<DocMeta>;
  /** Deletes a document in the Trash for good. */
  deleteDocument(id: number): Promise<void>;
  /** Returns how many documents were deleted. */
  emptyTrash(): Promise<number>;

  listVersions(id: number): Promise<VersionMeta[]>;
  readVersion(version: number): Promise<string>;
  restoreVersion(version: number, thumbnail: Uint8Array | null): Promise<Saved>;
  putDraft(id: number, baseVersionId: number, content: string): Promise<void>;
  discardDraft(id: number): Promise<void>;

  listPalettes(): Promise<Palette[]>;
  /** Saves a palette: its colours after transparent. */
  savePalette(name: string, colours: string[]): Promise<Palette>;
  deletePalette(id: number): Promise<void>;

  /** Opens the system's file picker for documents to import. Null if cancelled. */
  pickImports(): Promise<string[] | null>;
  readImport(path: string): Promise<Import>;
  /** The save panel, starting at `name` (a file name, or a full path). Null if cancelled. */
  pickSavePath(name: string, ext: string): Promise<string | null>;
  writeExport(path: string, bytes: Uint8Array): Promise<void>;
  /** Where an <img> loads a document's thumbnail; null if it has none. */
  thumbUrl(doc: DocMeta): string | null;

  /** The window's own light/dark look (title bar, traffic lights); null follows the system. */
  setWindowTheme(theme: 'light' | 'dark' | null): Promise<void>;
  /** A native menu item was chosen (or, on the mock, its key pressed). */
  onMenu(cb: (id: MenuId) => void): Promise<Unlisten>;
  onDragDrop(cb: (e: DropEvent) => void): Promise<Unlisten>;
  /** Files opened with linear from Finder, waiting to be imported; taking them empties the queue. */
  takeOpenedFiles(): Promise<string[]>;
  /** More files were opened with linear: take them with takeOpenedFiles. */
  onFilesOpened(cb: () => void): Promise<Unlisten>;
}

const bytes = (b: Uint8Array | null) => (b ? Array.from(b) : null);

function tauri(): Backend {
  return {
    isApp: true,
    getPrefs: () => invoke('get_prefs'),
    setPref: (key, value) => invoke('set_pref', { key, value }),
    resetPref: (key) => invoke('reset_pref', { key }),

    listDocuments: (query) => invoke('list_documents', { query }),
    listFolders: () => invoke('list_folders'),
    createFolder: (parent, name) => invoke('create_folder', { parent, name }),
    renameFolder: (id, name) => invoke('rename_folder', { id, name }),
    moveFolder: (id, parent) => invoke('move_folder', { id, parent }),
    deleteFolder: (id) => invoke('delete_folder', { id }),

    createDocument: (doc) => invoke('create_document', { doc }),
    openDocument: (id) => invoke('open_document', { id }),
    saveDocument: (id, content, thumbnail) => invoke('save_document', { id, content, thumbnail: bytes(thumbnail) }),
    documentContent: (id) => invoke('document_content', { id }),
    renameDocument: (id, name) => invoke('rename_document', { id, name }),
    moveDocument: (id, folder) => invoke('move_document', { id, folder }),
    duplicateDocument: (id) => invoke('duplicate_document', { id }),
    setPinned: (id, pinned) => invoke('set_pinned', { id, pinned }),
    trashDocument: (id) => invoke('trash_document', { id }),
    restoreDocument: (id) => invoke('restore_document', { id }),
    deleteDocument: (id) => invoke('delete_document', { id }),
    emptyTrash: () => invoke('empty_trash'),

    listVersions: (id) => invoke('list_versions', { id }),
    readVersion: (version) => invoke('read_version', { version }),
    restoreVersion: (version, thumbnail) => invoke('restore_version', { version, thumbnail: bytes(thumbnail) }),
    putDraft: (id, baseVersionId, content) => invoke('put_draft', { id, baseVersionId, content }),
    discardDraft: (id) => invoke('discard_draft', { id }),

    listPalettes: () => invoke('list_palettes'),
    savePalette: (name, colours) => invoke('save_palette', { name, colours }),
    deletePalette: (id) => invoke('delete_palette', { id }),

    pickImports: async () => {
      const picked = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'linear documents', extensions: ['lin', 'lpx', 'ldw'] }],
      });
      return picked === null ? null : Array.isArray(picked) ? picked : [picked];
    },
    readImport: (path) => invoke('read_import', { path }),
    pickSavePath: (name, ext) => save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }),
    writeExport: (path, data) => invoke('write_export', { path, bytes: Array.from(data) }),
    thumbUrl: (doc) => (doc.hasThumbnail ? `${convertFileSrc(String(doc.id), 'thumb')}?v=${doc.updatedAt}` : null),

    setWindowTheme: (theme) => getCurrentWindow().setTheme(theme),
    onMenu: (cb) => listen<MenuId>('menu', (e) => cb(e.payload)),
    takeOpenedFiles: () => invoke('take_opened_files'),
    onFilesOpened: (cb) => listen('files-opened', () => cb()),
    onDragDrop: (cb) =>
      getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'drop') cb({ type: 'drop', paths: p.paths });
        else if (p.type === 'leave') cb({ type: 'leave' });
        else cb({ type: 'over' });
      }),
  };
}

export const api: Backend = isTauri() ? tauri() : mockBackend();
