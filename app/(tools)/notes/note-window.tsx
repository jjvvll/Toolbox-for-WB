"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CompliancePage from "./compliance-page";
import { EditorRegistry, EditorRegistryContext } from "./editor-registry";
import HighlightChecklist from "./highlight-checklist";
import NoteForm from "./note-form";
import { NoteSyncBadge } from "./sync-status";
import { db, deleteNoteWithConfirm } from "./lib/db";
import { closeNoteWindow, setMinimized, setWide, useNoteWindow } from "./lib/note-window";
import { displayTitle } from "./lib/search";

const headerButton = "flex h-7 w-7 items-center justify-center rounded-md text-sm text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800";

/**
 * The floating note window. It belongs to the page it was opened on: switching to another
 * tool hides it, and going back shows it again, open or minimized as it was. It doesn't
 * block the page behind it.
 */
export default function NoteWindow() {
  const win = useNoteWindow();
  // Only on the page the note was opened on (older saved state without a page shows anywhere).
  const pathname = usePathname();
  const here = !win.path || win.path === pathname;
  const note = useLiveQuery(() => (win.id ? db.notes.get(win.id) : undefined), [win.id]);
  const folders = useLiveQuery(() => db.folders.orderBy("name").toArray(), []);
  const allNotes = useLiveQuery(() => db.notes.toArray(), []);
  const allTags = useMemo(() => [...new Set((allNotes ?? []).flatMap((n) => n.tags))].sort(), [allNotes]);
  // The open note's text editors, for the highlights checklist. A new list for each note.
  const registry = useMemo(() => new EditorRegistry(), [win.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Page 2 (compliance guidelines) has its own list, so the checklist shows the open page's highlights.
  const complianceRegistry = useMemo(() => new EditorRegistry(), [win.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The note whose compliance page is open; any other note opens on page 1.
  const [complianceFor, setComplianceFor] = useState<string | null>(null);
  const onCompliance = !!win.id && complianceFor === win.id;
  const activeRegistry = onCompliance ? complianceRegistry : registry;

  // A note deleted elsewhere (or a stale id after a reload) closes the window.
  useEffect(() => {
    if (win.id && note === undefined && allNotes && !allNotes.some((n) => n.id === win.id)) closeNoteWindow();
  }, [win.id, note, allNotes]);

  // Escape minimizes the window (without losing anything).
  useEffect(() => {
    if (!win.id || win.minimized || !here) return;
    const onKey = (e: KeyboardEvent) => {
      // While a modal <dialog> is open, Esc is for closing it, not for the window behind it.
      if (e.key === "Escape" && !document.querySelector("dialog:modal")) setMinimized(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [win.id, win.minimized, here]);

  if (!win.id || !here || !note || !folders || typeof document === "undefined") return null;

  async function remove() {
    if (note && (await deleteNoteWithConfirm(note))) closeNoteWindow();
  }

  // Rendered into <body> so `fixed` is relative to the screen, not a frosted panel.
  return createPortal(
    win.minimized ? (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 flex max-w-72 items-center gap-2 rounded-full border border-zinc-200 bg-background/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-xl backdrop-blur hover:shadow-2xl dark:border-zinc-800"
        title="Open the note"
      >
        <span aria-hidden>📝</span>
        <span className="truncate">{displayTitle(note)}</span>
      </button>
    ) : (
      // Centered on the screen, with the highlights checklist beside it on wide screens. The
      // layer around them lets clicks through, so the page and the tool tabs stay usable.
      <EditorRegistryContext.Provider value={activeRegistry}>
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center gap-3 p-4">
          <section
            aria-label={`Note: ${displayTitle(note)}`}
            className={`pointer-events-auto flex h-[min(94vh,64rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-background text-foreground shadow-[0_24px_80px_-12px_rgb(0_0_0/0.45)] dark:border-zinc-800 ${
              win.wide ? "max-w-[76rem]" : "max-w-[54rem]"
            }`}
          >
            <header className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span aria-hidden>📝</span>
              <span className="min-w-0 truncate text-sm font-medium">{displayTitle(note)}</span>
              <span className="pl-2">
                <NoteSyncBadge noteId={note.id} />
              </span>
              {/* Page 1: the note. Page 2: compliance guidelines to highlight and check off. */}
              <div role="tablist" aria-label="Note pages" className="mx-auto flex shrink-0 rounded-lg border border-zinc-200 bg-background p-0.5 text-xs font-medium dark:border-zinc-700">
                {([
                  [false, "Note"],
                  [true, "Compliance"],
                ] as const).map(([compliance, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={onCompliance === compliance}
                    onClick={() => setComplianceFor(compliance ? note.id : null)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      onCompliance === compliance ? "bg-zinc-200 text-foreground dark:bg-zinc-700" : "text-zinc-500 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Link href="/notes" className={headerButton} title="All notes">
                ▦
              </Link>
              <button type="button" onClick={() => setWide(!win.wide)} className={headerButton} title={win.wide ? "Narrower" : "Wider"}>
                {win.wide ? "⇥" : "⇤"}
              </button>
              <button type="button" onClick={() => setMinimized(true)} className={headerButton} title="Minimize (Esc)">
                –
              </button>
              <button type="button" onClick={() => closeNoteWindow()} className={headerButton} title="Close">
                ✕
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {/* No room beside the window on smaller screens: the checklist goes at the top. */}
              <HighlightChecklist className="mb-4 max-h-56 lg:hidden" />
              {/* Keyed by note, so switching notes loads the new note's fields. */}
              {/* Both pages stay mounted, so switching keeps each page's undo history and unsaved typing. */}
              <div className={onCompliance ? "hidden" : undefined}>
                <EditorRegistryContext.Provider value={registry}>
                  <NoteForm key={note.id} note={note} folders={folders} allTags={allTags} onDelete={remove} />
                </EditorRegistryContext.Provider>
              </div>
              <div className={onCompliance ? "h-full" : "hidden"}>
                <EditorRegistryContext.Provider value={complianceRegistry}>
                  <CompliancePage key={note.id} note={note} />
                </EditorRegistryContext.Provider>
              </div>
            </div>
          </section>
          <HighlightChecklist className="pointer-events-auto hidden max-h-[min(94vh,64rem)] w-80 shrink-0 shadow-[0_24px_80px_-12px_rgb(0_0_0/0.45)] lg:flex" />
        </div>
      </EditorRegistryContext.Provider>
    ),
    document.body,
  );
}
