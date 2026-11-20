"use client";

import { useState } from "react";
import Modal from "./modal";
import type { Folder } from "./lib/db";
import type { NoteSummary } from "./lib/note-index";
import { displayTitle, noteMatcher, relativeTime, snippet } from "./lib/search";

export default function QuickSearch({
  notes,
  folders,
  onSelect,
  onClose,
}: {
  notes: NoteSummary[];
  folders: Folder[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matcher = noteMatcher(query);
  const results = (matcher ? notes.filter(matcher) : notes).slice(0, 30);
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  const current = Math.min(active, Math.max(results.length - 1, 0));

  function choose(i: number) {
    const note = results[i];
    if (note) onSelect(note.id);
  }

  return (
    <Modal onClose={onClose} label="Quick search">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((current + 1) % Math.max(results.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((current - 1 + results.length) % Math.max(results.length, 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(current);
          }
        }}
        placeholder="Search notes by title, text, or #tag…"
        aria-label="Search notes"
        className="w-full border-b-[3px] border-[var(--ink)] bg-transparent px-4 py-3.5 text-base font-bold outline-none"
      />
      <ul className="overflow-y-auto overscroll-contain p-1.5" role="listbox">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-zinc-500">No matching notes.</li>
        )}
        {results.map((note, i) => (
          <li key={note.id} role="option" aria-selected={i === current}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex w-full flex-col gap-0.5 border-2 px-3 py-2 text-left ${
                i === current ? "border-[var(--ink)] bg-[var(--yellow)]" : "border-transparent"
              }`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="truncate font-[family-name:var(--font-display)] text-sm">{displayTitle(note)}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {folderName(note.folderId) && `${folderName(note.folderId)} · `}
                  {relativeTime(note.updatedAt)}
                </span>
              </span>
              {note.text && (
                <span className="line-clamp-1 text-xs text-zinc-500">{snippet(note, query)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-xs font-bold text-white">
        ↑↓ to move · Enter to open · Esc to close
      </p>
    </Modal>
  );
}
