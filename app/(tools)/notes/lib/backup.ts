import { htmlToPlainText } from "./convert";
import { db, type Folder, type Note, type Template } from "./db";

const FORMAT = "toolbox-notes";

type Backup = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  notes: Note[];
  folders: Folder[];
  templates: Template[];
};

export async function exportBackup(): Promise<void> {
  const backup: Backup = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: await db.notes.toArray(),
    folders: await db.folders.toArray(),
    templates: await db.templates.toArray(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notes-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && isFinite(v) ? v : fallback);

/** Validates a backup file and returns cleaned records, or throws with a readable message. */
export function parseBackup(json: string) {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isObj(data) || data.format !== FORMAT || !Array.isArray(data.notes)) {
    throw new Error("That file isn't a notes backup exported from this tool.");
  }

  const now = Date.now();
  const folders: Folder[] = (Array.isArray(data.folders) ? data.folders : [])
    .filter(isObj)
    .filter((f) => str(f.id) && str(f.name))
    .map((f) => ({ id: str(f.id), name: str(f.name), createdAt: num(f.createdAt, now) }));

  const notes: Note[] = data.notes
    .filter(isObj)
    .filter((n) => str(n.id))
    .map((n) => {
      const content = str(n.content);
      const folderId = str(n.folderId) || null;
      return {
        id: str(n.id),
        title: str(n.title),
        content,
        text: str(n.text) || htmlToPlainText(content),
        folderId,
        tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === "string") : [],
        createdAt: num(n.createdAt, now),
        updatedAt: num(n.updatedAt, now),
      };
    });

  const templates: Template[] = (Array.isArray(data.templates) ? data.templates : [])
    .filter(isObj)
    .filter((t) => str(t.id))
    .map((t) => ({
      id: str(t.id),
      name: str(t.name, "Untitled template"),
      content: str(t.content),
      createdAt: num(t.createdAt, now),
      updatedAt: num(t.updatedAt, now),
    }));

  return { notes, folders, templates };
}

/** Merges a backup in: records with the same ID are replaced, others are added. */
export async function importBackup(parsed: ReturnType<typeof parseBackup>) {
  const { notes, folders, templates } = parsed;
  await db.transaction("rw", db.notes, db.folders, db.templates, async () => {
    await db.folders.bulkPut(folders);
    const known = new Set([...(await db.folders.toCollection().primaryKeys())]);
    // A note pointing at a folder that exists nowhere goes to "no folder".
    await db.notes.bulkPut(
      notes.map((n) => (n.folderId && !known.has(n.folderId) ? { ...n, folderId: null } : n)),
    );
    await db.templates.bulkPut(templates);
  });
}
