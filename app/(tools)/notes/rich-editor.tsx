"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { memo, useContext, useEffect, useRef } from "react";
import { EditorRegistryContext, useRegisterEditor } from "./editor-registry";
import { FormatBar, LinkStrip } from "./format-bar";
import { NoteHighlight, withNewHighlightIds } from "./lib/highlight";

export type EditorChange = { html: string; text: string };

/** A pasted string that is just one URL (surrounding whitespace allowed). */
function pastedUrl(text: string | undefined): string | null {
  const s = text?.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(s)) return s;
  if (/^www\.\S+\.\S+$/i.test(s)) return `https://${s}`;
  return null;
}

type RichEditorProps = {
  content: string;
  onChange: (change: EditorChange) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: string;
  /** Registers the editor for the highlights checklist, under this id and label. */
  fieldId?: string;
  fieldLabel?: string;
};

/**
 * Uncontrolled: `content` is read on mount only, so remount (via `key`) to load another note.
 * Memoized: saving a note re-renders the form around it, and redrawing a dozen editors on
 * every save made typing choppy. It only re-renders when its look changes, so `onChange`
 * must not depend on values that change (read them from a ref, as the note form does).
 */
const RichEditor = memo(
  RichEditorInner,
  (a, b) =>
    a.fieldId === b.fieldId &&
    a.fieldLabel === b.fieldLabel &&
    a.placeholder === b.placeholder &&
    a.minHeight === b.minHeight &&
    a.autoFocus === b.autoFocus,
);
export default RichEditor;

function RichEditorInner({ content, onChange, placeholder = "Start writing…", autoFocus = false, minHeight = "min-h-[50vh]", fieldId, fieldLabel }: RichEditorProps) {
  // In the note window the fields share one format bar, at the top of the window.
  const sharedBar = !!useContext(EditorRegistryContext) && !!fieldId;
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
      // Highlighter for what matters, in a few colors.
      NoteHighlight,
    ],
    content,
    editorProps: {
      attributes: { class: `tiptap-content ${minHeight} px-3 py-2 outline-none`, ...(fieldLabel ? { "aria-label": fieldLabel } : {}) },
      transformPasted: withNewHighlightIds,
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
  useRegisterEditor(editor, fieldId, fieldLabel);

  if (sharedBar) {
    return (
      <div className="note-field">
        <EditorContent editor={editor} />
      </div>
    );
  }
  return (
    <div className="flex flex-col overflow-hidden border border-zinc-200">
      {editor && (
        <div className="border-b border-zinc-200 bg-zinc-50">
          <FormatBar editor={editor} />
          <LinkStrip editor={editor} className="border-t border-zinc-200" />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
