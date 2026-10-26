import Dexie, { type EntityTable } from "dexie";

export type Note = {
  id: string;
  title: string;
  /** Tiptap HTML. */
  content: string;
  /** Plain-text copy of the content, kept for search. */
  text: string;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type Folder = { id: string; name: string; createdAt: number };

export type Template = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

// Everything lives in this browser's IndexedDB; there is no server copy.
export const db = new Dexie("toolbox-notes") as Dexie & {
  notes: EntityTable<Note, "id">;
  folders: EntityTable<Folder, "id">;
  templates: EntityTable<Template, "id">;
};

db.version(1).stores({
  notes: "id, folderId, *tags, updatedAt",
  folders: "id, name",
  templates: "id, name, updatedAt",
});

export const newId = () => crypto.randomUUID();

export async function createNote(fields: Partial<Note> = {}): Promise<string> {
  const now = Date.now();
  const note: Note = {
    id: newId(),
    title: "",
    content: "",
    text: "",
    folderId: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
  await db.notes.add(note);
  return note.id;
}

export function updateNote(id: string, changes: Partial<Omit<Note, "id">>) {
  return db.notes.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteFolder(id: string) {
  // Notes in a deleted folder move back to "no folder" rather than being lost.
  await db.transaction("rw", db.folders, db.notes, async () => {
    await db.notes.where("folderId").equals(id).modify({ folderId: null });
    await db.folders.delete(id);
  });
}

export const normalizeTag = (tag: string) => tag.trim().replace(/^#/, "").toLowerCase();
