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
        className={`border-2 border-zinc-900 bg-[var(--panel)] font-bold text-[var(--ink)] ${
          compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        RFQA
      </button>
      {shown && (
        <Modal onClose={close} label="RFQA notes" className="max-w-xl">
          <div className="manga-titlebar px-4 py-2.5">
            <h2 className="flex-1">RFQA notes</h2>
            <button type="button" onClick={close} aria-label="Close" className="manga-barbutton">
              ✕
            </button>
          </div>
          {!parts ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              <span className="mr-2 inline-block animate-spin">↻</span>Reading the side menu on the Front End page…
            </p>
          ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
            {warnings.length > 0 && (
              <ul className="list-disc border-2 border-[var(--ink)] bg-[#fff6c2] py-2 pl-7 pr-3 text-xs font-bold text-[var(--ink)]">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(24, text.split("\n").length + 1)}
              className="w-full border-2 border-zinc-900 bg-background p-3 font-mono text-sm"
              aria-label="RFQA notes"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs text-zinc-500">{copied}</span>
              {edited && (
                <button type="button" onClick={() => setText(rfqaText(parts))} className="border-2 border-zinc-900 bg-[var(--panel)] px-3 py-1.5 text-sm font-bold">
                  Reset
                </button>
              )}
              <button type="button" onClick={() => copy(false)} className="border-2 border-zinc-900 bg-[var(--panel)] px-3 py-1.5 text-sm font-bold">
                Copy plain text
              </button>
              <button
                type="button"
                onClick={() => copy(true)}
                disabled={edited}
                title={edited ? "Edited: copy as plain text instead" : "“Front End” and “Client Folder” paste as links"}
                className="bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-45"
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
