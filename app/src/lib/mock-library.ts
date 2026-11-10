// The library, faked in memory for the browser mock (mock.ts): the same rules
// as linear-store's docs.rs and folders.rs, as far as the UI can tell. Names
// are cleaned and kept unique in a folder, saves append versions, and the
// Trash and folders behave the same. It starts with a few sample documents.

import { serializeLin } from './lin/format';
import { blankDoc } from './lin/model';
import { SAMPLE_DIAGRAM } from './lin/sample';
import { sampleBricks, sampleHeart } from './lpx/sample';
import type { DocMeta, Draft, Folder, Import, Kind, NewDoc, Opened, Query, Saved, VersionMeta } from './types';

const MAX_NAME = 120;
const RECENT = 50;

type Fail = { code: string; message: string };
const invalid = (message: string): Fail => ({ code: 'invalid', message });
const notFound = (what: string): Fail => ({ code: 'not_found', message: `${what} not found` });

interface Version extends VersionMeta {
  doc: number;
  content: string;
}

/** linear-store's `clean_name`: trimmed, without the kind's extension, and refused when unusable. */
export function cleanName(name: string, kind: Kind): string {
  let n = name.trim();
  const ext = `.${kind}`;
  if (n.length > ext.length && n.toLowerCase().endsWith(ext)) n = n.slice(0, -ext.length).trimEnd();
  if (!n) throw invalid("a name can't be empty");
  if ([...n].length > MAX_NAME) throw invalid(`a name can be at most ${MAX_NAME} characters`);
  // eslint-disable-next-line no-control-regex
  if (/[/:\u0000-\u001f\u007f]/.test(n)) throw invalid("a name can't contain / or :");
  return n;
}

/** linear-store's `free_name`: `wanted`, or the first "wanted 2", "wanted 3", … not in `taken` (lowercased). */
export function freeName(taken: readonly string[], wanted: string): string {
  if (!taken.includes(wanted.toLowerCase())) return wanted;
  const m = /^(.*) (\d+)$/.exec(wanted);
  const [stem, start] = m && Number(m[2]) >= 2 ? [m[1], Number(m[2]) + 1] : [wanted, 2];
  for (let n = start; ; n++) {
    const name = `${stem} ${n}`;
    if (!taken.includes(name.toLowerCase())) return name;
  }
}

const SAMPLE_FLOW = serializeLin(SAMPLE_DIAGRAM);

const BLANK_LIN = serializeLin(blankDoc());
// A stand-in until drawings exist (M5); only the library looks at it.
const SAMPLE_LDW = '{"ldw":1,"w":1600,"h":1000,"bg":"#ffffff","next":1,"items":[]}\n';

export class MockLibrary {
  private docs: DocMeta[] = [];
  private folders: Folder[] = [];
  private versions: Version[] = [];
  private drafts = new Map<number, Draft>();
  private nextId = 1;
  private clock = Date.now() - 1000 * 60 * 60 * 24 * 3;
  keep = 50;

  constructor(seed = true) {
    if (!seed) return;
    const work = this.createFolder(null, 'Work');
    const sprites = this.createFolder(null, 'Sprites');
    this.createFolder(work.id, 'Archive');
    const flow = this.createDocument({ name: 'System flow', kind: 'lin', folder: work.id, content: SAMPLE_FLOW });
    this.createDocument({ name: 'Login sequence', kind: 'lin', folder: null, content: BLANK_LIN });
    this.createDocument({ name: 'Heart', kind: 'lpx', folder: sprites.id, content: sampleHeart() });
    this.createDocument({ name: 'Bricks', kind: 'lpx', folder: null, content: sampleBricks() });
    this.createDocument({ name: 'Napkin sketch', kind: 'ldw', folder: null, content: SAMPLE_LDW });
    const old = this.createDocument({ name: 'Old ideas', kind: 'lin', folder: null, content: BLANK_LIN });
    this.setPinned(flow.id, true);
    this.openDocument(flow.id);
    this.trashDocument(old.id);
  }

  /** A clock that always moves on, so orderings are stable in a fast test. */
  private now() {
    this.clock = Math.max(this.clock + 1, Date.now());
    return this.clock;
  }

  private doc(id: number): DocMeta {
    const d = this.docs.find((d) => d.id === id);
    if (!d) throw notFound('document');
    return d;
  }

  private folder(id: number): Folder {
    const f = this.folders.find((f) => f.id === id);
    if (!f) throw notFound('folder');
    return f;
  }

  private namesIn(folder: number | null, except?: number) {
    return this.docs.filter((d) => d.folderId === folder && d.trashedAt === null && d.id !== except).map((d) => d.name.toLowerCase());
  }

