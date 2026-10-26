"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { useEffect, useRef } from "react";

export type EditorChange = { html: string; text: string };

/** A pasted string that is just one URL (surrounding whitespace allowed). */
function pastedUrl(text: string | undefined): string | null {
  const s = text?.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(s)) return s;
  if (/^www\.\S+\.\S+$/i.test(s)) return `https://${s}`;
  return null;
}

/** Uncontrolled: `content` is read on mount only, so remount (via `key`) to load another note. */
export default function RichEditor({
  content,
  onChange,
  placeholder = "Start writing…",
  autoFocus = false,
  minHeight = "min-h-[50vh]",
}: {
  content: string;
  onChange: (change: EditorChange) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: string;
}) {
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          // Select text and paste a URL to turn the selection into a link.
          linkOnPaste: true,
          autolink: true,
          openOnClick: true,
          defaultProtocol: "https",
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editorProps: {
      attributes: { class: `tiptap-content ${minHeight} px-4 py-3 outline-none` },
      // Select text, then Ctrl+V a URL: the selection becomes a link. linkOnPaste does
      // this too, but only for an exact URL; this also accepts a copied URL with
      // stray spaces or a trailing newline.
      handlePaste: (view, event) => {
        const url = pastedUrl(event.clipboardData?.getData("text/plain"));
        if (!url || view.state.selection.empty || !editorRef.current) return false;
        editorRef.current.chain().focus().setLink({ href: url }).run();
        return true;
      },
    },
    onUpdate: ({ editor }) =>
      onChange({ html: editor.getHTML(), text: editor.getText({ blockSeparator: "\n" }) }),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
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
      href: e.isActive("link") ? ((e.getAttributes("link").href as string | undefined) ?? null) : null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function editLink() {
    const current = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", current ?? "https://");
    if (url === null) return;
    if (!url.trim() || url.trim() === "https://") {
      chain().extendMarkRange("link").unsetLink().run();
    } else {
      chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
    }
  }

  const buttons: { label: string; title: string; active?: boolean; disabled?: boolean; run: () => void; className?: string }[] = [
    { label: "B", title: "Bold (Ctrl+B)", active: state.bold, run: () => chain().toggleBold().run(), className: "font-bold" },
    { label: "I", title: "Italic (Ctrl+I)", active: state.italic, run: () => chain().toggleItalic().run(), className: "italic" },
    { label: "S", title: "Strikethrough", active: state.strike, run: () => chain().toggleStrike().run(), className: "line-through" },
    { label: "</>", title: "Inline code", active: state.code, run: () => chain().toggleCode().run(), className: "font-mono text-xs" },
    { label: "H1", title: "Heading 1", active: state.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
    { label: "H2", title: "Heading 2", active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "H3", title: "Heading 3", active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: "•", title: "Bullet list", active: state.bullet, run: () => chain().toggleBulletList().run() },
    { label: "1.", title: "Numbered list", active: state.ordered, run: () => chain().toggleOrderedList().run() },
    { label: "❝", title: "Quote", active: state.quote, run: () => chain().toggleBlockquote().run() },
    { label: "{ }", title: "Code block", active: state.codeBlock, run: () => chain().toggleCodeBlock().run(), className: "font-mono text-xs" },
    { label: "🔗", title: "Link (or select text and paste a URL)", active: state.link, run: editLink },
    { label: "↶", title: "Undo (Ctrl+Z)", disabled: !state.canUndo, run: () => chain().undo().run() },
    { label: "↷", title: "Redo (Ctrl+Shift+Z)", disabled: !state.canRedo, run: () => chain().redo().run() },
  ];

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-wrap gap-0.5 p-1">
        {buttons.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-label={b.title}
            aria-pressed={b.active}
            disabled={b.disabled}
            // Keep the selection in the editor when clicking a button.
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.run}
            className={`min-w-8 rounded-md px-2 py-1 text-sm transition-colors disabled:opacity-30 ${
              b.active
                ? "bg-zinc-200 text-foreground dark:bg-zinc-700"
                : "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
            } ${b.className ?? ""}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {state.href && (
        // Shown while the cursor is inside a link.
        <div className="flex items-center gap-2 border-t border-zinc-200 px-2.5 py-1.5 text-xs dark:border-zinc-800">
          <span aria-hidden>🔗</span>
          <a
            href={state.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="min-w-0 flex-1 truncate text-blue-600 hover:underline dark:text-blue-400"
            title={state.href}
          >
            {state.href}
          </a>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={editLink}
            className="rounded px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Edit
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().extendMarkRange("link").unsetLink().run()}
            className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
