// Building blocks for the section library: the palette's :root colors, and helpers
// that turn compact source into the tidy HTML and CSS that gets copied.

export type Snippet = {
  id: string;
  name: string;
  html: string;
  css: string;
  /** A heading that spans the whole screen, so it can't be moved left or right. */
  fullWidth?: boolean;
  /** Content sections only: made for a short block of copy, or for several paragraphs. */
  length?: Length;
  /** A button that can be added after the design's only one, with any rules it needs. */
  extraButton?: { html: string; css: string };
};

export type Length = "short" | "long";

// Every color comes from the Color Palette tool's :root variables, so a section
// follows whatever palette the site uses.
export const LIGHT = "var(--typography-light)";
export const DARK = "var(--typography-dark)";
export const ACCENT = "var(--accent-button)";
export const LIGHT_BG = "var(--primary-light-bg)";
export const DARK_BG = "var(--primary-dark-bg)";
export const CARD = "var(--accent-card)";
export const CARD_TEXT = "var(--typography-card)";
export const LINE_ON_DARK = "var(--border-light-inactive)";
export const LINE_ON_LIGHT = "var(--border-dark-inactive)";
/** Faint fills for tiles and chips: the dark color on light backgrounds, and the reverse. */
export const SOFT_ON_LIGHT = "var(--background-dark-inactive)";
export const SOFT_ON_DARK = "var(--background-light-inactive)";
/** The dark primary color at the given opacity, for overlays and shadows. */
export const shade = (alpha: number) => `rgba(from var(--primary-dark) r g b / ${alpha})`;
/** The light primary color at the given opacity, for frosted panels over a photo. */
export const tint = (alpha: number) => `rgba(from var(--primary-light) r g b / ${alpha})`;

export const BODY_FONT = "var(--global-secondary-font-family, sans-serif)";
export const HEADING_FONT = "var(--global-primary-font-family, serif)";

// ---------- Individual or team ----------

/** Who a section is written for: one agent, or a team. */
export type Audience = "agent" | "team";

const FILL: Record<Audience, Record<string, string>> = {
  agent: {
    NAME: "Agent Name",
    FIRST: "Agent",
    INITIALS: "AN",
    PRETITLE: "Meet Agent Name",
    ROLE: "Realtor®",
    BIO: "A short bio goes here. Share your experience, the areas you serve, and what clients can expect when they work with you.",
    PHOTO: "Agent+Photo",
    BTN: "Learn More",
    HREF: "/about",
    BTN2: "Contact Me",
    HREF2: "/contact",
  },
  team: {
    NAME: "Team Name",
    FIRST: "Team",
    INITIALS: "TN",
    PRETITLE: "Meet The Team",
    ROLE: "Real Estate Team",
    BIO: "A short team bio goes here. Share your combined experience, the areas you serve, and what clients can expect when they work with you.",
    PHOTO: "Team+Photo",
    BTN: "Meet The Team",
    HREF: "/team",
    BTN2: "Contact Us",
    HREF2: "/contact",
  },
};

/** Fills a section's %PLACEHOLDERS% for an individual agent or a team. */
export function fillFor(html: string, audience: Audience): string {
  return html.replace(/%([A-Z]+\d?)%/g, (token, key: string) => FILL[audience][key] ?? token);
}

function indent(block: string): string {
  return block
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
}

/** A <div> with each child on its own indented line. */
export function box(className: string, ...children: string[]): string {
  return `<div class="${className}">\n${indent(children.join("\n"))}\n</div>`;
}

/** Any other element with block children, e.g. `wrap("ul", "profile__info", ...)`. */
export function wrap(tag: string, className: string, ...children: string[]): string {
  return `<${tag} class="${className}">\n${indent(children.join("\n"))}\n</${tag}>`;
}

/**
 * Pretty-prints CSS written compactly (rules on one line, declarations separated
 * by semicolons): one declaration per line, two-space indent, a blank line
 * between rules, and each selector of a list on its own line.
 */
export function formatCss(source: string): string {
  const lines: string[] = [];
  let depth = 0;
  let buffer = "";
  const pad = () => "  ".repeat(depth);
  const take = () => {
    const text = buffer.trim().replace(/\s+/g, " ");
    buffer = "";
    return text;
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      lines.push(pad() + source.slice(i, end + 2).trim(), "");
      i = end + 1;
    } else if (ch === "{") {
      const selector = take();
      const parts = selector.startsWith("@") ? [selector] : selector.split(/,\s*/);
      parts.forEach((part, k) => lines.push(pad() + part + (k < parts.length - 1 ? "," : " {")));
      depth++;
    } else if (ch === "}") {
      const last = take();
      if (last) lines.push(`${pad()}${last};`);
      // No blank line between the last rule of a block and the block's closing brace.
      while (lines[lines.length - 1] === "") lines.pop();
      depth--;
      lines.push(`${pad()}}`, "");
    } else if (ch === ";") {
      const declaration = take();
      if (declaration) lines.push(`${pad()}${declaration};`);
    } else {
      buffer += ch;
    }
  }
  return `${lines.join("\n").trim()}\n`;
}
