// The highlighter. Each highlight carries an id, so one highlight is one checklist item no
// matter how many lines it covers.

import { getStyleProperty, isValidCSSStyleValue, type Editor } from "@tiptap/react";
import Highlight from "@tiptap/extension-highlight";
import { Fragment, Slice, type Node as DocNode } from "@tiptap/pm/model";

/** Highlighter colors: all light, so dark text is readable on each. */
export const HIGHLIGHTS = [
  { name: "Yellow", color: "#fde047" },
  { name: "Green", color: "#86efac" },
  { name: "Pink", color: "#f9a8d4" },
  { name: "Blue", color: "#93c5fd" },
  { name: "Orange", color: "#fdba74" },
];

const newHighlightId = () => crypto.randomUUID().slice(0, 8);

export const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-color") || getStyleProperty(el, "background-color") || el.style.backgroundColor || null,
        // Tiptap's own version also writes "color: inherit", which put the note's light text on
        // a light highlight. The text color comes from globals.css, worked out from --mark.
        renderHTML: ({ color }) => (isValidCSSStyleValue(color) ? { "data-color": color, style: `--mark: ${color}; background-color: ${color}` } : {}),
      },
      hid: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-hl"),
        renderHTML: ({ hid }) => (hid ? { "data-hl": hid } : {}),
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => {
        toggleHighlight(this.editor, HIGHLIGHTS[0].color);
        return true;
      },
    };
  },
}).configure({ multicolor: true });

/** Highlights the selection as one highlight, or removes the color if it already has it. */
export function toggleHighlight(editor: Editor, color: string) {
  const chain = editor.chain().focus();
  if (editor.isActive("highlight", { color })) chain.unsetHighlight().run();
  else chain.setMark("highlight", { color, hid: newHighlightId() }).run();
}

/** Pasted highlights become highlights of their own, not more of the one they were copied from. */
export function withNewHighlightIds(slice: Slice): Slice {
  const ids = new Map<string, string>();
  const fresh = (id: string) => {
    if (!ids.has(id)) ids.set(id, newHighlightId());
    return ids.get(id)!;
  };
  const mapNode = (node: DocNode): DocNode => {
    const copy = node.isText ? node : node.copy(mapAll(node.content));
    return copy.mark(node.marks.map((m) => (m.type.name === "highlight" && m.attrs.hid ? m.type.create({ ...m.attrs, hid: fresh(m.attrs.hid) }) : m)));
  };
  const mapAll = (fragment: Fragment): Fragment => {
    const nodes: DocNode[] = [];
    fragment.forEach((n) => void nodes.push(mapNode(n)));
    return Fragment.from(nodes);
  };
  return new Slice(mapAll(slice.content), slice.openStart, slice.openEnd);
}

export type HighlightItem = {
  /** Where its text is: more than one range when it covers several lines. */
  ranges: { from: number; to: number }[];
  text: string;
  color: string;
  /** All of it is crossed out. */
  done: boolean;
};

/**
 * Every highlight in a document, one item each, however many lines it covers. Highlights made
 * before they had ids are told apart by their text: touching text in one color is one
 * highlight, also across lines.
 */
export function scanHighlights(doc: DocNode): HighlightItem[] {
  type Run = HighlightItem & { block: DocNode | null };
  const out: Run[] = [];
  const byId = new Map<string, Run>();
  // The highlight without an id that the next text can still belong to.
  const last: { open: Run | null; lineBreak: boolean } = { open: null, lineBreak: false };

  doc.descendants((node, pos, parent) => {
    if (!node.isText) {
      if (node.type.name === "hardBreak") last.lineBreak = true;
      return;
    }
    const mark = node.marks.find((m) => m.type.name === "highlight");
    if (!mark) {
      last.open = null;
      last.lineBreak = false;
      return;
    }
    const color = (mark.attrs.color as string | null) ?? HIGHLIGHTS[0].color;
    const hid = mark.attrs.hid as string | null;
    const struck = node.marks.some((m) => m.type.name === "strike");
    const to = pos + node.nodeSize;
    const text = node.text ?? "";
    let item: Run | undefined = hid ? byId.get(hid) : last.open?.color === color ? last.open : undefined;
    if (item) {
      const range = item.ranges[item.ranges.length - 1];
      const newLine = item.block !== parent || last.lineBreak;
      item.text += (newLine ? "\n" : range.to === pos ? "" : " … ") + text;
      if (range.to === pos) range.to = to;
      else item.ranges.push({ from: pos, to });
      item.done = item.done && (struck || !text.trim());
      item.block = parent;
    } else {
      item = { ranges: [{ from: pos, to }], text, color, done: struck, block: parent };
      out.push(item);
      if (hid) byId.set(hid, item);
    }
    last.open = hid ? null : item;
    last.lineBreak = false;
  });
  return out.filter((i) => i.text.trim()).map(({ ranges, text, color, done }) => ({ ranges, text: text.trim(), color, done }));
}
