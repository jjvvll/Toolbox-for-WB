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

/** The parts of the compliance page: each lists its states / MLSs / brokerages (a name and a link each) and the pasted guidelines. */
export const COMPLIANCE_PARTS = [
  { key: "state", label: "State compliance", item: "state" },
  { key: "mls", label: "MLS compliance", item: "MLS" },
  { key: "brokerage", label: "Brokerage compliance", item: "brokerage" },
] as const;
export type ComplianceKey = (typeof COMPLIANCE_PARTS)[number]["key"];
/** One state, MLS or brokerage: its name and a link to its guidelines. */
export type ComplianceEntry = { title: string; link: string };
export type CompliancePart = {
  /** Usually one, sometimes two or more. Read through `complianceEntries`, which also reads the older shapes below. */
  entries?: ComplianceEntry[];
  /** Older shape: one link for the whole part. */
  link?: string;
  /** Older shape (briefly): names without their own links. */
  titles?: string[];
  /** Tiptap HTML. */
  notes: string;
};
export type Compliance = Partial<Record<ComplianceKey, CompliancePart>>;
export const EMPTY_COMPLIANCE_PART: CompliancePart = { notes: "" };

/**
 * A part's entries. Parts saved before entries existed are converted the same way the SQL
 * view does it: each older title becomes an entry, the first one taking the part's old link;
 * a link with no titles becomes one unnamed entry.
 */
export function complianceEntries(part: CompliancePart | undefined): ComplianceEntry[] {
  if (!part) return [];
  if (Array.isArray(part.entries)) return part.entries;
  const link = part.link?.trim() ?? "";
  if (part.titles?.length) return part.titles.map((title, i) => ({ title, link: i === 0 ? link : "" }));
  return link ? [{ title: "", link }] : [];
}

/** A note's compliance parts. Text from the first version (one text area) goes under State compliance. */
export function complianceOf(note: Pick<Note, "compliance">): Compliance {
  const c = note.compliance;
  if (typeof c === "string") return c ? { state: { notes: c } } : {};
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

// ---------- the change feed ----------
//
// Which records were just written, with their new values, so the notes grid and the sync
// can update only what changed instead of reloading every note after each save. Reported
// once the write is committed (nothing for a write that's rolled back), and also for writes
// made in other tabs of this browser.

export type SyncedRecord = { id: string; updatedAt?: number } & Record<string, unknown>;
export type RecordChanges = {
  table: SyncedTable;
  /** New values of records added or changed here. Null when the change came from another tab (read it if needed). */
  puts: Map<string, SyncedRecord | null>;
  deletes: Set<string>;
  /** True when the write was made in another tab. */
  remote: boolean;
};

const changeListeners = new Set<(c: RecordChanges) => void>();
/** Calls `fn` after every committed write to notes, folders or templates. Returns the unsubscribe. */
export function onRecordsChanged(fn: (c: RecordChanges) => void) {
  changeListeners.add(fn);
  return () => void changeListeners.delete(fn);
}
const emitChanges = (c: RecordChanges) => changeListeners.forEach((fn) => fn(c));

type Pending = Map<SyncedTable, { puts: Map<string, SyncedRecord>; deletes: Set<string> }>;
const pendingByTrans = new WeakMap<object, Pending>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("toolbox-notes-changes") : null;

type DexieTrans = { parent?: DexieTrans; on: (event: "complete", fn: () => void) => void };
function track(trans: DexieTrans, table: SyncedTable, id: string, value: SyncedRecord | null) {
  let root = trans;
  while (root.parent) root = root.parent; // a nested transaction commits with its outermost one
  let pending = pendingByTrans.get(root);
  if (!pending) {
    const p: Pending = new Map();
    pending = p;
    pendingByTrans.set(root, p);
    root.on("complete", () => {
      for (const [t, { puts, deletes }] of p) {
        emitChanges({ table: t, puts, deletes, remote: false });
        channel?.postMessage({ table: t, puts: [...puts.keys()], deletes: [...deletes] });
      }
    });
  }
  let c = pending.get(table);
  if (!c) pending.set(table, (c = { puts: new Map(), deletes: new Set() }));
  if (value) {
    c.puts.set(id, value);
    c.deletes.delete(id);
  } else {
    c.puts.delete(id);
    c.deletes.add(id);
  }
}

for (const name of SYNCED_TABLES) {
  const t = db[name] as unknown as EntityTable<SyncedRecord, "id">;
  t.hook("creating", function (key, obj, trans) {
    // `obj` is the stored object; the hook above has already given it its updatedAt.
    track(trans as unknown as DexieTrans, name, String(key ?? obj.id), obj);
  });
  t.hook("updating", function (_mods, key, _obj, trans) {
    // Called with the stored value once the write has gone through.
    this.onsuccess = (updated: SyncedRecord) => track(trans as unknown as DexieTrans, name, String(key), updated);
  });
  t.hook("deleting", function (key, _obj, trans) {
    track(trans as unknown as DexieTrans, name, String(key), null);
  });
}

channel?.addEventListener("message", (e: MessageEvent<{ table: SyncedTable; puts: string[]; deletes: string[] }>) => {
  const { table, puts, deletes } = e.data;
  emitChanges({ table, puts: new Map(puts.map((id) => [id, null])), deletes: new Set(deletes), remote: true });
});

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
