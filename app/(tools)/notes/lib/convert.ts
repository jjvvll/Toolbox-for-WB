import TurndownService from "turndown";
import { DESIGN_FIELDS, LINK_FIELDS, NOTE_SECTIONS, sectionsOf, type Note } from "./db";

let turndown: TurndownService | null = null;

function getTurndown() {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    turndown.addRule("strikethrough", {
      filter: ["s", "del"],
      replacement: (content) => `~~${content}~~`,
    });
    // Turndown's default puts three spaces after the bullet ("-   item"); use one.
    turndown.addRule("listItem", {
      filter: "li",
      replacement: (content, node, options) => {
        const parent = node.parentNode as HTMLElement | null;
        let prefix = `${options.bulletListMarker} `;
        if (parent?.nodeName === "OL") {
          const start = Number(parent.getAttribute("start") ?? 1);
          prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
        }
        const indent = " ".repeat(prefix.length);
        const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n(?=.)/g, `\n${indent}`);
        return prefix + body + (node.nextSibling && !body.endsWith("\n") ? "\n" : "");
      },
    });
  }
  return turndown;
}

export function noteToMarkdown(note: Pick<Note, "title" | "content">): string {
  const body = note.content ? getTurndown().turndown(note.content).trim() : "";
  return [note.title.trim() && `# ${note.title.trim()}`, body].filter(Boolean).join("\n\n");
}

const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);

/** Readable plain text from editor HTML: block breaks and list bullets kept, formatting dropped. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const inner = () => Array.from(node.childNodes).map(walk).join("");

    if (node.tagName === "BR") return "\n";
    if (node.tagName === "HR") return "\n---\n\n";
    if (BLOCKS.has(node.tagName)) return `${inner().trim()}\n\n`;
    if (node.tagName === "UL" || node.tagName === "OL") {
      const ordered = node.tagName === "OL";
      const items = Array.from(node.children).filter((c) => c.tagName === "LI");
      const lines = items.map((li, i) => {
        const text = Array.from(li.childNodes).map(walk).join("").trim();
        const [first, ...rest] = text.split("\n");
        const bullet = ordered ? `${i + 1}. ` : "- ";
        // Indent wrapped/nested lines under their bullet.
        return [bullet + first, ...rest.map((l) => (l ? `   ${l}` : l))].join("\n");
      });
      return `${lines.join("\n")}\n\n`;
    }
    return inner();
  }

  return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const linkHtml = (value: string) =>
  /^https?:\/\//i.test(value.trim()) ? `<a href="${escapeHtml(value.trim())}">${escapeHtml(value.trim())}</a>` : escapeHtml(value);

type NoteFields = Pick<Note, "content" | "links" | "opportunity" | "sections" | "opportunities" | "sectionLinks" | "design">;

/**
 * Every field of a note as one HTML document, in the note's order: the links, Main
 * ticket, Opportunity, then each section. Used for copying and for the search text.
 * Empty fields are left out.
 */
export function noteFullHtml(note: NoteFields): string {
  const parts: string[] = [];
  const links = LINK_FIELDS.filter((f) => note.links?.[f.key]?.trim());
  if (links.length) parts.push(`<ul>${links.map((f) => `<li><strong>${f.label}:</strong> ${linkHtml(note.links![f.key]!)}</li>`).join("")}</ul>`);
  if (htmlToPlainText(note.content)) parts.push(`<h2>Main ticket</h2>${note.content}`);
  const o = note.opportunity;
  if (o && (htmlToPlainText(o.notes) || o.reference.trim() || htmlToPlainText(o.reason))) {
    parts.push("<h2>Opportunity</h2>");
    if (htmlToPlainText(o.notes)) parts.push(`<p><strong>Notes:</strong></p>${o.notes}`);
    if (o.reference.trim()) parts.push(`<p><strong>Reference:</strong> ${linkHtml(o.reference)}</p>`);
    if (htmlToPlainText(o.reason)) parts.push(`<p><strong>Reason:</strong></p>${o.reason}`);
  }
  const sections = sectionsOf(note);
  for (const s of NOTE_SECTIONS) {
    const body: string[] = [];
    const link = note.sectionLinks?.[s.key]?.trim();
    if (link) body.push(`<p><strong>Link:</strong> ${linkHtml(link)}</p>`);
    if (htmlToPlainText(sections[s.key] ?? "")) body.push(`<p><strong>Notes:</strong></p>${sections[s.key]}`);
    if (s.key === "design" && note.design) {
      if (note.design.moodboard.trim()) body.push(`<p><strong>Moodboard:</strong> ${linkHtml(note.design.moodboard)}</p>`);
      for (const f of DESIGN_FIELDS) {
        if (htmlToPlainText(note.design[f.key])) body.push(`<p><strong>${f.label}:</strong></p>${note.design[f.key]}`);
      }
    }
    if (body.length) parts.push(`<h2>${s.label}</h2>${body.join("")}`);
  }
  return parts.join("");
}

/** Plain text of every field, for search and card previews. */
export const noteSearchText = (note: NoteFields) => htmlToPlainText(noteFullHtml(note));

export function noteToPlainText(note: Pick<Note, "title" | "content">): string {
  return [note.title.trim(), htmlToPlainText(note.content)].filter(Boolean).join("\n\n");
}
