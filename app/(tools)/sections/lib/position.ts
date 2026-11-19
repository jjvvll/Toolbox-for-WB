// Where a heading sits over the homepage photo. The choice is a few extra rules
// added to the end of a design's CSS; its HTML stays the same.

import { formatCss, type Snippet } from "./shared";
import { familyOf, type SiteTemplate } from "./template";

export const ROWS = ["top", "middle", "bottom"] as const;
export const COLUMNS = ["left", "center", "right"] as const;
export type Position = { x: (typeof COLUMNS)[number]; y: (typeof ROWS)[number] };

export function positionLabel({ x, y }: Position): string {
  if (x === "center" && y === "middle") return "Center";
  return `${y[0].toUpperCase()}${y.slice(1)} ${x}`;
}

// Both templates hold the description in a flex column, so the vertical position is
// that column's alignment.
const VERTICAL = { top: "flex-start", middle: "center", bottom: "flex-end" };
const HORIZONTAL = {
  left: "margin-left: 0; margin-right: auto",
  center: "margin-left: auto; margin-right: auto",
  right: "margin-left: auto; margin-right: 0",
};

/**
 * The rules that move a heading to the given position in the template. Sideways, the
 * design shrinks to fit its content and moves as one block, keeping its own alignment
 * inside; that only applies on desktop, since every design centers itself on tablets
 * and phones. Designs that span the full screen only move up and down.
 *
 * Producer / Masterpiece: `.opening-with-search` is a full-height flex column whose
 * `.center-block` takes the space between the header and the bottom spacer, so the
 * description moves inside it. The title group is stretched to the container's width
 * so left and right line up with the site's content edge.
 *
 * Visionary: the text sits in `.opening-search__content`, which is made a flex column
 * so the slider (and the description in it) can move up and down.
 */
export function positionCss(snippet: Snippet, position: Position, template: SiteTemplate): string {
  const rules = [`/* Position: ${positionLabel(position).toLowerCase()} */`];
  if (familyOf(template) === "producer") {
    rules.push(`.opening-with-search .center-block { justify-content: ${VERTICAL[position.y]} !important }`);
  } else {
    rules.push(
      `.opening-search__content { display: flex !important; flex-direction: column; justify-content: ${VERTICAL[position.y]} !important }`,
    );
  }
  if (!snippet.fullWidth) {
    const stretch =
      familyOf(template) === "producer"
        ? ".opening-with-search .lp-title-group { width: 100%; max-width: 100% !important }"
        : ".opening-search__text-slider { width: 100% }";
    rules.push(`@media (min-width: 993px) { ${stretch} .hero-copy { width: fit-content; ${HORIZONTAL[position.x]} } }`);
  }
  return formatCss(rules.join("\n"));
}

/**
 * The description box a heading is pasted into: `.opening-description` in
 * Producer and Masterpiece, `.opening-search__description` in Visionary.
 */
export const HEADING_HOST = ":is(.opening-description, .opening-search__description)";

/** Rules aimed at the section around the heading, which stay as they are. */
const AROUND = /^(section\b|\.opening-with-search\b|\.opening-search)/;

/**
 * The design with every rule limited to the description box. That keeps rules
 * like `.buttons` off the template's own elements, and outranks the template's
 * type rules for the box (e.g. `.opening-search__description h2`) so the design
 * looks the same in every template. Every rule gains the same weight, so the
 * design's rules still override each other as before. Runs last, on formatted CSS:
 * each selector sits on its own line ending in "," or " {".
 */
export function scopeHeading(snippet: Snippet): Snippet {
  const css = snippet.css
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*)(.+?)(,| \{)$/);
      if (!match) return line;
      const [, pad, selector, end] = match;
      if (selector.startsWith("@") || selector.startsWith("/*") || AROUND.test(selector)) return line;
      return `${pad}${HEADING_HOST} ${selector}${end}`;
    })
    .join("\n");
  return { ...snippet, css };
}

/** The design with the position's rules added to its CSS. */
export function withPosition(snippet: Snippet, position: Position | null, template: SiteTemplate): Snippet {
  return position ? { ...snippet, css: `${snippet.css}\n${positionCss(snippet, position, template)}` } : snippet;
}
