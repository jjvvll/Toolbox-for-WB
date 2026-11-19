import Dexie, { type EntityTable } from "dexie";
import { askConfirm } from "@/components/ask-dialog";

/** The link fields at the top of a note. */
export const LINK_FIELDS = [
  { key: "frontEnd", label: "Front End", title: "Front End" },
  { key: "clientFolder", label: "Client Folder", title: "Client Folder" },
  { key: "briefing", label: "BD", title: "Briefing Document" },
  { key: "onboarding", label: "Onboarding Folder", title: "Onboarding Folder" },
] as const;
export type LinkKey = (typeof LINK_FIELDS)[number]["key"];

/** The sections after the opportunity, each with its own notes. */
export const NOTE_SECTIONS = [
  { key: "business", label: "Business Details" },
  { key: "agents", label: "Agents" },
  { key: "neighborhoods", label: "Neighborhoods" },
  { key: "pricepoint", label: "Client pricepoint" },
  { key: "design", label: "Design" },
] as const;
export type SectionKey = (typeof NOTE_SECTIONS)[number]["key"];

/** The opportunity: the client's notes, the reference they picked, and why they picked it. */
export type Opportunity = {
  /** Tiptap HTML. */
  notes: string;
  /** Usually a link, or a short description. */
  reference: string;
  /** Tiptap HTML. */
  reason: string;
};
export const EMPTY_OPPORTUNITY: Opportunity = { notes: "", reference: "", reason: "" };

/** Extra fields of the Design section. */
export type DesignDetails = {
  /** A link to the moodboard (or a short description). */
  moodboard: string;
  /** Tiptap HTML. */
  typography: string;
  /** Tiptap HTML. */
  summary: string;
  /** Tiptap HTML. */
  more: string;
};
export const EMPTY_DESIGN: DesignDetails = { moodboard: "", typography: "", summary: "", more: "" };
export const DESIGN_FIELDS = [
  { key: "typography", label: "Typography" },
  { key: "summary", label: "Summary" },
  { key: "more", label: "More details" },
] as const;

/** The parts of the compliance page, each with a link and pasted guidelines. */
export const COMPLIANCE_PARTS = [
  { key: "state", label: "State compliance" },
  { key: "mls", label: "MLS compliance" },
  { key: "brokerage", label: "Brokerage compliance" },
] as const;
export type ComplianceKey = (typeof COMPLIANCE_PARTS)[number]["key"];
export type CompliancePart = {
  /** A link to the guidelines (or a short description). */
  link: string;
  /** Tiptap HTML. */
  notes: string;
};
export type Compliance = Partial<Record<ComplianceKey, CompliancePart>>;
export const EMPTY_COMPLIANCE_PART: CompliancePart = { link: "", notes: "" };

/** A note's compliance parts. Text from the first version (one text area) goes under State compliance. */
export function complianceOf(note: Pick<Note, "compliance">): Compliance {
  const c = note.compliance;
  if (typeof c === "string") return c ? { state: { link: "", notes: c } } : {};
  return c ?? {};
}

export type Note = {
  id: string;
  title: string;
  /** Main ticket notes (Tiptap HTML). Notes made before the redesign keep their text here. */
  content: string;
  /** Plain text of every field, kept for search and previews. */
  text: string;
  /** Missing on notes made before the redesign. */
  links?: Partial<Record<LinkKey, string>>;
  opportunity?: Opportunity;
  /** Notes for each section (Tiptap HTML). */
  sections?: Partial<Record<SectionKey, string>>;
  /** A link for each section. */
  sectionLinks?: Partial<Record<SectionKey, string>>;
  /** The Design section's extra fields. */
  design?: DesignDetails;
  /**
   * Page 2 of the note window: pasted compliance guidelines, in three parts. A plain string
   * is the first version (one big text area); `complianceOf` reads either.
   */
  compliance?: Compliance | string;
  /**
   * The first version of the layout kept notes, reference and reason per section. Read
   * once by `sectionsOf`, which moves them into `sections`; not written any more.
   */
  opportunities?: Partial<Record<SectionKey, Opportunity>>;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  /** Set automatically on every change (older folders get it on their next change). */
  updatedAt?: number;
};

