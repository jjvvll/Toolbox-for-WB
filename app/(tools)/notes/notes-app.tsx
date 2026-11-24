"use client";

import { askConfirm, askText } from "@/components/ask-dialog";
import { useLiveQuery } from "dexie-react-hooks";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CopyMenu from "./copy-menu";
import RfqaButton from "./rfqa-button";
import QuickSearch from "./quick-search";
import FoldersDialog, { removeFolderWithConfirm, renameFolderWithPrompt } from "./folders-dialog";
import { CardSyncMark, SyncBanner } from "./sync-status";
import TemplatesDialog from "./templates-dialog";
import { exportBackup, importBackup, parseBackup } from "./lib/backup";
import { htmlToPlainText, noteFullHtml } from "./lib/convert";
import { LINK_FIELDS, askNewFolder, createNote, deleteNoteWithConfirm, deleteRecords, db, listFolders, type Folder, type Note } from "./lib/db";
import { useNoteIndex, type NoteSummary } from "./lib/note-index";
import { closeNoteWindow, openNote, useNoteWindow } from "./lib/note-window";
import { displayTitle, noteMatcher, relativeTime } from "./lib/search";

type Filter = { kind: "all" } | { kind: "unfiled" } | { kind: "folder"; id: string } | { kind: "tag"; tag: string };

// Manga style: ink-bordered buttons (yellow on hover, from globals.css) and square chips.
const smallButtonClass = "border-2 border-zinc-900 bg-[var(--panel)] px-2.5 py-1.5 text-xs font-bold text-[var(--ink)] disabled:opacity-45";
const chipClass = (active: boolean) =>
  `flex items-center gap-1.5 border-2 px-3 py-1 text-sm font-bold ${
    active ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-zinc-900 bg-[var(--panel)] text-[var(--ink)]"
  }`;

/** A small folder icon for the folder filters. */
const folderIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5" aria-hidden>
    <path d="M2 4h7l2 3h11v13H2Z" />
  </svg>
);

