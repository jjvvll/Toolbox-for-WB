"use client";

import { askConfirm, askText } from "@/components/ask-dialog";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Modal from "./modal";
import { createFolder, db, deleteFolder, reorderFolders, type Folder } from "./lib/db";

/** Asks for a new name for a folder. */
export async function renameFolderWithPrompt(folder: Folder) {
  const name = (await askText({ title: "Rename folder", defaultValue: folder.name, confirmLabel: "Rename" }))?.trim();
  if (name && name !== folder.name) await db.folders.update(folder.id, { name });
}

/** Deletes a folder after asking; its notes are kept, under "No folder". Returns whether it was deleted. */
export async function removeFolderWithConfirm(folder: Folder, noteCount: number): Promise<boolean> {
  const message = noteCount
    ? `The ${noteCount === 1 ? "note" : `${noteCount} notes`} in it won't be deleted: ${noteCount === 1 ? "it moves" : "they move"} to “No folder”.`
    : "It's empty.";
  if (!(await askConfirm({ title: `Delete the folder “${folder.name}”?`, message, confirmLabel: "Delete folder", danger: true }))) return false;
  await deleteFolder(folder.id);
  return true;
}

/** Every folder in one place: add, rename, rearrange, delete. */
export default function FoldersDialog({
  folders,
  countIn,
  onRemove,
  onClose,
}: {
  folders: Folder[];
  countIn: (folderId: string) => number;
  onRemove: (folder: Folder) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  // After the dialog opens: opening it puts the focus on the first button (Close).
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <Modal onClose={onClose} label="Folders" className="max-w-lg">
      <div className="manga-titlebar justify-between px-4 py-2.5">
        <h2>Folders</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="manga-barbutton">
          ✕
        </button>
      </div>
      <form
        className="flex gap-2 border-b-2 border-[var(--ink)] p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createFolder(name);
          setName("");
        }}
      >
        <input
          ref={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New folder name"
          aria-label="New folder name"
          className="min-w-0 flex-1 border-2 border-zinc-900 bg-background px-3 py-1.5 text-sm outline-none"
        />
        <button type="submit" disabled={!name.trim()} className="bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-45">
          Add
        </button>
      </form>
      {folders.length > 1 && <p className="px-4 pt-3 text-xs text-zinc-500">Drag ⠿ or use the arrows to change the order.</p>}
      {folders.length === 0 ? <p className="px-3 py-8 text-center text-sm text-zinc-500">No folders yet.</p> : <FolderList folders={folders} countIn={countIn} onRemove={onRemove} />}
    </Modal>
  );
}

const smallButton = "border-2 border-zinc-900 bg-[var(--panel)] px-2 py-1 text-xs font-bold disabled:opacity-30";

