"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./modal";
import type { Note } from "./lib/db";
import { rfqaHtml, rfqaParts, rfqaText, type RfqaParts } from "./lib/rfqa";

/** "RFQA" button: builds the hand-off message for a note, shows it to check or edit, and copies it. */
export default function RfqaButton({
  getNote,
  compact = false,
}: {
  /** Called when opened so the editor can hand over unsaved links too. */
  getNote: () => Pick<Note, "links">;
  compact?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [parts, setParts] = useState<RfqaParts | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState("");

  const run = useRef(0);
  const open = async () => {
    const id = ++run.current;
    setShown(true);
    setParts(null);
    setCopied("");
    // Reads the Front End page for its side menu, so this can take a few seconds.
    const p = await rfqaParts(getNote());
    if (id !== run.current) return;
    setParts(p);
    setText(rfqaText(p));
  };
  const close = () => {
    run.current++;
    setShown(false);
    setParts(null);
  };

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(""), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(rich: boolean) {
    if (!parts) return;
    try {
      if (rich && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([rfqaHtml(parts)], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(rich ? "Copied with links" : "Copied as plain text");
    } catch {
      setCopied("Copy failed");
    }
  }

  const edited = parts !== null && text !== rfqaText(parts);
  const warnings = parts
    ? [
        !parts.frontEnd && "No Front End link in this note.",
        !parts.clientFolder && "No Client Folder link in this note.",
        !parts.colors.length && "No colors: nothing is saved in the Color Palette tool yet.",
        !parts.frontEnd ? "No pages: they're read from the Front End link's side menu." : parts.pagesError,
      ].filter((w): w is string => !!w)
    : [];

  return (
    // Clicks and keys inside (the dialog too, through the portal) mustn't open or close the note card.
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => void open()}
        title="Generate the RFQA hand-off notes"
        className={`rounded-md border border-zinc-300 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 ${
          compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        RFQA
      </button>
      {shown && (
        <Modal onClose={close} label="RFQA notes" className="max-w-xl">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="flex-1 font-semibold">RFQA notes</h2>
            <button type="button" onClick={close} aria-label="Close" className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
              ✕
            </button>
          </div>
          {!parts ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              <span className="mr-2 inline-block animate-spin">↻</span>Reading the side menu on the Front End page…
            </p>
          ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
            {warnings.length > 0 && (
              <ul className="list-disc rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(24, text.split("\n").length + 1)}
              className="w-full rounded-lg border border-zinc-300 bg-background p-3 font-mono text-sm dark:border-zinc-700"
              aria-label="RFQA notes"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-zinc-500">{copied}</span>
              {edited && (
                <button type="button" onClick={() => setText(rfqaText(parts))} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
                  Reset
                </button>
              )}
              <button type="button" onClick={() => copy(false)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
                Copy plain text
              </button>
              <button
                type="button"
                onClick={() => copy(true)}
                disabled={edited}
                title={edited ? "Edited: copy as plain text instead" : "“Front End” and “Client Folder” paste as links"}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Copy with links
              </button>
            </div>
          </div>
          )}
        </Modal>
      )}
    </div>
  );
}
