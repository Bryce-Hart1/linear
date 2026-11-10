// The library as the window shows it: where you are (a view or a folder),
// what's listed there, the folders, and every action on documents and
// folders. Each action asks the store, then lists again, so what's on screen
// is always what the store holds; failures and results go to the notes line.

import { api } from './api';
import { folderPath } from './folder-tree';
import { kindInfo, type NewOptions } from './kinds';
import { notes } from './notes.svelte';
import { prefs } from './prefs.svelte';
import { errorMessage, type DocMeta, type Folder, type Kind, type View } from './types';

export interface Place {
  view: View;
  /** With `view: 'folder'`, which folder. */
  folder: number | null;
}

const VIEW_TITLES: Record<Exclude<View, 'folder'>, string> = {
  all: 'All documents',
  recent: 'Recent',
  pinned: 'Pinned',
  trash: 'Trash',
};

class Library {
  place = $state<Place>({ view: 'all', folder: null });
  search = $state('');
  docs = $state<DocMeta[]>([]);
  folders = $state<Folder[]>([]);
  /** The selected document in the list, by id. */
  selected = $state<number | null>(null);
  loaded = $state(false);
  private listing = 0;

  get title(): string {
    if (this.place.view !== 'folder') return VIEW_TITLES[this.place.view];
    return this.folders.find((f) => f.id === this.place.folder)?.name ?? 'Folder';
  }

  /** Where new documents go from here: the open folder, or no folder. */
  get newFolder(): number | null {
    return this.place.view === 'folder' ? this.place.folder : null;
  }

  go(place: Place) {
    this.place = place;
    this.selected = null;
  }

  /** Lists the current place again. Only the newest request's answer is shown. */
  async refresh() {
    const p = prefs.value;
    if (!p) return;
    const n = ++this.listing;
    const { view, folder } = this.place;
    try {
      const docs = await api.listDocuments({
        view,
        folder: view === 'folder' ? folder : undefined,
        kind: p.library.kind,
        search: this.search,
        sort: p.library.sort,
      });
      if (n !== this.listing) return;
      this.docs = docs;
      if (this.selected !== null && !docs.some((d) => d.id === this.selected)) this.selected = null;
      this.loaded = true;
    } catch (e) {
      notes.say(errorMessage(e));
    }
  }

  async refreshFolders() {
    try {
      this.folders = await api.listFolders();
      // The open folder was deleted: go back to everything.
      if (this.place.view === 'folder' && this.place.folder !== null && !this.folders.some((f) => f.id === this.place.folder)) {
        this.go({ view: 'all', folder: null });
      }
    } catch (e) {
      notes.say(errorMessage(e));
    }
  }

  /** Runs `f`, says its failure if it fails, and lists again either way. */
  private async act<T>(f: () => Promise<T>, folders = false): Promise<T | undefined> {
    try {
      return await f();
    } catch (e) {
      notes.say(errorMessage(e));
      return undefined;
    } finally {
      if (folders) await this.refreshFolders();
      await this.refresh();
    }
  }

  // ── Documents ──────────────────────────────────────────────────────────

  async create(kind: Kind, name: string, opts?: NewOptions): Promise<DocMeta | undefined> {
    const info = kindInfo(kind);
    if (!info.blank) {
      notes.say(`${info.plural} arrive in ${info.comingIn}.`);
      return undefined;
    }
    const content = info.blank(opts);
    const thumb = await info.thumbnail(content);
    return this.act(() => api.createDocument({ name, kind, folder: this.newFolder, content, thumbnail: thumb && Array.from(thumb) }));
  }

  async rename(doc: DocMeta, name: string): Promise<boolean> {
    if (name.trim() === doc.name) return true;
    return (await this.act(() => api.renameDocument(doc.id, name))) !== undefined;
  }

  async moveTo(doc: DocMeta, folder: number | null) {
    const moved = await this.act(() => api.moveDocument(doc.id, folder));
    if (moved) notes.say(`Moved ${moved.name} to ${folder === null ? 'the top level' : folderPath(this.folders, folder)}`);
  }

  async duplicate(doc: DocMeta) {
    const copy = await this.act(() => api.duplicateDocument(doc.id));
    if (copy) this.selected = copy.id;
  }

