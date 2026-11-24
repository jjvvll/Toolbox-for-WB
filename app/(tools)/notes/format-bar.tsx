"use client";

import { askText } from "@/components/ask-dialog";
import { useEditorState, type Editor } from "@tiptap/react";
import { useState, useSyncExternalStore } from "react";
import type { EditorRegistry } from "./editor-registry";
import { HIGHLIGHTS, toggleHighlight } from "./lib/highlight";

/** Sets, changes or removes the link at the cursor. */
async function editLink(editor: Editor) {
  const current = editor.getAttributes("link").href as string | undefined;
  const url = await askText({ title: current ? "Edit link" : "Add link", label: "Leave it empty to remove the link.", defaultValue: current ?? "https://", confirmLabel: "Save" });
  if (url === null) return;
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!url.trim() || url.trim() === "https://") chain.unsetLink().run();
  else chain.setLink({ href: url.trim() }).run();
}

const bulletIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="M3 6h2M3 12h2M3 18h2" strokeWidth={4} />
  </svg>
);

/** Whether "Aa" is open: kept while moving between fields. */
let moreOpen = false;

type Button = { label: React.ReactNode; title: string; active?: boolean; disabled?: boolean; run: (e: Editor) => void; className?: string };

/**
 * Highlighter and text formatting for one editor; greyed out without one. Headings, quotes and
 * code are behind "Aa".
 */
export function FormatBar({ editor, hint }: { editor: Editor | null; hint?: string }) {
  const [more, setMore] = useState(moreOpen);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        quote: e.isActive("blockquote"),
        codeBlock: e.isActive("codeBlock"),
        link: e.isActive("link"),
        highlight: (e.getAttributes("highlight").color as string | null | undefined) ?? (e.isActive("highlight") ? HIGHLIGHTS[0].color : null),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      },
  });

  const render = (b: Button) => (
    <button
      key={b.title}
      type="button"
      title={b.title}
      aria-label={b.title}
      aria-pressed={b.active}
      disabled={!editor || b.disabled}
      // Keep the selection in the editor when clicking a button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor && b.run(editor)}
      className={`flex h-7 min-w-7 items-center justify-center px-1.5 text-sm transition-colors disabled:opacity-30 ${
        b.active ? "bg-[var(--ink)] text-[var(--panel)]" : "text-zinc-600 enabled:hover:bg-zinc-200"
      } ${b.className ?? ""}`}
    >
      {b.label}
    </button>
  );

  const basic: Button[] = [
    { label: "B", title: "Bold (Ctrl+B)", active: state?.bold, run: (e) => e.chain().focus().toggleBold().run(), className: "font-bold" },
    { label: "I", title: "Italic (Ctrl+I)", active: state?.italic, run: (e) => e.chain().focus().toggleItalic().run(), className: "italic" },
    { label: "S", title: "Strikethrough", active: state?.strike, run: (e) => e.chain().focus().toggleStrike().run(), className: "line-through" },
    { label: bulletIcon, title: "Bullet list", active: state?.bullet, run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: "1.", title: "Numbered list", active: state?.ordered, run: (e) => e.chain().focus().toggleOrderedList().run() },
    { label: "🔗", title: "Link (or select text and paste a URL)", active: state?.link, run: editLink },
  ];
  const extra: Button[] = [
    { label: "H1", title: "Heading 1", active: state?.h1, run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "H2", title: "Heading 2", active: state?.h2, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "H3", title: "Heading 3", active: state?.h3, run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "❝", title: "Quote", active: state?.quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
    { label: "</>", title: "Inline code", active: state?.code, run: (e) => e.chain().focus().toggleCode().run(), className: "font-mono text-xs" },
    { label: "{ }", title: "Code block", active: state?.codeBlock, run: (e) => e.chain().focus().toggleCodeBlock().run(), className: "font-mono text-xs" },
  ];
  const history: Button[] = [
    { label: "↶", title: "Undo (Ctrl+Z)", disabled: !state?.canUndo, run: (e) => e.chain().focus().undo().run() },
    { label: "↷", title: "Redo (Ctrl+Shift+Z)", disabled: !state?.canRedo, run: (e) => e.chain().focus().redo().run() },
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex min-h-9 flex-wrap items-center gap-x-0.5 gap-y-1 px-2 py-1">
      {/* Highlighter: select words, pick a color. The active color is ringed; ✕ removes it. */}
      <span className="flex items-center gap-1" role="group" aria-label="Highlight">
        {HIGHLIGHTS.map((h) => (
          <button
            key={h.color}
            type="button"
            title={`Highlight ${h.name.toLowerCase()} (select words first)`}
            aria-label={`Highlight ${h.name.toLowerCase()}`}
            aria-pressed={state?.highlight === h.color}
            disabled={!editor}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && toggleHighlight(editor, h.color)}
            className={`h-5 w-5 disabled:opacity-40 ${state?.highlight === h.color ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--panel)]" : "ring-1 ring-black/20"}`}
            style={{ background: h.color }}
          />
        ))}
        {render({ label: "✕", title: "Remove highlight", disabled: !state?.highlight, run: (e) => e.chain().focus().unsetHighlight().run(), className: "text-xs" })}
      </span>
      <Divider />
      {basic.map(render)}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMore((moreOpen = !more))}
        aria-expanded={more}
        title="Headings, quote and code"
        className={`flex h-7 items-center px-1.5 text-sm font-bold ${more ? "bg-zinc-200" : "text-zinc-600 hover:bg-zinc-200"}`}
      >
        Aa {more ? "‹" : "›"}
      </button>
      {more && extra.map(render)}
      <Divider />
      {history.map(render)}
      {!editor && hint && <span className="ml-auto pl-2 text-xs text-zinc-500 max-sm:hidden">{hint}</span>}
    </div>
  );
}

const Divider = () => <span aria-hidden className="mx-1.5 h-5 w-px bg-zinc-300" />;

/** Shown while the cursor is inside a link: open, edit or remove it. */
export function LinkStrip({ editor, className = "" }: { editor: Editor | null; className?: string }) {
  const link = useEditorState({ editor, selector: ({ editor: e }) => (e?.isActive("link") ? ((e.getAttributes("link").href as string | undefined) ?? null) : null) });
  if (!editor || !link) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${className}`}>
      <span aria-hidden>🔗</span>
      <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate text-blue-600 hover:underline" title={link}>
        {link}
      </a>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editLink(editor)} className="px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-200">
        Edit
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        className="px-1.5 py-0.5 text-red-600 hover:bg-zinc-200"
      >
        Remove
      </button>
    </div>
  );
}

/** The field being written in, or null until one is clicked. */
export function useActiveEditor(registry: EditorRegistry) {
  return useSyncExternalStore(registry.subscribeActive, registry.getActive, () => null);
}