export type Template = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

/** The tables copied to the database (Supabase). */
export const SYNCED_TABLES = ["notes", "folders", "templates"] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** The last version of a record the database has: `rev` is the record's updatedAt when it was saved there. */
export type SyncMark = { key: string; rev: number };
/** A record deleted here that the database doesn't know about yet. */
export type Tombstone = { key: string; table: SyncedTable; id: string; at: number };
export const syncKey = (table: SyncedTable, id: string) => `${table}:${id}`;

// Everything is saved in this browser's IndexedDB first, so typing never waits on the
// network; lib/sync.ts then copies changes to the database and keeps retrying until it has them.
export const db = new Dexie("toolbox-notes") as Dexie & {
  notes: EntityTable<Note, "id">;
  folders: EntityTable<Folder, "id">;
  templates: EntityTable<Template, "id">;
  synced: EntityTable<SyncMark, "key">;
  tombstones: EntityTable<Tombstone, "key">;
};

db.version(1).stores({
  notes: "id, folderId, *tags, updatedAt",
  folders: "id, name",
  templates: "id, name, updatedAt",
});
db.version(2).stores({
  synced: "key",
  tombstones: "key",
});

// Every change gets a fresh updatedAt, which is how the sync spots what the database
// doesn't have yet. A write that sets updatedAt itself (like a record coming from the
// database) keeps its own.
for (const table of [db.notes, db.folders, db.templates]) {
  const t = table as unknown as EntityTable<{ id: string; updatedAt?: number }, "id">;
  t.hook("creating", (_key, obj) => {
    if (!obj.updatedAt) obj.updatedAt = Date.now();
  });
  t.hook("updating", (mods) => ("updatedAt" in mods ? undefined : { updatedAt: Date.now() }));
}

/**
 * Deletes a note after asking twice ("Are you sure?", then "Are you really sure?").
 * Returns whether it was deleted. It's deleted here and in the database.
 */
export async function deleteNoteWithConfirm(note: Pick<Note, "id" | "title">): Promise<boolean> {
  const name = note.title.trim() || "Untitled";
  if (!(await askConfirm({ title: `Delete “${name}”?`, message: "Are you sure you want to delete this note?", confirmLabel: "Delete", danger: true }))) return false;
  if (!(await askConfirm({ title: "Are you really sure?", message: `“${name}” will be deleted here and from the database, and it can't be undone.`, confirmLabel: "Delete for good", danger: true }))) return false;
  await deleteRecords("notes", [note.id]);
  return true;
}

/** Deletes records here and remembers to delete them in the database too. */
export async function deleteRecords(table: SyncedTable, ids: string[]) {
  const at = Date.now();
  await db.transaction("rw", db[table], db.tombstones, async () => {
    await db[table].bulkDelete(ids);
    await db.tombstones.bulkPut(ids.map((id) => ({ key: syncKey(table, id), table, id, at })));
  });
}

export const newId = () => crypto.randomUUID();

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * A note's section notes. Notes from the first version of the layout had notes,
 * reference and reason in every section; those are joined into the section's notes.
 */
export function sectionsOf(note: Pick<Note, "sections" | "opportunities">): Partial<Record<SectionKey, string>> {
  if (note.sections || !note.opportunities) return note.sections ?? {};
  const out: Partial<Record<SectionKey, string>> = {};
  for (const s of NOTE_SECTIONS) {
    const o = note.opportunities[s.key];
    if (!o) continue;
    const html = [
      o.notes,
      o.reference.trim() && `<p><strong>Reference:</strong> ${escapeHtml(o.reference.trim())}</p>`,
      o.reason && `<p><strong>Reason:</strong></p>${o.reason}`,
    ]
      .filter(Boolean)
      .join("");
    if (html) out[s.key] = html;
  }
  return out;
}

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
  await db.transaction("rw", db.folders, db.notes, db.tombstones, async () => {
    await db.notes.where("folderId").equals(id).modify({ folderId: null });
    await db.folders.delete(id);
    await db.tombstones.put({ key: syncKey("folders", id), table: "folders", id, at: Date.now() });
  });
}

export const normalizeTag = (tag: string) => tag.trim().replace(/^#/, "").toLowerCase();
