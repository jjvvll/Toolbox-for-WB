import { htmlToPlainText } from "./convert";
import { COMPLIANCE_PARTS, LINK_FIELDS, NOTE_SECTIONS, db, syncKey, type CompliancePart, type Folder, type Note, type Template } from "./db";

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

/** The compliance page: its three parts, or the first version's single text (kept as is; `complianceOf` reads both). */
function asCompliance(v: unknown): Note["compliance"] {
  if (typeof v === "string") return v || undefined;
  if (!isObj(v)) return undefined;
  const parts = COMPLIANCE_PARTS.flatMap((p) => {
    const part = v[p.key];
    if (!isObj(part)) return [];
    // Entries (name + link each); older backups have one link and maybe titles, which
    // complianceEntries converts when the note is opened.
    const entries = Array.isArray(part.entries) ? part.entries.filter(isObj).map((e) => ({ title: str(e.title), link: str(e.link) })) : undefined;
    const titles = Array.isArray(part.titles) ? part.titles.filter((t): t is string => typeof t === "string") : undefined;
    const cleaned: CompliancePart = entries
      ? { entries, notes: str(part.notes) }
      : { ...(titles?.length ? { titles } : {}), link: str(part.link), notes: str(part.notes) };
    return [[p.key, cleaned]];
  });
  return parts.length ? Object.fromEntries(parts) : undefined;
}

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
    .map((f) => ({ id: str(f.id), name: str(f.name), createdAt: num(f.createdAt, now), ...(typeof f.order === "number" ? { order: f.order } : {}) }));

  const notes: Note[] = data.notes
    .filter(isObj)
    .filter((n) => str(n.id))
    .map((n) => {
      const content = str(n.content);
      const folderId = str(n.folderId) || null;
      const links = Object.fromEntries(
        LINK_FIELDS.map((f) => [f.key, isObj(n.links) ? str(n.links[f.key]) : ""]).filter(([, v]) => v),
      );
      const asOpportunity = (o: unknown) => (isObj(o) ? { notes: str(o.notes), reference: str(o.reference), reason: str(o.reason) } : undefined);
      const sections = isObj(n.sections)
        ? Object.fromEntries(NOTE_SECTIONS.map((s) => [s.key, str((n.sections as Record<string, unknown>)[s.key])]).filter(([, v]) => v))
        : undefined;
      // Backups from the first version of the layout: notes, reference and reason per section.
      const opportunities = isObj(n.opportunities)
        ? Object.fromEntries(NOTE_SECTIONS.flatMap((s) => {
            const o = asOpportunity((n.opportunities as Record<string, unknown>)[s.key]);
            return o ? [[s.key, o]] : [];
          }))
        : undefined;
      return {
        id: str(n.id),
        title: str(n.title),
        content,
        links,
        opportunity: asOpportunity(n.opportunity),
        sectionLinks: isObj(n.sectionLinks)
          ? Object.fromEntries(NOTE_SECTIONS.map((x) => [x.key, str((n.sectionLinks as Record<string, unknown>)[x.key])]).filter(([, v]) => v))
          : undefined,
        design: isObj(n.design)
          ? { moodboard: str(n.design.moodboard), typography: str(n.design.typography), summary: str(n.design.summary), more: str(n.design.more) }
          : undefined,
        sections,
        opportunities,
        compliance: asCompliance(n.compliance),
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
  await db.transaction("rw", [db.notes, db.folders, db.templates, db.synced, db.tombstones], async () => {
    // Imported records count as not sent yet. Without this, bringing back a deleted note could
    // look already sent, and the next check would delete it again.
    const keys = [
      ...notes.map((n) => syncKey("notes", n.id)),
      ...folders.map((f) => syncKey("folders", f.id)),
      ...templates.map((t) => syncKey("templates", t.id)),
    ];
    await db.synced.bulkDelete(keys);
    await db.tombstones.bulkDelete(keys);
    await db.folders.bulkPut(folders);
    const known = new Set([...(await db.folders.toCollection().primaryKeys())]);
    // A note pointing at a folder that exists nowhere goes to "no folder".
    await db.notes.bulkPut(
      notes.map((n) => (n.folderId && !known.has(n.folderId) ? { ...n, folderId: null } : n)),
    );
    await db.templates.bulkPut(templates);
  });
}