  private head(id: number): Version {
    const v = this.versions.filter((v) => v.doc === id).at(-1);
    if (!v) throw notFound('version');
    return v;
  }

  private addVersion(doc: number, content: string): VersionMeta {
    const v: Version = { id: this.nextId++, doc, content, bytes: new TextEncoder().encode(content).length, createdAt: this.now() };
    this.versions.push(v);
    const mine = this.versions.filter((x) => x.doc === doc);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - this.keep)).map((x) => x.id));
    this.versions = this.versions.filter((x) => !drop.has(x.id));
    return { id: v.id, bytes: v.bytes, createdAt: v.createdAt };
  }

  private copy = (d: DocMeta): DocMeta => ({ ...d });

  /** Every document, newest version included: for the mock to draw thumbnails from. */
  everything(): { meta: DocMeta; content: string }[] {
    return this.docs.map((d) => ({ meta: this.copy(d), content: this.head(d.id).content }));
  }

  setHasThumbnail(id: number, has: boolean) {
    this.doc(id).hasThumbnail = has;
  }

  listDocuments(q: Query): DocMeta[] {
    let out = this.docs.filter((d) => {
      switch (q.view) {
        case 'all':
          return d.trashedAt === null;
        case 'recent':
          return d.trashedAt === null && d.openedAt !== null;
        case 'pinned':
          return d.trashedAt === null && d.pinned;
        case 'trash':
          return d.trashedAt !== null;
        case 'folder':
          return d.trashedAt === null && d.folderId === (q.folder ?? null);
      }
    });
    if (q.kind) out = out.filter((d) => d.kind === q.kind);
    const s = q.search?.trim().toLowerCase();
    if (s) out = out.filter((d) => d.name.toLowerCase().includes(s));
    const by = (key: (d: DocMeta) => number) => (a: DocMeta, b: DocMeta) => key(b) - key(a) || b.id - a.id;
    if (q.view === 'recent') return out.sort(by((d) => d.openedAt!)).slice(0, RECENT).map(this.copy);
    if (q.view === 'trash') return out.sort(by((d) => d.trashedAt!)).map(this.copy);
    if (q.sort === 'name') out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id);
    else if (q.sort === 'created') out.sort(by((d) => d.createdAt));
    else out.sort(by((d) => d.updatedAt));
    return out.map(this.copy);
  }

  listFolders(): Folder[] {
    return [...this.folders].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id).map((f) => ({ ...f }));
  }

  private checkFolderName(name: string, parent: number | null, except?: number): string {
    const n = name.trim();
    if (!n) throw invalid("a folder's name can't be empty");
    if (/[/:]/.test(n)) throw invalid("a folder's name can't contain / or :");
    if (this.folders.some((f) => f.parentId === parent && f.id !== except && f.name.toLowerCase() === n.toLowerCase())) {
      throw invalid(`there's already a folder called "${n}" here`);
    }
    return n;
  }

  createFolder(parent: number | null, name: string): Folder {
    if (parent !== null) this.folder(parent);
    const f: Folder = { id: this.nextId++, parentId: parent, name: this.checkFolderName(name, parent), createdAt: this.now() };
    this.folders.push(f);
    return { ...f };
  }

  renameFolder(id: number, name: string): Folder {
    const f = this.folder(id);
    f.name = this.checkFolderName(name, f.parentId, id);
    return { ...f };
  }

  private subtree(id: number): number[] {
    const out = [id];
    for (let i = 0; i < out.length; i++) for (const f of this.folders) if (f.parentId === out[i]) out.push(f.id);
    return out;
  }

  moveFolder(id: number, parent: number | null): Folder {
    const f = this.folder(id);
    if (parent !== null) {
      this.folder(parent);
      if (this.subtree(id).includes(parent)) throw invalid(`${f.name} can't go inside itself`);
    }
    if (f.parentId === parent) return { ...f };
    this.checkFolderName(f.name, parent, id);
    f.parentId = parent;
    return { ...f };
  }

  deleteFolder(id: number): number {
    const f = this.folder(id);
    const gone = new Set(this.subtree(id));
    const moving = this.docs.filter((d) => d.folderId !== null && gone.has(d.folderId)).sort((a, b) => a.id - b.id);
    for (const d of moving) this.moveDocument(d.id, f.parentId);
    this.folders = this.folders.filter((x) => !gone.has(x.id));
    return moving.length;
  }

  createDocument(n: NewDoc): DocMeta {
    let name = cleanName(n.name, n.kind);
    if (n.folder !== null) this.folder(n.folder);
    name = freeName(this.namesIn(n.folder), name);
    const now = this.now();
    const d: DocMeta = {
      id: this.nextId++,
      folderId: n.folder,
      name,
      kind: n.kind,
      hasThumbnail: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      openedAt: null,
      trashedAt: null,
    };
    this.docs.push(d);
    this.addVersion(d.id, n.content);
    return this.copy(d);
  }

  openDocument(id: number): Opened {
    const d = this.doc(id);
    if (d.trashedAt === null) d.openedAt = this.now();
    const v = this.head(id);
    return {
      meta: this.copy(d),
      version: { id: v.id, bytes: v.bytes, createdAt: v.createdAt },
      content: v.content,
      draft: this.drafts.get(id) ?? null,
    };
  }

  saveDocument(id: number, content: string): Saved {
    const d = this.doc(id);
    if (d.trashedAt !== null) throw invalid(`${d.name} is in the Trash; put it back to save it`);
    this.drafts.delete(id);
    if (this.head(id).content === content) return { status: 'unchanged' };
    const version = this.addVersion(id, content);
    d.updatedAt = version.createdAt;
    return { status: 'saved', meta: this.copy(d), version };
  }

  documentContent(id: number): string {
    this.doc(id);
    return this.head(id).content;
  }

  renameDocument(id: number, name: string): DocMeta {
    const d = this.doc(id);
    const n = cleanName(name, d.kind);
    if (d.trashedAt === null && this.namesIn(d.folderId, id).includes(n.toLowerCase())) {
      throw invalid(`there's already a document called "${n}" here`);
    }
    d.name = n;
    return this.copy(d);
  }

  moveDocument(id: number, folder: number | null): DocMeta {
    const d = this.doc(id);
    if (folder !== null) this.folder(folder);
    if (d.folderId === folder) return this.copy(d);
    if (d.trashedAt === null) d.name = freeName(this.namesIn(folder, id), d.name);
    d.folderId = folder;
    return this.copy(d);
  }

  duplicateDocument(id: number): DocMeta {
    const d = this.doc(id);
    return this.createDocument({ name: `${d.name} copy`, kind: d.kind, folder: d.folderId, content: this.head(id).content });
  }

  setPinned(id: number, pinned: boolean): DocMeta {
    const d = this.doc(id);
    d.pinned = pinned;
    return this.copy(d);
  }

  trashDocument(id: number): DocMeta {
    const d = this.doc(id);
    d.trashedAt ??= this.now();
    return this.copy(d);
  }

  restoreDocument(id: number): DocMeta {
    const d = this.doc(id);
    if (d.trashedAt === null) return this.copy(d);
    if (d.folderId !== null && !this.folders.some((f) => f.id === d.folderId)) d.folderId = null;
    d.name = freeName(this.namesIn(d.folderId, id), d.name);
    d.trashedAt = null;
    return this.copy(d);
  }

  deleteDocument(id: number) {
    const d = this.doc(id);
    if (d.trashedAt === null) throw invalid(`${d.name} isn't in the Trash`);
    this.forget([id]);
  }

  emptyTrash(): number {
    const ids = this.docs.filter((d) => d.trashedAt !== null).map((d) => d.id);
    this.forget(ids);
    return ids.length;
  }

  private forget(ids: number[]) {
    const gone = new Set(ids);
    this.docs = this.docs.filter((d) => !gone.has(d.id));
    this.versions = this.versions.filter((v) => !gone.has(v.doc));
    for (const id of ids) this.drafts.delete(id);
  }

  listVersions(id: number): VersionMeta[] {
    this.doc(id);
    return this.versions
      .filter((v) => v.doc === id)
      .reverse()
      .map((v) => ({ id: v.id, bytes: v.bytes, createdAt: v.createdAt }));
  }

  readVersion(version: number): string {
    const v = this.versions.find((v) => v.id === version);
    if (!v) throw notFound('version');
    return v.content;
  }

  restoreVersion(version: number): Saved {
    const v = this.versions.find((v) => v.id === version);
    if (!v) throw notFound('version');
    return this.saveDocument(v.doc, v.content);
  }

  putDraft(id: number, baseVersionId: number, content: string) {
    this.doc(id);
    this.drafts.set(id, { baseVersionId, content, updatedAt: this.now() });
  }

  discardDraft(id: number) {
    this.drafts.delete(id);
  }
}

/** Reads a browser File the way `read_import` reads a path. */
export async function importFromFile(file: File): Promise<Import> {
  const m = /^(.*)\.(lin|lpx|ldw)$/i.exec(file.name);
  if (!m) throw invalid(`${file.name}: linear opens .lin, .lpx and .ldw files`);
  return { name: m[1], kind: m[2].toLowerCase() as Kind, text: await file.text() };
}
