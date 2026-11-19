// Two choices written into the CSS: whether a profile or content section keeps
// the space above and below it, and whether a design brings the fixes its site
// template needs (lib/template.ts).

import type { SectionKind } from "./preview";
import { formatCss, type Snippet } from "./shared";
import { siteFixesCss, type SiteTemplate } from "./template";

/** The full-width element each kind of section is wrapped in. */
const WRAPPERS: Partial<Record<SectionKind, string>> = {
  profile: ".profile",
  text: ".content-block",
  media: ".content-block",
};

/** Profiles and content sections have the space choice; headings don't. */
export const hasSpacing = (kind: SectionKind) => kind in WRAPPERS;

/** Whether the template has fixes for this kind of section. */
export const hasSiteFixes = (template: SiteTemplate, kind: SectionKind) => !!siteFixesCss(template, kind);

/**
 * The design with its top and bottom padding and margin removed unless `keepSpace`
 * (profiles and content sections only), and with the template's site fixes first in
 * its CSS unless `siteFixes` is false. The removal comes last in the CSS, so it
 * applies on every screen size.
 */
export function withSpacing(
  snippet: Snippet,
  kind: SectionKind,
  template: SiteTemplate,
  { keepSpace, siteFixes = false }: { keepSpace?: boolean; siteFixes?: boolean },
): Snippet {
  const wrapper = WRAPPERS[kind];
  let css = snippet.css;
  if (wrapper && !keepSpace) {
    css += `\n${formatCss(
      `/* No space above or below */
       ${wrapper} { margin-top: 0; margin-bottom: 0; padding-top: 0; padding-bottom: 0 }`,
    )}`;
  }
  const fixes = siteFixesCss(template, kind);
  if (siteFixes && fixes) css = `${fixes}\n${css}`;
  return { ...snippet, css };
}
