"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import CopyMenu from "./copy-menu";
import QuickSearch from "./quick-search";
import { CardSyncMark, SyncBanner } from "./sync-status";
import TemplatesDialog from "./templates-dialog";
import { exportBackup, importBackup, parseBackup } from "./lib/backup";
import { htmlToPlainText, noteFullHtml } from "./lib/convert";
import { LINK_FIELDS, NOTE_SECTIONS, createNote, sectionsOf, db, deleteFolder, newId, type Folder, type Note } from "./lib/db";
import { openNote, useNoteWindow } from "./lib/note-window";
import { displayTitle, noteMatcher, relativeTime } from "./lib/search";

type Filter = { kind: "all" } | { kind: "unfiled" } | { kind: "folder"; id: string } | { kind: "tag"; tag: string };

const smallButtonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";
const chipClass = (active: boolean) =>
  `flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
    active ? "bg-foreground text-background" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
  }`;

export default function NotesApp() {
  const notes = useLiveQuery(() => db.notes.orderBy("updatedAt").reverse().toArray(), []);
  const folders = useLiveQuery(() => db.folders.orderBy("name").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const win = useNoteWindow();

  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  // Ask the browser not to evict this data under storage pressure.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // Ctrl/Cmd+K opens quick search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes ?? []) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const visibleNotes = useMemo(() => {
    const matcher = noteMatcher(search);
    return (notes ?? []).filter((n) => {
      if (filter.kind === "unfiled" && n.folderId) return false;
      if (filter.kind === "folder" && n.folderId !== filter.id) return false;
      if (filter.kind === "tag" && !n.tags.includes(filter.tag)) return false;
      return !matcher || matcher(n);
    });
  }, [notes, filter, search]);

  // A note created while a folder or tag is picked goes into it.
  const newNoteDefaults = (): Partial<Note> => ({
    folderId: filter.kind === "folder" ? filter.id : null,
    tags: filter.kind === "tag" ? [filter.tag] : [],
  });

  async function addNote() {
    openNote(await createNote(newNoteDefaults()));
  }

  async function addNoteFromTemplate(templateId: string) {
    const t = await db.templates.get(templateId);
    if (!t) return;
    setTemplatesOpen(false);
    setTemplateMenuOpen(false);
    // A template fills the main ticket notes.
    openNote(await createNote({ ...newNoteDefaults(), content: t.content, text: htmlToPlainText(t.content) }));
  }

  async function addFolder() {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    const id = newId();
    await db.folders.add({ id, name, createdAt: Date.now() });
    setFilter({ kind: "folder", id });
  }

  async function renameFolder(folder: Folder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (name && name !== folder.name) await db.folders.update(folder.id, { name });
  }

  async function removeFolder(folder: Folder) {
    const count = notes?.filter((n) => n.folderId === folder.id).length ?? 0;
    const detail = count ? ` Its ${count} note${count === 1 ? "" : "s"} will move to “No folder”.` : "";
    if (!window.confirm(`Delete the folder “${folder.name}”?${detail}`)) return;
    await deleteFolder(folder.id);
    if (filter.kind === "folder" && filter.id === folder.id) setFilter({ kind: "all" });
  }

  async function onImportFile(file: File) {
    try {
      const parsed = parseBackup(await file.text());
      const { notes: n, folders: f, templates: t } = parsed;
      const ok = window.confirm(
        `Import ${n.length} notes, ${f.length} folders, and ${t.length} templates?\n\n` +
          "They are merged with your current data. Items with the same ID are replaced by the imported version.",
      );
      if (!ok) return;
      await importBackup(parsed);
      setStatus({ kind: "ok", text: `Imported ${n.length} notes, ${f.length} folders, ${t.length} templates.` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!notes || !folders || !templates) {
    return <p className="mt-8 text-sm text-zinc-500">Loading notes…</p>;
  }

  const isFilter = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);
  const currentFolder = filter.kind === "folder" ? folders.find((f) => f.id === filter.id) : undefined;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {status && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            status.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          {status.text}
        </p>
      )}

      {/* Whether everything has reached the database yet. */}
      <SyncBanner />

      {/* Toolbar: search, new note, templates, backup */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, links and notes"
            aria-label="Search notes"
            className="w-full rounded-lg border border-zinc-300 bg-background py-2 pl-3 pr-16 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            title="Quick search (Ctrl+K)"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-zinc-300 px-1.5 text-[10px] text-zinc-500 dark:border-zinc-700"
          >
            Ctrl K
          </button>
        </div>
        <button type="button" onClick={addNote} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + New note
        </button>
        <div className="relative">
          <button type="button" onClick={() => setTemplateMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={templateMenuOpen} className={smallButtonClass}>
            From template ▾
          </button>
          {templateMenuOpen && (
            <TemplateMenu
              templates={templates}
              onPick={addNoteFromTemplate}
              onManage={() => {
                setTemplateMenuOpen(false);
                setTemplatesOpen(true);
              }}
              onClose={() => setTemplateMenuOpen(false)}
            />
          )}
        </div>
        <button type="button" onClick={() => exportBackup()} className={smallButtonClass} title="Download every note as a backup file">
          Export
        </button>
        <button type="button" onClick={() => importInput.current?.click()} className={smallButtonClass} title="Add notes from a backup file">
          Import
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onImportFile(file);
          }}
        />
      </div>

      {/* Filters: folders, then tags */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chipClass(isFilter({ kind: "all" }))} onClick={() => setFilter({ kind: "all" })}>
            All <span className="text-xs opacity-60">{notes.length}</span>
          </button>
          <button type="button" className={chipClass(isFilter({ kind: "unfiled" }))} onClick={() => setFilter({ kind: "unfiled" })}>
            No folder <span className="text-xs opacity-60">{notes.filter((n) => !n.folderId).length}</span>
          </button>
          {folders.map((f) => (
            <button key={f.id} type="button" className={chipClass(isFilter({ kind: "folder", id: f.id }))} onClick={() => setFilter({ kind: "folder", id: f.id })}>
              📁 {f.name} <span className="text-xs opacity-60">{notes.filter((n) => n.folderId === f.id).length}</span>
            </button>
          ))}
          <button type="button" onClick={addFolder} className="rounded-full px-2.5 py-1 text-sm text-blue-600 hover:underline dark:text-blue-400">
            + Folder
          </button>
          {currentFolder && (
            <span className="ml-1 flex gap-1 text-xs">
              <button type="button" onClick={() => renameFolder(currentFolder)} className="text-zinc-500 hover:text-foreground">
                Rename
              </button>
              ·
              <button type="button" onClick={() => removeFolder(currentFolder)} className="text-zinc-500 hover:text-red-600">
                Delete folder
              </button>
            </span>
          )}
        </div>
        {tagCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilter(isFilter({ kind: "tag", tag }) ? { kind: "all" } : { kind: "tag", tag })}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isFilter({ kind: "tag", tag }) ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                #{tag} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The grid */}
      {visibleNotes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">{notes.length === 0 ? "No notes yet." : "No notes match."}</p>
          {notes.length === 0 && (
            <button type="button" onClick={addNote} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Create your first note
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleNotes.map((n) => (
            <li key={n.id}>
              <NoteCard note={n} folder={folders.find((f) => f.id === n.folderId)} isOpen={win.id === n.id} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-zinc-500">
        Click a note to open it in a window that stays open while you use other tools. Notes save in this browser first, then to your
        database; the bar at the top says when everything has arrived.
      </p>

      {quickOpen && (
        <QuickSearch
          notes={notes}
          folders={folders}
          onClose={() => setQuickOpen(false)}
          onSelect={(id) => {
            setQuickOpen(false);
            openNote(id);
          }}
        />
      )}
      {templatesOpen && <TemplatesDialog onClose={() => setTemplatesOpen(false)} onUse={addNoteFromTemplate} />}
    </div>
  );
}

/** A card in the grid: title, folder, filled links, a preview, opportunity categories with notes, and tags. */
function NoteCard({ note, folder, isOpen }: { note: Note; folder?: Folder; isOpen: boolean }) {
  const links = LINK_FIELDS.filter((f) => note.links?.[f.key]?.trim());
  const preview = htmlToPlainText(note.content).replace(/\s+/g, " ").trim();
  // Which parts after Main ticket have something in them.
  const o = note.opportunity;
  const sections = sectionsOf(note);
  const filled = [
    ...(o && (htmlToPlainText(o.notes) || o.reference.trim() || htmlToPlainText(o.reason)) ? ["Opportunity"] : []),
    ...NOTE_SECTIONS.filter(
      (x) =>
        htmlToPlainText(sections[x.key] ?? "") ||
        note.sectionLinks?.[x.key]?.trim() ||
        (x.key === "design" && note.design && (note.design.moodboard.trim() || htmlToPlainText(note.design.typography + note.design.summary + note.design.more))),
    ).map((x) => x.label),
  ];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openNote(note.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openNote(note.id))}
      className={`group flex h-full cursor-pointer flex-col gap-2.5 rounded-2xl border p-4 outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isOpen ? "border-blue-400 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30" : "border-zinc-200 bg-background/60 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start gap-2">
        <h3 className="line-clamp-2 flex-1 font-semibold leading-snug">{displayTitle(note)}</h3>
        <CopyMenu compact getNote={() => ({ title: note.title, content: noteFullHtml(note) })} />
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((f) => {
            const value = note.links![f.key]!.trim();
            const url = /^https?:\/\//i.test(value) ? value : /^www\./i.test(value) ? `https://${value}` : null;
            return url ? (
              <a
                key={f.key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={url}
                className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {f.label} ↗
              </a>
            ) : (
              <span key={f.key} title={value} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {f.label}
              </span>
            );
          })}
        </div>
      )}
      {preview && <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{preview}</p>}
      {filled.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filled.map((label) => (
            <span key={label} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-400">
        {folder && <span>📁 {folder.name}</span>}
        {note.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
        <CardSyncMark noteId={note.id} />
        <span className="ml-auto">{isOpen ? "Open" : relativeTime(note.updatedAt)}</span>
      </div>
    </div>
  );
}

function TemplateMenu({
  templates,
  onPick,
  onManage,
  onClose,
}: {
  templates: { id: string; name: string }[];
  onPick: (id: string) => void;
  onManage: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-background py-1 shadow-lg dark:border-zinc-800">
      {templates.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">No templates yet.</p>}
      {templates.map((t) => (
        <button key={t.id} type="button" role="menuitem" onClick={() => onPick(t.id)} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
          {t.name || "Untitled template"}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        onClick={onManage}
        className="block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm text-blue-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-blue-400 dark:hover:bg-zinc-900"
      >
        Manage templates…
      </button>
    </div>
  );
}
