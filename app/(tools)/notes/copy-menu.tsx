"use client";

import { useEffect, useRef, useState } from "react";
import { noteToMarkdown, noteToPlainText } from "./lib/convert";
import type { Note } from "./lib/db";

/** "Copy" dropdown with Markdown and plain-text options, for pasting a note into an AI. */
export default function CopyMenu({
  getNote,
  compact = false,
}: {
  /** Called at copy time so the editor can hand over unsaved changes too. */
  getNote: () => Pick<Note, "title" | "content"> | Promise<Pick<Note, "title" | "content"> | undefined>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(kind: "Markdown" | "plain text") {
    setOpen(false);
    const note = await getNote();
    if (!note) return setCopied("Copy failed");
    const text = kind === "Markdown" ? noteToMarkdown(note) : noteToPlainText(note);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`Copied as ${kind}`);
    } catch {
      setCopied("Copy failed");
    }
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`border-2 border-zinc-900 bg-[var(--panel)] font-bold text-[var(--ink)] ${
          compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        } ${copied ? "!bg-[var(--yellow)]" : ""}`}
      >
        {copied ?? "Copy ▾"}
      </button>
      {open && (
        <div
          role="menu"
          className="manga-menu absolute right-0 z-20 mt-1 w-48 overflow-hidden py-1"
        >
          {(["Markdown", "plain text"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => copy(kind)}
              className="block w-full px-3 py-2 text-left text-sm font-bold"
            >
              Copy as {kind}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