/** The folders, rearranged by dragging a row's handle or with its arrow buttons. */
function FolderList({ folders, countIn, onRemove }: { folders: Folder[]; countIn: (folderId: string) => number; onRemove: (folder: Folder) => void }) {
  // The order as arranged here, so a move shows at once instead of after it's saved.
  const [order, setOrder] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(messageTimer.current), []);

  const place = (f: Folder) => {
    const i = order?.indexOf(f.id) ?? -1;
    return i < 0 ? folders.length : i;
  };
  const shown = order ? [...folders].sort((x, y) => place(x) - place(y)) : folders;

  /** Read out to screen readers, a moment later so it isn't lost when the focus moves. */
  function announce(text: string) {
    clearTimeout(messageTimer.current);
    setMessage("");
    messageTimer.current = setTimeout(() => setMessage(text), 500);
  }

  /** Runs a change to the list, then slides each row from where it was to where it is now. */
  function slide(change: () => void, moved: HTMLElement) {
    const rows = [...(list.current?.children ?? [])] as HTMLElement[];
    const before = new Map(rows.map((el) => [el, el.getBoundingClientRect().top]));
    change();
    moved.scrollIntoView({ block: "nearest" });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const el of rows) {
      const dy = before.get(el)! - el.getBoundingClientRect().top;
      if (dy) el.animate({ translate: [`0 ${dy}px`, "0 0"] }, { duration: 160, easing: "ease-out" });
    }
  }

  function moveTo(id: string, to: number, row: HTMLElement) {
    const ids = shown.map((f) => f.id);
    const from = ids.indexOf(id);
    if (to === from || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    slide(() => {
      row.style.translate = "";
      flushSync(() => setOrder(ids));
    }, row);
    void reorderFolders(ids);
    announce(`${shown[from].name} moved to position ${to + 1} of ${ids.length}.`);
  }

  function step(id: string, to: number, button: HTMLButtonElement) {
    const row = button.closest("li")!;
    moveTo(id, to, row);
    // Keep the focus on the button, or on the other arrow when this one just reached the end.
    const target = button.disabled ? row.querySelector<HTMLButtonElement>("[data-arrow]:not(:disabled)") : button;
    target?.focus({ preventScroll: true });
  }

  function startDrag(e: React.PointerEvent<HTMLElement>, id: string) {
    const ul = list.current;
    const handle: HTMLElement = e.currentTarget;
    const row = handle.closest("li");
    if (e.button !== 0 || !e.isPrimary || !ul || !row) return;
    e.preventDefault(); // no text selection
    const pointer = e.pointerId;
    const startY = e.clientY;
    const startScroll = ul.scrollTop;
    const rows = [...ul.children] as HTMLElement[];
    const from = rows.indexOf(row);
    let y = startY;
    let to = from;
    let frame = 0;
    let lastFrame = e.timeStamp; // same clock as requestAnimationFrame
    const ended = new AbortController();
    const on = { signal: ended.signal };

    const update = () => {
      row.style.translate = `0 ${y - startY + ul.scrollTop - startScroll}px`;
      // From layout positions, which the dragged row's own offset doesn't change.
      const box = ul.getBoundingClientRect();
      const at = Math.min(Math.max(y, box.top), box.bottom) - box.top - ul.clientTop + ul.scrollTop;
      const next = rows.findIndex((el) => el.offsetTop + el.offsetHeight / 2 > at);
      const spot = next < 0 ? rows.length : next;
      to = spot > from ? spot - 1 : spot;
      if (to === from) return ul.removeAttribute("data-drop"); // its own place
      const last = rows[rows.length - 1];
      ul.style.setProperty("--drop-y", `${spot < rows.length ? rows[spot].offsetTop : last.offsetTop + last.offsetHeight}px`);
      ul.setAttribute("data-drop", "");
    };
    // Scrolls a long list while the pointer is near (or past) its top or bottom edge.
    const scroll = (now: number) => {
      const box = ul.getBoundingClientRect();
      const zone = Math.min(row.offsetHeight, box.height / 3);
      const past = y < box.top + zone ? y - box.top - zone : y > box.bottom - zone ? y - box.bottom + zone : 0;
      const was = ul.scrollTop;
      ul.scrollTop += Math.max(-1.5, Math.min(1.5, past / zone)) * 0.4 * (now - lastFrame);
      lastFrame = now;
      if (ul.scrollTop !== was) update();
      frame = requestAnimationFrame(scroll);
    };
    const end = () => {
      ended.abort();
      cancelAnimationFrame(frame);
      ul.removeAttribute("data-drop");
      row.removeAttribute("data-dragging");
      document.documentElement.classList.remove("folder-dragging");
    };
    const cancel = () => {
      end();
      slide(() => (row.style.translate = ""), row);
    };

    handle.setPointerCapture(pointer);
    row.setAttribute("data-dragging", "");
    document.documentElement.classList.add("folder-dragging");
    frame = requestAnimationFrame(scroll);
    handle.addEventListener("pointermove", (ev) => {
      if (ev.pointerId !== pointer) return;
      y = ev.clientY;
      update();
    }, on);
    handle.addEventListener("pointerup", (ev) => {
      if (ev.pointerId !== pointer) return;
      if (to === from) return cancel();
      end();
      moveTo(id, to, row);
    }, on);
    handle.addEventListener("pointercancel", (ev) => ev.pointerId === pointer && cancel(), on);
    handle.addEventListener("lostpointercapture", (ev) => ev.pointerId === pointer && cancel(), on);
    // Esc puts the folder back (and doesn't close the dialog).
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
      announce("Move cancelled.");
    }, { capture: true, ...on });
  }

  return (
    <>
      <ul ref={list} className="folder-list relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {shown.map((f, i) => {
          const count = countIn(f.id);
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-[var(--panel)] px-2 py-1.5 hover:bg-zinc-50">
              {shown.length > 1 && (
                // For the pointer only; the arrows do the same from the keyboard.
                <span aria-hidden title="Drag to rearrange" className="folder-handle" onPointerDown={(e) => startDrag(e, f.id)}>
                  ⠿
                </span>
              )}
              <span className="min-w-0 flex-1 basis-28 truncate text-sm font-bold">{f.name}</span>
              <span className="text-xs text-zinc-500">
                {count} note{count === 1 ? "" : "s"}
              </span>
              <span className="flex gap-1.5">
                {shown.length > 1 && (
                  <>
                    <button type="button" data-arrow disabled={i === 0} onClick={(e) => step(f.id, i - 1, e.currentTarget)} aria-label={`Move ${f.name} up`} title="Move up" className={smallButton}>
                      ↑
                    </button>
                    <button type="button" data-arrow disabled={i === shown.length - 1} onClick={(e) => step(f.id, i + 1, e.currentTarget)} aria-label={`Move ${f.name} down`} title="Move down" className={smallButton}>
                      ↓
                    </button>
                  </>
                )}
                <button type="button" onClick={() => renameFolderWithPrompt(f)} aria-label={`Rename ${f.name}`} className={smallButton}>
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(f)}
                  aria-label={`Delete ${f.name}`}
                  className="border-2 border-[var(--red-deep)] bg-[var(--panel)] px-2 py-1 text-xs font-bold text-[var(--red-deep)] hover:bg-[var(--yellow)]"
                >
                  Delete
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </>
  );
}
