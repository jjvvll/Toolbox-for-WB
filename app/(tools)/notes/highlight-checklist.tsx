"use client";

import type { Editor } from "@tiptap/react";
import { memo, useCallback, useContext, useDeferredValue, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { EditorRegistryContext } from "./editor-registry";
import { HIGHLIGHTS } from "./rich-editor";

type Item = { key: string; editor: Editor; field: string; from: number; to: number; text: string; color: string; done: boolean };

/**
 * Results per document. Editor documents never change in place (each edit makes a new one),
 * so an editor that wasn't touched keeps its document and isn't scanned again: typing in one
 * field re-scans that field, not all fifteen.
 */
const scanned = new WeakMap<object, Item[]>();
function highlightsIn(editor: Editor, field: string, fieldId: string): Item[] {
  const doc = editor.state.doc;
  const cached = scanned.get(doc);
  if (cached) return cached;
  const items = scan(editor, field, fieldId);
  scanned.set(doc, items);
  return items;
}

/** Every highlighted run of text in an editor: neighbouring text with the same color counts as one. */
function scan(editor: Editor, field: string, fieldId: string): Item[] {
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
      // Keyed by order in the field, not position, so typing before a highlight doesn't
      // make every row after it look new.
      cur = { key: `${fieldId}:${out.length}`, editor, field, from: pos, to: pos + node.nodeSize, text: node.text ?? "", color, done: struck };
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
  // Deferred: typing comes first, and the list catches up when the browser has a moment
  // (scanning every editor on each keystroke made typing in long notes choppy).
  const deferredVersion = useDeferredValue(version);
  const groups = useMemo(() => {
    if (!registry) return [];
    return registry
      .list()
      .map((e) => ({ id: e.id, label: e.label, items: highlightsIn(e.editor, e.label, e.id) }))
      .filter((g) => g.items.length);
    // `deferredVersion` changes whenever an editor's text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, deferredVersion]);

  const items = groups.flatMap((g) => g.items);
  // Rows find their item here when clicked, so a row only redraws when what it shows changes
  // (not when typing earlier in the field moves its text along).
  const byKey = useRef(new Map<string, Item>());
  useLayoutEffect(() => {
    byKey.current = new Map(items.map((i) => [i.key, i]));
  });
  const toggle = useCallback((key: string, done: boolean) => {
    const item = byKey.current.get(key);
    if (item) setDone(item, done);
  }, []);
  const jump = useCallback((key: string) => {
    const item = byKey.current.get(key);
    if (item) jumpTo(item);
  }, []);
  if (!items.length) return null;
  const done = items.filter((i) => i.done).length;

  return (
    <aside aria-label="Highlights checklist" className={`manga-window manga-dark flex flex-col overflow-hidden text-foreground ${className}`}>
      <header className="manga-titlebar shrink-0 px-3 py-2">
        <span className="manga-title text-sm">Highlights</span>
        <span className="ml-auto text-xs font-bold text-white/80">
          {done} of {items.length} done
        </span>
      </header>
      <div className="h-2 shrink-0 border-b-2 border-[var(--ink)] bg-[var(--panel)]">
        <div className="h-full bg-[var(--yellow)] transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {groups.map((g) => (
          // Groups off screen skip layout and painting until scrolled to.
          <div key={g.id} className="mb-2 last:mb-0 [content-visibility:auto] [contain-intrinsic-size:auto_200px]">
            <p className="px-1.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <Row key={item.key} id={item.key} text={item.text} color={item.color} done={item.done} onToggle={toggle} onJump={jump} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** One checklist row; redraws only when its text, color or tick changes. */
const Row = memo(function Row({
  id,
  text,
  color,
  done,
  onToggle,
  onJump,
}: {
  id: string;
  text: string;
  color: string;
  done: boolean;
  onToggle: (key: string, done: boolean) => void;
  onJump: (key: string) => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900">
      <input type="checkbox" checked={done} onChange={(e) => onToggle(id, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" aria-label={`Done: ${text}`} />
      <button type="button" onClick={() => onJump(id)} title="Show it in the note" className={`min-w-0 flex-1 text-left text-sm leading-snug ${done ? "text-zinc-400 line-through" : ""}`}>
        <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle ring-1 ring-black/10" style={{ background: color }} />
        {text}
      </button>
    </li>
  );
});
