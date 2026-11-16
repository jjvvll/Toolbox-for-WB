// Where a heading sits over the homepage photo. The choice is a few extra rules
// added to the end of a design's CSS; its HTML stays the same.

import { formatCss, type Snippet } from "./shared";

export const ROWS = ["top", "middle", "bottom"] as const;
export const COLUMNS = ["left", "center", "right"] as const;
export type Position = { x: (typeof COLUMNS)[number]; y: (typeof ROWS)[number] };

export function positionLabel({ x, y }: Position): string {
  if (x === "center" && y === "middle") return "Center";
  return `${y[0].toUpperCase()}${y.slice(1)} ${x}`;
}

// The opening section centers its description in a flex column, so the vertical
// position is that column's alignment.
const VERTICAL = { top: "flex-start", middle: "center", bottom: "flex-end" };
const HORIZONTAL = {
  left: "margin-left: 0; margin-right: auto",
  center: "margin-left: auto; margin-right: auto",
  right: "margin-left: auto; margin-right: 0",
};

/**
 * The rules that move a heading to the given position. Sideways, the design
 * shrinks to fit its content and moves as one block, keeping its own alignment
 * inside; that only applies on desktop, since every design centers itself on
 * tablets and phones. Designs that span the full screen only move up and down.
 */
export function positionCss(snippet: Snippet, position: Position): string {
  const rules = [
    `/* Position: ${positionLabel(position).toLowerCase()} */`,
    `.opening-with-search .center-block { justify-content: ${VERTICAL[position.y]} !important }`,
  ];
  if (!snippet.fullWidth) {
    rules.push(`@media (min-width: 993px) { .hero-copy { width: fit-content; ${HORIZONTAL[position.x]} } }`);
  }
  return formatCss(rules.join("\n"));
}

/** The design with the position's rules added to its CSS. */
export function withPosition(snippet: Snippet, position: Position | null): Snippet {
  return position ? { ...snippet, css: `${snippet.css}\n${positionCss(snippet, position)}` } : snippet;
}
