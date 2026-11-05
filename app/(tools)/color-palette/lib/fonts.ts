// Google Fonts pairings (headline + paragraph) for the palette tool, grouped by feel.

export type Generic = "serif" | "sans-serif" | "cursive" | "display";
export type Face = { family: string; weight: number; generic: Generic };
export type FontPair = { heading: Face; body: Face };

export const FONT_CATEGORIES = ["classic", "modern", "delicate", "bold", "friendly"] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export const FONT_CATEGORY_LABELS: Record<FontCategory, { label: string; hint: string }> = {
  classic: { label: "Classic", hint: "Traditional serifs, editorial and trustworthy." },
  modern: { label: "Modern", hint: "Clean, neutral and contemporary." },
  delicate: { label: "Delicate", hint: "Light, elegant and refined." },
  bold: { label: "Bold", hint: "Heavy, high-impact headlines." },
  friendly: { label: "Friendly", hint: "Rounded and approachable." },
};

const serif = (family: string, weight: number): Face => ({ family, weight, generic: "serif" });
const sans = (family: string, weight: number): Face => ({ family, weight, generic: "sans-serif" });
const display = (family: string, weight: number): Face => ({ family, weight, generic: "display" });
const pair = (heading: Face, body: Face): FontPair => ({ heading, body });

export const FONT_PAIRS: Record<FontCategory, FontPair[]> = {
  classic: [
    pair(serif("Playfair Display", 700), serif("Source Serif 4", 400)),
    pair(serif("Merriweather", 700), sans("Open Sans", 400)),
    pair(serif("Libre Baskerville", 700), sans("Lato", 400)),
    pair(serif("EB Garamond", 600), sans("Inter", 400)),
    pair(serif("Crimson Pro", 600), sans("Work Sans", 400)),
  ],
  modern: [
    pair(sans("Inter", 700), sans("Inter", 400)),
    pair(sans("Space Grotesk", 700), sans("DM Sans", 400)),
    pair(sans("Manrope", 800), sans("Inter", 400)),
    pair(sans("Sora", 700), sans("Nunito Sans", 400)),
    pair(serif("DM Serif Display", 400), sans("DM Sans", 400)),
  ],
  delicate: [
    pair(serif("Cormorant Garamond", 500), sans("Jost", 300)),
    pair(sans("Josefin Sans", 300), sans("Lato", 300)),
    pair(display("Italiana", 400), sans("Raleway", 400)),
    pair(serif("Marcellus", 400), sans("Lato", 400)),
    pair(sans("Tenor Sans", 400), sans("Karla", 400)),
  ],
  bold: [
    pair(display("Anton", 400), sans("Roboto", 400)),
    pair(display("Bebas Neue", 400), sans("Open Sans", 400)),
    pair(display("Archivo Black", 400), sans("Archivo", 400)),
    pair(sans("Montserrat", 800), serif("Merriweather", 400)),
    pair(sans("Oswald", 700), sans("Source Sans 3", 400)),
  ],
  friendly: [
    pair(sans("Nunito", 800), sans("Nunito Sans", 400)),
    pair(sans("Quicksand", 700), sans("Open Sans", 400)),
    pair(display("Fredoka", 600), sans("Nunito", 400)),
    pair(sans("Poppins", 600), sans("Mulish", 400)),
    pair(display("Baloo 2", 700), sans("Poppins", 400)),
  ],
};

export type FontChoice = { category: FontCategory; index: number };
export const DEFAULT_FONT: FontChoice = { category: "modern", index: 0 };

/** The pairing for a saved choice, falling back to the default if the list has changed. */
export const pairFor = (c: FontChoice): FontPair =>
  FONT_PAIRS[c.category]?.[c.index] ?? FONT_PAIRS[DEFAULT_FONT.category][DEFAULT_FONT.index];

export const cssFamily = (f: Face) => `"${f.family}", ${f.generic === "display" ? "sans-serif" : f.generic}`;

/** One Google Fonts stylesheet URL covering every face in the given pairs. */
export function googleFontsUrl(pairs: FontPair[]): string {
  const weights = new Map<string, Set<number>>();
  for (const f of pairs.flatMap((p) => [p.heading, p.body])) {
    weights.set(f.family, (weights.get(f.family) ?? new Set()).add(f.weight));
  }
  const families = [...weights].map(
    ([family, w]) => `family=${family.replace(/ /g, "+")}:wght@${[...w].sort((a, b) => a - b).join(";")}`,
  );
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}
