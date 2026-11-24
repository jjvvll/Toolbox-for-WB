"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import CompliancePage from "./compliance-page";
import { EditorRegistry, EditorRegistryContext } from "./editor-registry";
import HighlightChecklist from "./highlight-checklist";
import { FormatBar, LinkStrip, useActiveEditor } from "./format-bar";
import NoteForm, { type SaveNote } from "./note-form";
import { NoteSyncBadge } from "./sync-status";
import { db, deleteNoteWithConfirm, isOwnWrite, listFolders, onRecordsChanged, readNote, type Note } from "./lib/db";
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

/** The parts of a note its two pages keep while it's open. (The folder and tags update themselves.) */
const FORM_FIELDS = ["title", "content", "links", "opportunity", "opportunities", "sections", "sectionLinks", "design", "compliance"] as const;
const sameText = (a: Note, b: Note) => FORM_FIELDS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/**
 * The open note, read from the database each time it opens. Its editors keep their own text
 * from then on, so saving doesn't read the note back (that reload made typing in long notes
 * choppy). It's read again only when its text was changed somewhere else: another tab, another
 * browser (through the database) or an imported backup. Showing the older text then would look
 * like entries went missing, and the next edit here would save over the newer ones.
 */
function useOpenNote(id: string) {
  // Goes up with every read, so the pages are drawn again from the new text.
  const [read, setRead] = useState(0);
  const [loaded, setLoaded] = useState<{ read: number; note: Note | undefined } | null>(null);
  useEffect(() => {
    let live = true;
    readNote(id).then(
      (note) => live && setLoaded({ read, note }),
      () => live && setLoaded({ read, note: undefined }),
    );
    return () => {
      live = false;
    };
  }, [id, read]);

  const current = loaded?.read === read ? loaded : null;
  const note = current?.note;
  useEffect(() => {
    if (!note) return;
    let known = note;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A hidden tab waits until it's looked at (the other tab may be mid-typing).
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") setRead((n) => n + 1);
        else document.addEventListener("visibilitychange", reload, { once: true });
      }, 400);
    };
    const stop = onRecordsChanged(async (c) => {
      if (c.table !== "notes" || !c.puts.has(id)) return;
      const value = (c.puts.get(id) ?? (await db.notes.get(id))) as Note | undefined;
      if (!live || !value) return;
      if (!isOwnWrite(id, value.updatedAt) && !sameText(known, value)) reload();
      known = value;
    });
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", reload);
      stop();
    };
  }, [id, note]);
  return current;
}

const headerButton = "manga-barbutton text-sm";
const noteIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4 shrink-0" aria-hidden>
    <path d="M13.4 2H4v20h16v-9.4" />
    <path d="M21.4 5.6a2 2 0 0 0-2.8-2.8L13 8.4V11h2.6Z" />
  </svg>
);

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
  // Title, folder, tags and date as they are now; changes only when this note does.
  const summary = useNoteSummary(win.id);

  // A note deleted elsewhere closes the window when it leaves the index after being in it. (A
  // note created a moment ago can reach the index a few milliseconds after it opens, so not
  // being in the index yet doesn't count. OpenNote handles one the database doesn't have.)
  const seenInIndex = useRef<string | null>(null);
  useEffect(() => {
    if (!win.id) return;
    if (summary) seenInIndex.current = win.id;
    else if (summary === null && seenInIndex.current === win.id) closeNoteWindow();
  }, [win.id, summary]);

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

  if (!win.id || !here || typeof document === "undefined") return null;

  // Rendered into <body> so `fixed` is relative to the screen, not a frosted panel.
  return createPortal(
    !win.minimized ? (
      // Keyed by note, so each note opens with its own fields, undo history and page.
      <OpenNote key={win.id} id={win.id} wide={win.wide} />
    ) : summary ? (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 flex max-w-72 items-center gap-2 border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-4 py-2.5 font-[family-name:var(--font-display)] text-sm text-[var(--ink)] shadow-[4px_4px_0_var(--ink)] transition-[transform,box-shadow] duration-[120ms] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_var(--red)]"
        title="Open the note"
      >
        {noteIcon}
        <span className="truncate">{displayTitle(summary)}</span>
      </button>
    ) : null,
    document.body,
  );
}

