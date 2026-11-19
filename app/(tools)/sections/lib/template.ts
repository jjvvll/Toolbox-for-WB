// The site templates a section is pasted into. Producer and Masterpiece wrap headings
// and sections the same way and need the same fixes; Visionary differs. Each of the
// three has its own button design and button text.

import type { SectionKind } from "./preview";
import { formatCss } from "./shared";

export type SiteTemplate = "visionary" | "producer" | "masterpiece";
/** Templates that share their markup and site fixes. */
export type TemplateFamily = "visionary" | "producer";

export const familyOf = (template: SiteTemplate): TemplateFamily => (template === "visionary" ? "visionary" : "producer");

export const SITE_TEMPLATES: { id: SiteTemplate; label: string; hint: string }[] = [
  {
    id: "visionary",
    label: "Visionary",
    hint: "Headings go in the opening search's description; other sections in a full-bleed CTA.",
  },
  {
    id: "producer",
    label: "Producer",
    hint: "Headings go in the opening's description; other sections in a boxed-text section.",
  },
  {
    id: "masterpiece",
    label: "Masterpiece",
    hint: "Headings go in the opening's description; other sections in a boxed-text section.",
  },
];

/**
 * The palette tool's template, as one of the library's. The palette has one entry for
 * Producer and Masterpiece, so that one starts on Producer.
 */
export const siteTemplateOf = (paletteTemplateLabel: string): SiteTemplate =>
  paletteTemplateLabel === "Visionary" ? "visionary" : "producer";

const FIXES: Record<TemplateFamily, { opening: string; other: string }> = {
  visionary: {
    opening: `/* Site fixes */
      .opening-search__search-box { display: none !important }`,
    other: `/* Site fixes */
      .full-bleed-cta__description { margin-bottom: 0px !important }
      .full-bleed-cta { display: block }`,
  },
  producer: {
    opening: "",
    other: `/* Site fixes */
      .redesign p { white-space: normal !important }
      .boxed-text__description { margin-bottom: 0px !important }`,
  },
};

/** The rules a template needs for this kind of section to lay out as designed; "" for none. */
export function siteFixesCss(template: SiteTemplate, kind: SectionKind): string {
  const source = FIXES[familyOf(template)][kind === "opening" ? "opening" : "other"];
  return source ? formatCss(source) : "";
}
