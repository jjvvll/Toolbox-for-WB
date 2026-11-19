// Each site template's own button design: its padding, border width, corners, line
// height, letter spacing and so on, taken from the template's stylesheet. It's a
// design's default, so buttons match the rest of the site; "As designed" keeps the
// design's own.
//
// Colors are left out (the design's colors and the color choices still apply), and so
// are the text size and weight, which are the separate "Button text" choice.

import { buttonCount } from "./buttons";
import type { SectionKind } from "./preview";
import { formatCss, type Snippet } from "./shared";
import type { SiteTemplate } from "./template";

const DESIGNS: Record<SiteTemplate, string> = {
  // From `.redesign .btn` (its `border: 2px solid` without the color), with the square
  // corners of the theme's base `.lp-btn`, which `.btn` doesn't set.
  producer: `border-width: 2px; border-style: solid; border-radius: 0; font-family: var(--global-secondary-font-family);
    letter-spacing: 1.5px; line-height: 1; max-width: 100%; overflow: hidden; padding: 20px 46px;
    text-align: center; text-decoration: none; text-overflow: ellipsis; text-transform: uppercase;
    transition: all .2s; white-space: nowrap`,
  // From `.lp-btn` (its `border: 2px solid transparent` without the color).
  masterpiece: `background-image: none; border-width: 2px; border-style: solid; border-radius: 0;
    font-family: var(--global-secondary-font-family-short, sans-serif); line-height: 1.3; max-width: 100%;
    overflow: hidden; padding: 14px 22px; text-align: center; text-decoration: none; text-overflow: ellipsis;
    text-transform: uppercase; touch-action: manipulation; transition: all .3s; user-select: none;
    vertical-align: middle; white-space: nowrap; -webkit-font-smoothing: unset`,
  // From `.lp-btn` (its background, text and border colors left out).
  visionary: `background-image: none; border-width: 1px; border-style: solid; border-radius: 500px;
    line-height: 1.33; max-width: 100%; outline: none; padding: 20px 32px; text-decoration: none;
    text-overflow: ellipsis; text-transform: uppercase; touch-action: manipulation;
    transition: all .3s ease-out; user-select: none`,
};

/** The element around a kind of section's buttons. */
const HOLDER: Record<SectionKind, string> = {
  opening: ".buttons",
  profile: ".profile__actions",
  text: ".content-block__actions",
  media: ".content-block__actions",
};

/**
 * The design with the template's button design added at the end of its CSS, for the
 * buttons it shows. Every declaration is !important so it wins over the design's own
 * button rules, whatever their selectors.
 */
export function withTemplateButtons(snippet: Snippet, kind: SectionKind, template: SiteTemplate): Snippet {
  if (buttonCount(snippet, kind) === 0) return snippet;
  const body = DESIGNS[template]
    .split(";")
    .map((d) => d.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((d) => `${d} !important`)
    .join("; ");
  const label = template[0].toUpperCase() + template.slice(1);
  const rule = formatCss(`/* Button design: ${label} */ ${HOLDER[kind]} a.lp-btn { ${body} }`);
  return { ...snippet, css: `${snippet.css}\n${rule}` };
}