/** The window itself, centered on the screen. Mounted only while it's showing. */
function OpenNote({ id, wide }: { id: string; wide: boolean }) {
  const loaded = useOpenNote(id);
  const note = loaded?.note;
  const folders = useLiveQuery(listFolders, []);
  // One checklist: beside the window on wide screens, at the top of it otherwise.
  const wideScreen = useMediaQuery("(min-width: 1024px)");
  // The note's text editors, for the highlights checklist and the format bar. Page 2 (compliance
  // guidelines) has its own list, so both work on the page that's open.
  const [registry] = useState(() => new EditorRegistry());
  const [complianceRegistry] = useState(() => new EditorRegistry());
  const [onCompliance, setOnCompliance] = useState(false);
  const activeRegistry = onCompliance ? complianceRegistry : registry;
  const active = useActiveEditor(activeRegistry);
  // The page behind doesn't scroll while the wheel is over the window (see keepWheelInside).
  const wheelGuard = useCallback((el: HTMLDivElement | null) => (el ? keepWheelInside(el) : undefined), []);
  const saveRef = useRef<SaveNote | null>(null);

  // A stale id after a reload, or a note deleted elsewhere.
  useEffect(() => {
    if (loaded && !loaded.note) closeNoteWindow();
  }, [loaded]);

  const remove = useCallback(async () => {
    const now = await readNote(id);
    if (now && (await deleteNoteWithConfirm(now))) closeNoteWindow();
  }, [id]);

  // The layer around the window lets clicks through, so the page and the tool tabs stay usable.
  return (
    <EditorRegistryContext.Provider value={activeRegistry}>
      <div ref={wheelGuard} className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center gap-3 p-4">
        <section
          aria-label={`Note: ${displayTitle(note ?? { title: "" })}`}
          className={`manga-window manga-dark pointer-events-auto flex h-[min(94vh,64rem)] min-w-0 flex-1 flex-col overflow-hidden text-foreground ${
            wide ? "max-w-[76rem]" : "max-w-[54rem]"
          }`}
        >
          <header className="manga-titlebar shrink-0 flex-wrap gap-2 px-3 py-1.5 sm:flex-nowrap">
            {noteIcon}
            {note ? <TitleInput key={loaded.read} note={note} saveRef={saveRef} /> : <span className="flex-1" />}
            {/* Its own line on phones, so the title keeps its room. */}
            <span className="max-sm:order-last max-sm:basis-full">
              <NoteSyncBadge noteId={id} />
            </span>
            <span className="ml-1 flex shrink-0">
              <button type="button" onClick={() => setWide(!wide)} className={headerButton} title={wide ? "Narrower" : "Wider"}>
                {wide ? "⇥" : "⇤"}
              </button>
              <button type="button" onClick={() => setMinimized(true)} className={headerButton} title="Minimize (Esc)">
                –
              </button>
              <button type="button" onClick={() => closeNoteWindow()} className={headerButton} title="Close">
                ✕
              </button>
            </span>
          </header>
          {/* One format bar for every field, next to the page tabs. */}
          <div className="flex shrink-0 flex-wrap-reverse items-center gap-x-2 border-b border-[var(--color-zinc-200)]">
            <div className="min-w-0 flex-1">
              <FormatBar key={active?.id ?? "none"} editor={active?.editor ?? null} hint="Click a field to format it" />
            </div>
            {/* Page 1: the note. Page 2: compliance guidelines to highlight and check off. */}
            <div role="tablist" aria-label="Note pages" className="manga-tabs m-1.5 shrink-0 text-xs">
              {([
                [false, "Note"],
                [true, "Compliance"],
              ] as const).map(([compliance, label]) => (
                <button key={label} type="button" role="tab" aria-selected={onCompliance === compliance} onClick={() => setOnCompliance(compliance)} className="transition-colors duration-[120ms]">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {/* No room beside the window on smaller screens: the checklist goes at the top. */}
            {!wideScreen && <HighlightChecklist className="mb-4 max-h-56" />}
            {note && folders && (
              // Keyed by read: a note read again starts its fields over. Both pages stay mounted,
              // so switching keeps each page's undo history and unsaved typing.
              <Fragment key={loaded.read}>
                <div className={onCompliance ? "hidden" : undefined}>
                  <EditorRegistryContext.Provider value={registry}>
                    <NoteForm note={note} folders={folders} onDelete={remove} saveRef={saveRef} />
                  </EditorRegistryContext.Provider>
                </div>
                <div className={onCompliance ? undefined : "hidden"}>
                  <EditorRegistryContext.Provider value={complianceRegistry}>
                    <CompliancePage note={note} />
                  </EditorRegistryContext.Provider>
                </div>
              </Fragment>
            )}
          </div>
          {active && <LinkStrip key={active.id} editor={active.editor} className="shrink-0 border-t border-[var(--color-zinc-200)]" />}
        </section>
        {wideScreen && <HighlightChecklist className="pointer-events-auto max-h-[min(94vh,64rem)] w-80 shrink-0" />}
      </div>
    </EditorRegistryContext.Provider>
  );
}

/** The note's title, in the title bar. Saved together with the form's fields. */
function TitleInput({ note, saveRef }: { note: Note; saveRef: RefObject<SaveNote | null> }) {
  const [title, setTitle] = useState(note.title);
  return (
    <input
      type="text"
      value={title}
      onChange={(e) => {
        setTitle(e.target.value);
        saveRef.current?.({ title: e.target.value });
      }}
      autoFocus={!note.title && !note.text}
      placeholder="Title (client or ticket name)"
      aria-label="Note title"
      className="note-title manga-title"
    />
  );
}
