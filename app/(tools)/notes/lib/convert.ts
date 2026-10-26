import TurndownService from "turndown";
import type { Note } from "./db";

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

export function noteToPlainText(note: Pick<Note, "title" | "content">): string {
  return [note.title.trim(), htmlToPlainText(note.content)].filter(Boolean).join("\n\n");
}
