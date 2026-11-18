// Two choices for profile and content sections, both written into the CSS:
// whether the design keeps the space above and below it, and whether it brings
// the fixes the site's boxed-text section needs.

import type { SectionKind } from "./preview";
import { formatCss, type Snippet } from "./shared";

/** The full-width element each kind of section is wrapped in. */
const WRAPPERS: Partial<Record<SectionKind, string>> = {
  profile: ".profile",
  text: ".content-block",
  media: ".content-block",
};

/** Profiles and content sections have the choices; headings don't. */
export const hasSpacing = (kind: SectionKind) => kind in WRAPPERS;

/** Rules the site needs for a pasted section to lay out as designed. */
export const SITE_FIXES_CSS = formatCss(
  `/* Site fixes */
   .redesign p { white-space: normal !important }
   .boxed-text__description { margin-bottom: 0px !important }`,
);

/**
 * The design with its top and bottom padding and margin removed unless `keepSpace`,
 * and with the site fixes first in its CSS unless `siteFixes` is false. The removal
 * comes last in the CSS, so it applies on every screen size.
 */
export function withSpacing(
  snippet: Snippet,
  kind: SectionKind,
  { keepSpace, siteFixes }: { keepSpace: boolean; siteFixes: boolean },
): Snippet {
  const wrapper = WRAPPERS[kind];
  if (!wrapper) return snippet;
  let css = snippet.css;
  if (!keepSpace) {
    css += `\n${formatCss(
      `/* No space above or below */
       ${wrapper} { margin-top: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0 }`,
    )}`;
  }
  if (siteFixes) css = `${SITE_FIXES_CSS}\n${css}`;
  return { ...snippet, css };
}
