"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CopyMenu from "./copy-menu";
import QuickSearch from "./quick-search";
import RichEditor from "./rich-editor";
import TagInput from "./tag-input";
import TemplatesDialog from "./templates-dialog";
import { exportBackup, importBackup, parseBackup } from "./lib/backup";
import { htmlToPlainText } from "./lib/convert";
import { createNote, db, deleteFolder, newId, updateNote, type Folder, type Note } from "./lib/db";
import { displayTitle, noteMatcher, relativeTime, snippet } from "./lib/search";
import { useAutosave } from "./lib/use-autosave";

type Filter =
  | { kind: "all" }
  | { kind: "unfiled" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; tag: string };

const LAST_NOTE_KEY = "notes:lastNoteId";

function readLastNote(): string | null {
  try {
    return localStorage.getItem(LAST_NOTE_KEY);
  } catch {
    return null;
  }
}

function rememberLastNote(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_NOTE_KEY, id);
    else localStorage.removeItem(LAST_NOTE_KEY);
  } catch {
    // Storage unavailable (private mode); not important.
  }
}

const sidebarItemClass = (active: boolean) =>
  `flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
    active ? "bg-zinc-200/70 font-medium dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
  }`;

const smallButtonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default function NotesApp() {
  const notes = useLiveQuery(() => db.notes.orderBy("updatedAt").reverse().toArray(), []);
  const folders = useLiveQuery(() => db.folders.orderBy("name").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);

  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedIdState] = useState<string | null>(readLastNote);
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const selectNote = useCallback((id: string | null) => {
    setSelectedIdState(id);
    rememberLastNote(id);
    if (id) setMobileView("editor");
  }, []);

  // Ask the browser not to evict this data under storage pressure.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  // Ctrl/Cmd+K opens quick search from anywhere, including inside the editor.
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

  const selected = notes?.find((n) => n.id === selectedId) ?? null;
  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);

  // Folder/tag defaults for a note created while a filter is active.
  const newNoteDefaults = (): Partial<Note> => ({
    folderId: filter.kind === "folder" ? filter.id : null,
    tags: filter.kind === "tag" ? [filter.tag] : [],
  });

  async function addNote() {
    selectNote(await createNote(newNoteDefaults()));
  }

  async function addNoteFromTemplate(templateId: string) {
    const t = await db.templates.get(templateId);
    if (!t) return;
    setTemplatesOpen(false);
    setTemplateMenuOpen(false);
    selectNote(
      await createNote({ ...newNoteDefaults(), content: t.content, text: htmlToPlainText(t.content) }),
    );
  }

  async function removeNote(note: Note) {
    if (!window.confirm(`Delete “${displayTitle(note)}”? This can't be undone.`)) return;
    const index = visibleNotes.findIndex((n) => n.id === note.id);
    await db.notes.delete(note.id);
    const next = visibleNotes[index + 1] ?? visibleNotes[index - 1] ?? null;
    selectNote(next?.id ?? null);
    if (!next) setMobileView("list");
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

  const pickFilter = (f: Filter) => {
    setFilter(f);
    setSidebarOpen(false);
    setMobileView("list");
  };
  const isFilter = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);
  const filterLabel =
    filter.kind === "all"
      ? "All notes"
      : filter.kind === "unfiled"
        ? "No folder"
        : filter.kind === "tag"
          ? `#${filter.tag}`
          : (folders?.find((f) => f.id === filter.id)?.name ?? "Folder");

  if (!notes || !folders || !templates) {
    return <p className="mt-8 text-sm text-zinc-500">Loading notes…</p>;
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-3" aria-label="Notes navigation">
      <div className="flex flex-col gap-0.5">
        <button type="button" className={sidebarItemClass(isFilter({ kind: "all" }))} onClick={() => pickFilter({ kind: "all" })}>
          All notes <span className="text-xs text-zinc-500">{notes.length}</span>
        </button>
        <button type="button" className={sidebarItemClass(isFilter({ kind: "unfiled" }))} onClick={() => pickFilter({ kind: "unfiled" })}>
          No folder <span className="text-xs text-zinc-500">{notes.filter((n) => !n.folderId).length}</span>
        </button>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between px-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Folders</h3>
          <button type="button" onClick={addFolder} aria-label="New folder" title="New folder" className="rounded px-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-foreground dark:hover:bg-zinc-800">
            +
          </button>
        </div>
        {folders.length === 0 && <p className="px-2.5 text-xs text-zinc-500">No folders yet.</p>}
        <ul className="flex flex-col gap-0.5">
          {folders.map((f) => (
            <li key={f.id} className="group flex items-center">
              <button type="button" className={sidebarItemClass(isFilter({ kind: "folder", id: f.id }))} onClick={() => pickFilter({ kind: "folder", id: f.id })}>
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-zinc-500">{notes.filter((n) => n.folderId === f.id).length}</span>
              </button>
              <span className="flex shrink-0 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                <button type="button" onClick={() => renameFolder(f)} aria-label={`Rename ${f.name}`} title="Rename" className="rounded px-1.5 py-1 text-xs text-zinc-500 hover:text-foreground">
                  ✎
                </button>
                <button type="button" onClick={() => removeFolder(f)} aria-label={`Delete ${f.name}`} title="Delete" className="rounded px-1.5 py-1 text-xs text-zinc-500 hover:text-red-600">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Tags</h3>
        {tagCounts.length === 0 && <p className="px-2.5 text-xs text-zinc-500">Add tags in a note to see them here.</p>}
        <ul className="flex flex-col gap-0.5">
          {tagCounts.map(([tag, count]) => (
            <li key={tag}>
              <button type="button" className={sidebarItemClass(isFilter({ kind: "tag", tag }))} onClick={() => pickFilter({ kind: "tag", tag })}>
                <span className="truncate">#{tag}</span>
                <span className="text-xs text-zinc-500">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-auto flex flex-col gap-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button type="button" onClick={() => { setTemplatesOpen(true); setSidebarOpen(false); }} className={sidebarItemClass(false)}>
          Manage templates <span className="text-xs text-zinc-500">{templates.length}</span>
        </button>
        <div className="flex gap-1.5 px-1">
          <button type="button" onClick={() => exportBackup()} className={`${smallButtonClass} flex-1`}>
            Export JSON
          </button>
          <button type="button" onClick={() => importInput.current?.click()} className={`${smallButtonClass} flex-1`}>
            Import JSON
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
        <p className="px-2.5 text-[11px] leading-snug text-zinc-500">
          Notes are stored only in this browser. Export regularly to keep a backup.
        </p>
      </section>
    </nav>
  );

  return (
    <div className="mt-6">
      {status && (
        <p
          role="status"
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            status.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          {status.text}
        </p>
      )}

      <div className="grid overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 lg:h-[calc(100vh-12rem)] lg:min-h-[32rem] lg:grid-cols-[13rem_18rem_1fr]">
        {/* Sidebar: a column on desktop, a slide-over drawer on smaller screens. */}
        <aside className="hidden border-r border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/30 lg:block">
          {sidebar}
        </aside>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-background shadow-xl">{sidebar}</aside>
          </div>
        )}

        {/* Notes list */}
        <section className={`flex min-h-0 flex-col border-zinc-200 dark:border-zinc-800 lg:flex lg:border-r ${mobileView === "list" ? "flex" : "hidden"}`}>
          <div className="flex flex-col gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSidebarOpen(true)} className={`${smallButtonClass} lg:hidden`} aria-label="Open folders and tags">
                ☰
              </button>
              <h2 className="mr-auto truncate text-sm font-semibold">{filterLabel}</h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTemplateMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={templateMenuOpen}
                  className={smallButtonClass}
                  title="New note from template"
                >
                  From template ▾
                </button>
                {templateMenuOpen && (
                  <TemplateMenu
                    templates={templates}
                    onPick={addNoteFromTemplate}
                    onManage={() => { setTemplateMenuOpen(false); setTemplatesOpen(true); }}
                    onClose={() => setTemplateMenuOpen(false)}
                  />
                )}
              </div>
              <button type="button" onClick={addNote} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700">
                + New
              </button>
            </div>
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="w-full rounded-lg border border-zinc-300 bg-background py-1.5 pl-3 pr-14 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
              />
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                title="Quick search (Ctrl+K)"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-zinc-300 px-1.5 text-[10px] text-zinc-500 dark:border-zinc-700"
              >
                Ctrl K
              </button>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visibleNotes.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-zinc-500">
                {notes.length === 0 ? "No notes yet. Create your first one." : "No notes match."}
              </li>
            )}
            {visibleNotes.map((n) => (
              <li key={n.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => selectNote(n.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), selectNote(n.id))}
                  className={`flex cursor-pointer flex-col gap-1 px-3 py-2.5 outline-none focus-visible:bg-zinc-100 dark:focus-visible:bg-zinc-900 ${
                    n.id === selectedId ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium">{displayTitle(n)}</p>
                    <CopyMenu compact getNote={() => n} />
                  </div>
                  {n.text && <p className="line-clamp-2 text-xs text-zinc-500">{snippet(n, search)}</p>}
                  <p className="flex flex-wrap gap-x-2 text-[11px] text-zinc-400">
                    <span>{relativeTime(n.updatedAt)}</span>
                    {n.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Editor */}
        <section className={`min-h-0 flex-col lg:flex ${mobileView === "editor" ? "flex" : "hidden"}`}>
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              folders={folders}
              allTags={allTags}
              onBack={() => setMobileView("list")}
              onDelete={() => removeNote(selected)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-sm text-zinc-500">Select a note, or create a new one.</p>
              <button type="button" onClick={addNote} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                New note
              </button>
              <p className="text-xs text-zinc-400">Tip: press Ctrl+K to search.</p>
            </div>
          )}
        </section>
      </div>

      {quickOpen && (
        <QuickSearch
          notes={notes}
          folders={folders}
          onClose={() => setQuickOpen(false)}
          onSelect={(id) => {
            setQuickOpen(false);
            selectNote(id);
          }}
        />
      )}
      {templatesOpen && (
        <TemplatesDialog onClose={() => setTemplatesOpen(false)} onUse={addNoteFromTemplate} />
      )}
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
      <button type="button" role="menuitem" onClick={onManage} className="block w-full border-t border-zinc-200 px-3 py-2 text-left text-sm text-blue-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-blue-400 dark:hover:bg-zinc-900">
        Manage templates…
      </button>
    </div>
  );
}

function NoteEditor({
  note,
  folders,
  allTags,
  onBack,
  onDelete,
}: {
  note: Note;
  folders: Folder[];
  allTags: string[];
  onBack: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  // Latest values, including edits not yet saved, for the copy menu.
  const latest = useRef({ title: note.title, content: note.content });
  const { queue } = useAutosave<Note>((patch) => updateNote(note.id, patch));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className={`${smallButtonClass} lg:hidden`}>
            ← Notes
          </button>
          <select
            value={note.folderId ?? ""}
            onChange={(e) => updateNote(note.id, { folderId: e.target.value || null })}
            aria-label="Folder"
            className="min-w-0 max-w-40 rounded-md border border-zinc-300 bg-background px-2 py-1 text-xs dark:border-zinc-700"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span className="mr-auto hidden text-xs text-zinc-400 sm:inline">Edited {relativeTime(note.updatedAt)}</span>
          <CopyMenu getNote={() => latest.current} />
          <button type="button" onClick={onDelete} className={`${smallButtonClass} text-red-600`} aria-label="Delete note" title="Delete note">
            Delete
          </button>
        </div>
        <TagInput tags={note.tags} suggestions={allTags} onChange={(tags) => updateNote(note.id, { tags })} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            latest.current.title = e.target.value;
            queue({ title: e.target.value });
          }}
          autoFocus={!note.title && !note.content}
          placeholder="Title"
          aria-label="Note title"
          className="mb-3 w-full bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
        />
        <RichEditor
          content={note.content}
          onChange={({ html, text }) => {
            latest.current.content = html;
            queue({ content: html, text });
          }}
        />
        <p className="mt-2 text-[11px] text-zinc-400">
          Select text and paste a URL to make it a link. Changes save automatically.
        </p>
      </div>
    </div>
  );
}
