// The library's top level: each style set holds its own headings, profiles and
// content sections.

import { BOLD_OPENINGS, BOLD_PROFILES } from "./bold";
import { contentSections } from "./content";
import { LUXURY_OPENINGS, LUXURY_PROFILES } from "./luxury";
import { MODERN_OPENINGS, MODERN_PROFILES } from "./modern";
import { OPENINGS } from "./openings";
import type { SectionKind } from "./preview";
import { PROFILES } from "./profiles";
import type { Snippet } from "./shared";

export type Style = {
  id: string;
  label: string;
  /** What sets the style apart, shown under the filters. */
  hint: string;
  sections: Record<SectionKind, Snippet[]>;
};

export const STYLES: Style[] = [
  {
    id: "normal",
    label: "Normal",
    hint: "The all-round set: clear type and familiar layouts that suit most agent and brokerage sites.",
    sections: { opening: OPENINGS, profile: PROFILES, ...contentSections("normal") },
  },
  {
    id: "luxury",
    label: "Luxury",
    hint: "For high-end listings: light, widely spaced type, italic serif taglines, hairline frames and thin buttons.",
    sections: { opening: LUXURY_OPENINGS, profile: LUXURY_PROFILES, ...contentSections("luxe") },
  },
  {
    id: "modern",
    label: "Modern",
    hint: "For newer builds and city markets: frosted rounded panels, pill labels, tight headlines and rounded buttons.",
    sections: { opening: MODERN_OPENINGS, profile: MODERN_PROFILES, ...contentSections("modern") },
  },
  {
    id: "bold",
    label: "Bold",
    hint: "For brands that want to stand out: heavy uppercase headlines, thick bars, solid color blocks and square buttons.",
    sections: { opening: BOLD_OPENINGS, profile: BOLD_PROFILES, ...contentSections("bold") },
  },
];

export const KINDS: {
  id: SectionKind;
  label: string;
  hint: string;
  /**
   * The choice offered under the section: who it names (an agent or a team), or
   * how much copy it holds.
   */
  choice: "audience" | "length";
}[] = [
  {
    id: "opening",
    label: "Headings",
    hint: "The heading copy that sits over the homepage video or image. The photo in the previews is a stand-in for it.",
    choice: "audience",
  },
  {
    id: "profile",
    label: "Profiles",
    hint: "A photo with a name, details and a button. Each one brings its own full-width background.",
    choice: "audience",
  },
  {
    id: "text",
    label: "Text only",
    hint: "Layouts for copy a client sends over, with no images. Each one brings its own full-width background.",
    choice: "length",
  },
  {
    id: "media",
    label: "Text + image",
    hint: "Layouts for copy a client sends over with photos. Each one brings its own full-width background.",
    choice: "length",
  },
];
