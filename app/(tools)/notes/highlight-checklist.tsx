"use client";

import type { Editor } from "@tiptap/react";
import { useContext, useMemo, useSyncExternalStore } from "react";
import { EditorRegistryContext } from "./editor-registry";
import { HIGHLIGHTS } from "./rich-editor";

type Item = { key: string; editor: Editor; field: string; from: number; to: number; text: string; color: string; done: boolean };

/** Every highlighted run of text in an editor: neighbouring text with the same color counts as one. */
function highlightsIn(editor: Editor, field: string, fieldId: string): Item[] {
  const out: Item[] = [];
  let cur: Item | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      cur = null; // a new paragraph or line break starts a new item
      return;
    }
    const mark = node.marks.find((m) => m.type.name === "highlight");
    if (!mark) {
      cur = null;
      return;
    }
    const color = (mark.attrs.color as string | null) ?? HIGHLIGHTS[0].color;
    const struck = node.marks.some((m) => m.type.name === "strike");
    if (cur && cur.to === pos && cur.color === color) {
      cur.to = pos + node.nodeSize;
      cur.text += node.text ?? "";
      cur.done = cur.done && struck;
    } else {
      cur = { key: `${fieldId}:${pos}`, editor, field, from: pos, to: pos + node.nodeSize, text: node.text ?? "", color, done: struck };
      out.push(cur);
    }
  });
  return out.filter((i) => i.text.trim());
}

/** Crosses out (or restores) a highlighted run in its editor; saved with the note like any edit. */
function setDone(item: Item, done: boolean) {
  const { state, view } = item.editor;
  const strike = state.schema.marks.strike;
  if (!strike) return;
  const tr = done ? state.tr.addMark(item.from, item.to, strike.create()) : state.tr.removeMark(item.from, item.to, strike);
  view.dispatch(tr);
}

/** Selects the highlighted text in its editor and scrolls it into view. */
function jumpTo(item: Item) {
  item.editor.chain().focus().setTextSelection({ from: item.from, to: item.to }).scrollIntoView().run();
}

/**
 * The checklist beside the note window: every highlighted word or phrase in the note,
 * with a checkbox. Checking it crosses the text out in the note.
 */
export default function HighlightChecklist({ className = "" }: { className?: string }) {
  const registry = useContext(EditorRegistryContext);
  const version = useSyncExternalStore(registry?.subscribe ?? (() => () => {}), registry?.getVersion ?? (() => 0), () => 0);
  const groups = useMemo(() => {
    if (!registry) return [];
    return registry
      .list()
      .map((e) => ({ id: e.id, label: e.label, items: highlightsIn(e.editor, e.label, e.id) }))
      .filter((g) => g.items.length);
    // `version` changes whenever an editor's text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, version]);

  const items = groups.flatMap((g) => g.items);
  if (!items.length) return null;
  const done = items.filter((i) => i.done).length;

  return (
    <aside aria-label="Highlights checklist" className={`flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-background text-foreground dark:border-zinc-800 ${className}`}>
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="text-sm font-medium">Highlights</span>
        <span className="ml-auto text-xs text-zinc-500">
          {done} of {items.length} done
        </span>
      </header>
      <div className="h-1 shrink-0 bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.map((g) => (
          <div key={g.id} className="mb-2 last:mb-0">
            <p className="px-1.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <li key={item.key} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => setDone(item, e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                    aria-label={`Done: ${item.text}`}
                  />
                  <button
                    type="button"
                    onClick={() => jumpTo(item)}
                    title="Show it in the note"
                    className={`min-w-0 flex-1 text-left text-sm leading-snug ${item.done ? "text-zinc-400 line-through" : ""}`}
                  >
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle ring-1 ring-black/10" style={{ background: item.color }} />
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