  async setPinned(doc: DocMeta, pinned: boolean) {
    await this.act(() => api.setPinned(doc.id, pinned));
  }

  async trash(doc: DocMeta) {
    const gone = await this.act(() => api.trashDocument(doc.id));
    if (gone) notes.say(`Moved ${gone.name} to the Trash`, { label: 'Undo', run: () => this.restore(gone, true) });
  }

  async restore(doc: DocMeta, quiet = false) {
    const back = await this.act(() => api.restoreDocument(doc.id));
    if (back && !quiet) notes.say(`Put ${back.name} back${back.name !== doc.name ? ` (renamed: the name was taken)` : ''}`);
  }

  async deleteForever(doc: DocMeta) {
    await this.act(() => api.deleteDocument(doc.id));
  }

  async emptyTrash() {
    const n = await this.act(() => api.emptyTrash());
    if (n !== undefined) notes.say(n === 1 ? 'Deleted 1 document' : `Deleted ${n} documents`);
  }

  // ── Folders ────────────────────────────────────────────────────────────

  async createFolder(parent: number | null, name: string): Promise<Folder | undefined> {
    return this.act(() => api.createFolder(parent, name), true);
  }

  async renameFolder(folder: Folder, name: string): Promise<boolean> {
    if (name.trim() === folder.name) return true;
    return (await this.act(() => api.renameFolder(folder.id, name), true)) !== undefined;
  }

  async moveFolder(folder: Folder, parent: number | null) {
    await this.act(() => api.moveFolder(folder.id, parent), true);
  }

  async deleteFolder(folder: Folder) {
    const n = await this.act(() => api.deleteFolder(folder.id), true);
    if (n) notes.say(`Deleted ${folder.name}; ${n === 1 ? 'its document moved' : `its ${n} documents moved`} up a level`);
  }

  // ── Files ──────────────────────────────────────────────────────────────

  /** Imports files by path, each checked by its kind's own reader, into the open folder. */
  async importPaths(paths: string[]) {
    let made = 0;
    let last: DocMeta | undefined;
    const problems: string[] = [];
    for (const path of paths) {
      try {
        const file = await api.readImport(path);
        const info = kindInfo(file.kind);
        if (!info.check) throw new Error(`${file.name}${info.ext}: ${info.plural.toLowerCase()} arrive in ${info.comingIn}`);
        try {
          info.check(file.text);
        } catch (e) {
          throw new Error(`${file.name}${info.ext}: ${errorMessage(e)}`);
        }
        // Kept exactly as read: a file that round-trips stays byte-for-byte the same.
        const thumb = await info.thumbnail(file.text);
        last = await api.createDocument({
          name: file.name,
          kind: file.kind,
          folder: this.newFolder,
          content: file.text,
          thumbnail: thumb && Array.from(thumb),
        });
        made++;
      } catch (e) {
        problems.push(errorMessage(e));
      }
    }
    await this.refresh();
    if (last) this.selected = last.id;
    if (problems.length) notes.say(made ? `Imported ${made}; ${problems.join('; ')}` : problems.join('; '));
    else if (made) notes.say(made === 1 ? `Imported ${last!.name}` : `Imported ${made} documents`);
  }

  async import() {
    const paths = await api.pickImports().catch((e) => (notes.say(errorMessage(e)), null));
    if (paths?.length) await this.importPaths(paths);
  }

  /** Saves a document's newest version as a file, where the user picks. */
  async exportFile(doc: DocMeta) {
    const ext = doc.kind;
    const file = `${doc.name}.${ext}`;
    const dir = prefs.value?.export.lastDir;
    try {
      const path = await api.pickSavePath(dir ? `${dir}/${file}` : file, ext);
      if (!path) return;
      const text = await api.documentContent(doc.id);
      await api.writeExport(path, new TextEncoder().encode(text));
      const slash = path.lastIndexOf('/');
      if (slash > 0) prefs.set('export.lastDir', path.slice(0, slash));
      notes.say(`Exported ${path.slice(slash + 1)}`);
    } catch (e) {
      notes.say(errorMessage(e));
    }
  }
}

export const library = new Library();
