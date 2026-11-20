"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import CompliancePage from "./compliance-page";
import { EditorRegistry, EditorRegistryContext } from "./editor-registry";
import HighlightChecklist from "./highlight-checklist";
import NoteForm from "./note-form";
import { NoteSyncBadge } from "./sync-status";
import { db, deleteNoteWithConfirm, type Note } from "./lib/db";
import { useNoteSummary } from "./lib/note-index";
import { closeNoteWindow, setMinimized, setWide, useNoteWindow } from "./lib/note-window";
import { displayTitle } from "./lib/search";

/**
 * Keeps the mouse wheel inside the floating note window: scrolling past the end of a field,
 * or over the title bar, would otherwise scroll the page behind it (the window isn't a modal
 * dialog, so the page stays scrollable when the pointer is elsewhere). Lets the event through
 * while something inside can still scroll that way.
 */
function keepWheelInside(boundary: HTMLElement) {
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.deltaY === 0) return; // zooming, or sideways scrolling
    for (let el = e.target instanceof Element ? e.target : null; el && el !== boundary; el = el.parentElement) {
      if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) continue;
      if (!/auto|scroll/.test(getComputedStyle(el).overflowY)) continue;
      const atEdge = e.deltaY < 0 ? el.scrollTop <= 0 : el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (!atEdge) return; // this one scrolls
    }
    e.preventDefault();
  };
  // Not passive, so preventDefault can stop the page from scrolling.
  boundary.addEventListener("wheel", onWheel, { passive: false });
  return () => boundary.removeEventListener("wheel", onWheel);
}

/** Whether a media query matches, kept up to date. */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The open note, read from the database once when it opens. Its editors keep their own text
 * from then on, so saving doesn't read the note back (that reload made typing in long notes
 * choppy). Changes to the folder, tags and title show through the note index instead.
 */
function useNoteOnce(id: string | null) {
  const [loaded, setLoaded] = useState<{ id: string; note: Note | undefined } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    db.notes.get(id).then(
      (note) => live && setLoaded({ id, note }),
      () => live && setLoaded({ id, note: undefined }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  // Only the answer about the note that's open now (not one still arriving for the previous note).
  return loaded && loaded.id === id ? loaded : null;
}

const headerButton = "manga-barbutton text-sm";

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
  const loaded = useNoteOnce(win.id);
  const note = loaded?.note;
  // Title, folder, tags and date as they are now; changes only when this note does.
  const summary = useNoteSummary(win.id);
  const folders = useLiveQuery(() => db.folders.orderBy("name").toArray(), []);
  // One checklist: beside the window on wide screens, at the top of it otherwise.
  const wideScreen = useMediaQuery("(min-width: 1024px)");
  // The open note's text editors, for the highlights checklist. A new list for each note.
  const registry = useMemo(() => new EditorRegistry(), [win.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Page 2 (compliance guidelines) has its own list, so the checklist shows the open page's highlights.
  const complianceRegistry = useMemo(() => new EditorRegistry(), [win.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The note whose compliance page is open; any other note opens on page 1.
  const [complianceFor, setComplianceFor] = useState<string | null>(null);
  const onCompliance = !!win.id && complianceFor === win.id;
  const activeRegistry = onCompliance ? complianceRegistry : registry;
  // The page behind doesn't scroll while the wheel is over the window (see keepWheelInside).
  const wheelGuard = useCallback((el: HTMLDivElement | null) => (el ? keepWheelInside(el) : undefined), []);

  // A note deleted elsewhere (or a stale id after a reload) closes the window: either the
  // database doesn't have it when it opens, or it leaves the index after being in it. (A note
  // created a moment ago can reach the index a few milliseconds after it opens, so not being
  // in the index yet doesn't count.)
  const seenInIndex = useRef<string | null>(null);
  useEffect(() => {
    if (!win.id) return;
    if (summary) seenInIndex.current = win.id;
    else if (summary === null && seenInIndex.current === win.id) closeNoteWindow();
    if (loaded && !loaded.note) closeNoteWindow();
  }, [win.id, summary, loaded]);

  const remove = useCallback(async () => {
    if (note && (await deleteNoteWithConfirm(note))) closeNoteWindow();
  }, [note]);

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

  // Rendered into <body> so `fixed` is relative to the screen, not a frosted panel.
  return createPortal(
    win.minimized ? (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 flex max-w-72 items-center gap-2 border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 py-2.5 font-[family-name:var(--font-display)] text-sm text-[var(--ink)] shadow-[4px_4px_0_var(--ink)] transition-[transform,box-shadow] duration-[120ms] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--red)]"
        title="Open the note"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4 shrink-0" aria-hidden><path d="M13.4 2H4v20h16v-9.4" /><path d="M21.4 5.6a2 2 0 0 0-2.8-2.8L13 8.4V11h2.6Z" /></svg>
        <span className="truncate">{displayTitle(summary ?? note)}</span>
      </button>
    ) : (
      // Centered on the screen, with the highlights checklist beside it on wide screens. The
      // layer around them lets clicks through, so the page and the tool tabs stay usable.
      <EditorRegistryContext.Provider value={activeRegistry}>
        <div ref={wheelGuard} className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center gap-3 p-4">
          <section
            aria-label={`Note: ${displayTitle(summary ?? note)}`}
            className={`manga-window manga-dark pointer-events-auto flex h-[min(94vh,64rem)] min-w-0 flex-1 flex-col overflow-hidden text-foreground ${
              win.wide ? "max-w-[76rem]" : "max-w-[54rem]"
            }`}
          >
            <header className="manga-titlebar shrink-0 gap-1 px-3 py-1.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4 shrink-0" aria-hidden><path d="M13.4 2H4v20h16v-9.4" /><path d="M21.4 5.6a2 2 0 0 0-2.8-2.8L13 8.4V11h2.6Z" /></svg>
              <span className="manga-title min-w-0 truncate text-sm">{displayTitle(summary ?? note)}</span>
              <span className="pl-2">
                <NoteSyncBadge noteId={note.id} />
              </span>
              {/* Page 1: the note. Page 2: compliance guidelines to highlight and check off. */}
              <div role="tablist" aria-label="Note pages" className="manga-tabs mx-auto shrink-0 border-white text-xs">
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
                    className="transition-colors duration-[120ms]"
                  >
                    {label}
                  </button>
                ))}
              </div>
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
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {/* No room beside the window on smaller screens: the checklist goes at the top. */}
              {!wideScreen && <HighlightChecklist className="mb-4 max-h-56" />}
              {/* Keyed by note, so switching notes loads the new note's fields. */}
              {/* Both pages stay mounted, so switching keeps each page's undo history and unsaved typing. */}
              <div className={onCompliance ? "hidden" : undefined}>
                <EditorRegistryContext.Provider value={registry}>
                  <NoteForm key={note.id} note={note} folders={folders} onDelete={remove} />
                </EditorRegistryContext.Provider>
              </div>
              <div className={onCompliance ? "h-full" : "hidden"}>
                <EditorRegistryContext.Provider value={complianceRegistry}>
                  <CompliancePage key={note.id} note={note} />
                </EditorRegistryContext.Provider>
              </div>
            </div>
          </section>
          {wideScreen && <HighlightChecklist className="pointer-events-auto max-h-[min(94vh,64rem)] w-80 shrink-0" />}
        </div>
      </EditorRegistryContext.Provider>
    ),
    document.body,
  );
}
