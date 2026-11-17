// How many buttons a design shows. The choice rewrites the design's HTML and
// CSS: removed buttons take their rules with them, and an added button brings
// the rules it needs.

import type { SectionKind } from "./preview";
import { formatCss, type Snippet } from "./shared";

export type ButtonCount = 0 | 1 | 2;

/** The element that holds a kind of section's buttons, and the selectors its rules use. */
const PARTS: Record<SectionKind, { wrapper: string; selectors: string[] }> = {
  opening: { wrapper: "buttons", selectors: [".buttons", ".opening-button"] },
  profile: { wrapper: "profile__actions", selectors: [".profile__actions", ".profile__btn"] },
  text: { wrapper: "content-block__actions", selectors: [".content-block__actions", ".content-block__btn"] },
  media: { wrapper: "content-block__actions", selectors: [".content-block__actions", ".content-block__btn"] },
};

/**
 * Each button holder's lines: where it starts and the line it ends on. Most designs
 * have one; a few, such as alternating rows, have one per row.
 */
function holders(lines: string[], kind: SectionKind) {
  return lines.flatMap((line, start) => {
    if (!line.includes(`class="${PARTS[kind].wrapper}"`)) return [];
    const indent = line.match(/^\s*/)![0];
    const tag = line.trim().match(/^<(\w+)/)![1];
    // Either the whole holder sits on one line, or it closes at its own indent.
    const end = line.trimEnd().endsWith(`</${tag}>`)
      ? start
      : lines.findIndex((other, i) => i > start && other === `${indent}</${tag}>`);
    return [{ start, end }];
  });
}

/** How many buttons the design was built with, counted in its first holder. */
export function buttonCount(snippet: Snippet, kind: SectionKind): number {
  const lines = snippet.html.split("\n");
  const [first] = holders(lines, kind);
  if (!first) return 0;
  return (lines.slice(first.start, first.end + 1).join("\n").match(/<a /g) ?? []).length;
}

/** The counts a design can be switched between. Empty when it has no buttons to change. */
export function buttonChoices(snippet: Snippet, kind: SectionKind): ButtonCount[] {
  const count = buttonCount(snippet, kind);
  if (count === 0) return [];
  const most = count >= 2 || snippet.extraButton ? 2 : 1;
  return ([0, 1, 2] as const).filter((n) => n <= most);
}

// ---------- CSS ----------

type Item =
  | { type: "comment"; text: string }
  | { type: "rule"; selector: string; body: string }
  | { type: "at"; prelude: string; items: Item[] };

/** Reads the formatted CSS the library produces into comments, rules and at-rules. */
export function parse(css: string, from = 0): { items: Item[]; end: number } {
  const items: Item[] = [];
  let i = from;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length || css[i] === "}") return { items, end: i + 1 };
    if (css.startsWith("/*", i)) {
      const close = css.indexOf("*/", i) + 2;
      items.push({ type: "comment", text: css.slice(i, close) });
      i = close;
      continue;
    }
    const open = css.indexOf("{", i);
    const prelude = css.slice(i, open).trim().replace(/\s+/g, " ");
    if (prelude.startsWith("@")) {
      const inner = parse(css, open + 1);
      items.push({ type: "at", prelude, items: inner.items });
      i = inner.end;
    } else {
      const close = css.indexOf("}", open);
      items.push({ type: "rule", selector: prelude, body: css.slice(open + 1, close).trim().replace(/\s+/g, " ") });
      i = close + 1;
    }
  }
  return { items, end: i };
}

export function serialize(items: Item[]): string {
  return items
    .map((item) =>
      item.type === "comment"
        ? item.text
        : item.type === "rule"
          ? `${item.selector} { ${item.body} }`
          : `${item.prelude} { ${serialize(item.items)} }`,
    )
    .join("\n");
}

/** Removes rules whose every selector `drop` matches, and media queries left empty. */
function dropRules(items: Item[], drop: (selector: string) => boolean, dropComment: (text: string) => boolean): Item[] {
  return items.flatMap((item): Item[] => {
    if (item.type === "comment") return dropComment(item.text) ? [] : [item];
    if (item.type === "rule") return item.selector.split(/,\s*/).every(drop) ? [] : [item];
    const inner = dropRules(item.items, drop, dropComment);
    return inner.some((child) => child.type !== "comment") ? [{ ...item, items: inner }] : [];
  });
}

const keepComments = () => false;
const rewriteCss = (
  css: string,
  drop: (selector: string) => boolean,
  dropComment: (text: string) => boolean = keepComments,
) => formatCss(serialize(dropRules(parse(css).items, drop, dropComment)));

/** Puts extra rules before the design's rules for smaller screens, so those still apply last. */
function insertCss(css: string, extra: string): string {
  const marker = "/* Smaller screens */";
  const at = css.indexOf(marker);
  const formatted = formatCss(extra);
  return at < 0 ? `${css}\n${formatted}` : `${css.slice(0, at)}${formatted}\n${css.slice(at)}`;
}

// ---------- The choice ----------

/** The design with `count` buttons, or as built when `count` is null. */
export function withButtons(snippet: Snippet, kind: SectionKind, count: ButtonCount | null): Snippet {
  const built = buttonCount(snippet, kind);
  if (count === null || count === built || built === 0) return snippet;
  const lines = snippet.html.split("\n");
  // Last holder first, so removing lines doesn't move the ones still to come.
  const all = holders(lines, kind).reverse();
  const { selectors } = PARTS[kind];

  if (count === 0) {
    for (const at of all) lines.splice(at.start, at.end - at.start + 1);
    // The holder's class, the button's class, and the button's style modifiers.
    const patterns = selectors.map((s) => new RegExp(`\\${s}(?:--[\\w-]+)?(?![\\w-])`));
    return {
      ...snippet,
      html: lines.join("\n"),
      css: rewriteCss(
        snippet.css,
        (selector) => patterns.some((p) => p.test(selector)),
        (text) => /button/i.test(text),
      ),
    };
  }

  if (count < built) {
    // Keep the first button, which every design treats as the main one.
    for (const at of all) {
      const anchors = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line, i }) => i > at.start && i < at.end && line.trim().startsWith("<a "));
      for (const { i } of anchors.slice(count).reverse()) lines.splice(i, 1);
    }
    const html = lines.join("\n");
    // Rules for a button style no longer on the page go too.
    const unused = (selector: string) =>
      (selector.match(/opening-button--[\w-]+/g) ?? []).some((cls) => !html.includes(cls));
    return { ...snippet, html, css: rewriteCss(snippet.css, unused) };
  }

  // One more button, after the first, in every holder.
  const extra = snippet.extraButton!;
  for (const at of all) {
    if (at.start === at.end) {
      const close = lines[at.start].lastIndexOf("</");
      lines[at.start] = `${lines[at.start].slice(0, close)}${extra.html}${lines[at.start].slice(close)}`;
    } else {
      const indent = lines[at.start + 1].match(/^\s*/)![0];
      lines.splice(at.start + 2, 0, `${indent}${extra.html}`);
    }
  }
  return { ...snippet, html: lines.join("\n"), css: extra.css ? insertCss(snippet.css, extra.css) : snippet.css };
}

/** Checks that reading and rewriting a design's CSS without changes gives it back unchanged. */
export const roundTrips = (css: string) => rewriteCss(css, () => false) === css;