export default function NotesApp() {
  // A lightweight entry per note, updated one note at a time (not every note reloaded on each save).
  const notes = useNoteIndex();
  const folders = useLiveQuery(listFolders, []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const win = useNoteWindow();

  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  // Picking notes to delete: null when not picking.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const toggleSelected = useCallback(
    (id: string) =>
      setSelected((s) => {
        if (!s) return s;
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

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

  // A note whose folder no longer exists (deleted in another browser, say) counts as "No folder".
  const folderIds = useMemo(() => new Set((folders ?? []).map((f) => f.id)), [folders]);
  const isUnfiled = (n: NoteSummary) => !n.folderId || !folderIds.has(n.folderId);

  const visibleNotes = useMemo(() => {
    const matcher = noteMatcher(search);
    return (notes ?? []).filter((n) => {
      if (filter.kind === "unfiled" && n.folderId && folderIds.has(n.folderId)) return false;
      if (filter.kind === "folder" && n.folderId !== filter.id) return false;
      if (filter.kind === "tag" && !n.tags.includes(filter.tag)) return false;
      return !matcher || matcher(n);
    });
  }, [notes, filter, search, folderIds]);

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
    const id = await askNewFolder();
    if (id) setFilter({ kind: "folder", id });
  }

  const countIn = (folderId: string) => notes?.filter((n) => n.folderId === folderId).length ?? 0;

  async function removeFolder(folder: Folder) {
    if ((await removeFolderWithConfirm(folder, countIn(folder.id))) && filter.kind === "folder" && filter.id === folder.id) setFilter({ kind: "all" });
  }

  /**
   * Deletes the selected notes after three confirmations: two questions, then typing DELETE.
   * Deleted here and in the database, in one request.
   */
  async function deleteSelected() {
    // Only notes that still exist (one may have been deleted elsewhere meanwhile).
    const existing = new Set((notes ?? []).map((n) => n.id));
    const ids = [...(selected ?? [])].filter((id) => existing.has(id));
    if (!ids.length) return;
    const shown = new Set(visibleNotes.map((n) => n.id));
    const hidden = ids.filter((id) => !shown.has(id)).length;
    const plural = ids.length === 1 ? "" : "s";
    const what = ids.length === existing.size ? `all ${ids.length} note${plural}` : `${ids.length} selected note${plural}`;
    const hiddenNote = hidden ? ` ${hidden} of them ${hidden === 1 ? "isn't" : "aren't"} shown right now because of the filter or search.` : "";
    if (!(await askConfirm({ title: `Delete ${what}?`, message: `Are you sure?${hiddenNote}`, confirmLabel: "Delete", danger: true }))) return;
    if (
      !(await askConfirm({
        title: "Are you really sure?",
        message: `${what[0].toUpperCase()}${what.slice(1)} will be deleted here and from the database, and it can't be undone. Export a backup first if you might need them.`,
        confirmLabel: "Yes, delete them",
        danger: true,
      }))
    )
      return;
    const typed = await askText({ title: "Last check", label: `Type DELETE to delete ${what}.`, placeholder: "DELETE", confirmLabel: "Delete for good" });
    if (typed?.trim() !== "DELETE") {
      if (typed !== null) setStatus({ kind: "error", text: "Nothing was deleted: the word didn't match." });
      return;
    }
    await deleteRecords("notes", ids);
    if (win.id && ids.includes(win.id)) closeNoteWindow();
    setSelected(null);
    setStatus({ kind: "ok", text: `Deleted ${ids.length} note${plural}.` });
  }

  async function onImportFile(file: File) {
    try {
      const parsed = parseBackup(await file.text());
      const { notes: n, folders: f, templates: t } = parsed;
      const ok = await askConfirm({
        title: `Import ${n.length} notes, ${f.length} folders, and ${t.length} templates?`,
        message: "They are merged with your current data. Items with the same ID are replaced by the imported version.",
        confirmLabel: "Import",
      });
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
            className="w-full border-2 border-zinc-900 bg-background py-2 pl-3 pr-16 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            title="Quick search (Ctrl+K)"
            className="absolute right-2 top-1/2 -translate-y-1/2 border-2 border-zinc-900 bg-[var(--paper)] px-1.5 font-[family-name:var(--font-display)] text-[10px] text-[var(--ink)]"
          >
            Ctrl K
          </button>
        </div>
        <button type="button" onClick={addNote} className="bg-blue-600 px-3.5 py-2 text-sm text-white hover:bg-blue-700">
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
        {!selected && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={notes.length === 0}
            title="Pick notes to delete"
            className="border-2 border-[var(--red-deep)] bg-[var(--panel)] px-2.5 py-1.5 text-xs font-bold text-[var(--red-deep)] hover:bg-[var(--yellow)] disabled:opacity-45"
          >
            Delete…
          </button>
        )}
      </div>

      {/* Filters: folders, then tags */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chipClass(isFilter({ kind: "all" }))} onClick={() => setFilter({ kind: "all" })}>
            All <span className="text-xs opacity-60">{notes.length}</span>
          </button>
          <button type="button" className={chipClass(isFilter({ kind: "unfiled" }))} onClick={() => setFilter({ kind: "unfiled" })}>
            No folder <span className="text-xs opacity-60">{notes.filter(isUnfiled).length}</span>
          </button>
          {folders.map((f) => (
            <button key={f.id} type="button" className={chipClass(isFilter({ kind: "folder", id: f.id }))} onClick={() => setFilter({ kind: "folder", id: f.id })}>
              {folderIcon} {f.name} <span className="text-xs opacity-60">{notes.filter((n) => n.folderId === f.id).length}</span>
            </button>
          ))}
          <button type="button" onClick={addFolder} className="border-2 border-dashed border-[var(--red-deep)] bg-[var(--panel)] px-3 py-1 text-sm font-bold text-[var(--red-deep)] hover:bg-[var(--yellow)]">
            + New folder
          </button>
          {folders.length > 0 && (
            <button type="button" onClick={() => setFoldersOpen(true)} title="Add, rename, rearrange or delete folders" className="px-2 py-1 text-sm font-bold text-[var(--ink-soft)] underline underline-offset-2 hover:text-[var(--red-deep)]">
              Manage folders
            </button>
          )}
        </div>
        {currentFolder && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--ink-soft)]">
              Folder <b>{currentFolder.name}</b>:
            </span>
            <button type="button" onClick={() => renameFolderWithPrompt(currentFolder)} className={smallButtonClass}>
              Rename
            </button>
            <button
              type="button"
              onClick={() => removeFolder(currentFolder)}
              className="border-2 border-[var(--red-deep)] bg-[var(--panel)] px-2.5 py-1.5 text-xs font-bold text-[var(--red-deep)] hover:bg-[var(--yellow)]"
            >
              Delete folder
            </button>
          </div>
        )}
        {tagCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilter(isFilter({ kind: "tag", tag }) ? { kind: "all" } : { kind: "tag", tag })}
                className={`border-2 border-[var(--ink)] px-2 py-0.5 text-xs font-bold ${
                  isFilter({ kind: "tag", tag }) ? "bg-[var(--ink)] text-white" : "bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]"
                }`}
              >
                #{tag} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Picking notes to delete */}
      {selected && (
        <SelectionBar
          count={selected.size}
          allShown={visibleNotes.length > 0 && visibleNotes.every((n) => selected.has(n.id))}
          shownCount={visibleNotes.length}
          onSelectAll={(all) =>
            setSelected((s) => {
              const next = new Set(s);
              for (const n of visibleNotes) {
                if (all) next.add(n.id);
                else next.delete(n.id);
              }
              return next;
            })
          }
          onClear={() => setSelected(new Set())}
          onDelete={deleteSelected}
          onCancel={() => setSelected(null)}
        />
      )}

      {/* The grid */}
      {visibleNotes.length === 0 ? (
        <div className="manga-tone flex flex-col items-center gap-3 border-[3px] border-dashed border-zinc-900 px-6 py-14 text-center">
          <p className="text-sm text-zinc-500">{notes.length === 0 ? "No notes yet." : "No notes match."}</p>
          {notes.length === 0 && (
            <button type="button" onClick={addNote} className="bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              Create your first note
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleNotes.map((n) => (
            <li key={n.id}>
              <NoteCard
                note={n}
                folderName={folders.find((f) => f.id === n.folderId)?.name}
                isOpen={win.id === n.id}
                selecting={!!selected}
                isSelected={!!selected?.has(n.id)}
                onToggleSelected={toggleSelected}
              />
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
      {foldersOpen && <FoldersDialog folders={folders} countIn={countIn} onRemove={removeFolder} onClose={() => setFoldersOpen(false)} />}
      {templatesOpen && <TemplatesDialog onClose={() => setTemplatesOpen(false)} onUse={addNoteFromTemplate} />}
    </div>
  );
}

/** Reads a note in full, for copying from a card (cards only hold a summary). */
const loadForCopy = async (id: string) => {
  const note = await db.notes.get(id);
  return note && { title: note.title, content: noteFullHtml(note) };
};

/** The bar shown while picking notes to delete. */
function SelectionBar({
  count,
  allShown,
  shownCount,
  onSelectAll,
  onClear,
  onDelete,
  onCancel,
}: {
  count: number;
  allShown: boolean;
  shownCount: number;
  onSelectAll: (all: boolean) => void;
  onClear: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  // Esc stops picking (unless a confirmation dialog is open: Esc is for that).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("dialog:modal") && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 border-[3px] border-[var(--ink)] bg-[var(--red-strong)] px-3 py-2 text-sm text-white shadow-[var(--shadow-hard)]">
      <span className="font-[family-name:var(--font-display)]">{count} selected</span>
      <span className="text-xs font-bold">Click notes to select them.</span>
      <span className="ml-auto flex flex-wrap gap-2">
        <button type="button" onClick={() => onSelectAll(!allShown)} disabled={shownCount === 0} className={smallButtonClass}>
          {allShown ? "Unselect all" : `Select all (${shownCount})`}
        </button>
        {count > 0 && (
          <button type="button" onClick={onClear} className={smallButtonClass}>
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={count === 0}
          className="border-2 border-[var(--ink)] bg-[var(--ink)] px-2.5 py-1.5 font-[family-name:var(--font-display)] text-xs text-white hover:bg-[var(--yellow)] hover:text-[var(--ink)] disabled:opacity-45"
        >
          Delete selected ({count})
        </button>
        <button type="button" onClick={onCancel} className={smallButtonClass}>
          Cancel
        </button>
      </span>
    </div>
  );
}

/**
 * A card in the grid: title, folder, filled links, a preview, opportunity categories with notes, and tags.
 * Memoized: a note's summary only changes when that note does, so saving one note redraws one card.
 */
const NoteCard = memo(function NoteCard({
  note,
  folderName,
  isOpen,
  selecting,
  isSelected,
  onToggleSelected,
}: {
  note: NoteSummary;
  folderName?: string;
  isOpen: boolean;
  /** Picking notes to delete: a click selects the note instead of opening it. */
  selecting: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const activate = () => (selecting ? onToggleSelected(note.id) : openNote(note.id));
  const links = LINK_FIELDS.filter((f) => note.links[f.key]);
  const { preview, filled } = note;
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? isSelected : undefined}
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), activate())}
      className={`group flex h-full cursor-pointer flex-col gap-2.5 border-[3px] border-[var(--ink)] p-4 outline-none transition-[transform,box-shadow] duration-[120ms] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[7px_7px_0_var(--red)] ${
        isSelected
          ? "bg-red-50 shadow-[4px_4px_0_var(--red)] outline-[3px] outline-offset-0 outline-[var(--red)]"
          : isOpen
            ? "bg-[#fff6c2] shadow-[4px_4px_0_var(--ink)]"
            : "bg-[var(--panel)] shadow-[4px_4px_0_var(--ink)]"
      }`}
    >
      <div className="flex items-start gap-2">
        {selecting && (
          <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} aria-hidden className="pointer-events-none mt-1 h-4 w-4 shrink-0 accent-red-600" />
        )}
        <h3 className="line-clamp-2 flex-1 font-[family-name:var(--font-display)] text-[15px] leading-snug">{displayTitle(note)}</h3>
        <RfqaButton compact getNote={() => note} />
        <CopyMenu compact getNote={() => loadForCopy(note.id)} />
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation(); // don't open the note
            if ((await deleteNoteWithConfirm(note)) && isOpen) closeNoteWindow();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          title="Delete note"
          aria-label={`Delete ${displayTitle(note)}`}
          className="border-2 border-zinc-900 bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)] hover:text-[var(--red-deep)]"
        >
          🗑
        </button>
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((f) => {
            const value = note.links[f.key]!;
            const url = /^https?:\/\//i.test(value) ? value : /^www\./i.test(value) ? `https://${value}` : null;
            return url ? (
              <a
                key={f.key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={url}
                className="border-2 border-[var(--red-deep)] bg-[var(--panel)] px-2 py-0.5 text-xs font-bold text-[var(--red-deep)] hover:bg-[var(--yellow)]"
              >
                {f.label} ↗
              </a>
            ) : (
              <span key={f.key} title={value} className="border-2 border-zinc-900 bg-[var(--paper)] px-2 py-0.5 text-xs font-bold text-[var(--ink-soft)]">
                {f.label}
              </span>
            );
          })}
        </div>
      )}
      {preview && <p className="line-clamp-3 text-sm text-[var(--ink-soft)]">{preview}</p>}
      {filled.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filled.map((label) => (
            <span key={label} className="bg-[var(--ink)] px-2 py-0.5 text-[11px] font-black text-white">
              {label}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-zinc-500">
        {folderName && <span>📁 {folderName}</span>}
        {note.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
        <CardSyncMark noteId={note.id} />
        <span className="ml-auto">{isOpen ? "Open" : relativeTime(note.updatedAt)}</span>
      </div>
    </div>
  );
});

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
    <div ref={ref} role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden border-[3px] border-[var(--ink)] bg-background py-1 shadow-[var(--shadow-hard)]">
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
