// Color math, automatic role assignment, and CSS export for the palette tool.

export const TRANSPARENT = "transparent";

export type ButtonColors = { border: string; fill: string; text: string };
export type ThemeId = "dark" | "light" | "block";
/** Colors for the property listing card shown in every container. */
export type PropertyColors = { cardBg: string; cardText: string; tagBg: string; tagText: string };
export const PROPERTY_DEFAULTS: PropertyColors = { cardBg: "#222222", cardText: "#ffffff", tagBg: "#9ca3af", tagText: "#111111" };

export type Theme = {
  id: ThemeId;
  label: string;
  bg: string;
  headline: string;
  text: string;
  button: { normal: ButtonColors; hover: ButtonColors };
  property?: PropertyColors;
};

export const THEME_LABELS: Record<ThemeId, string> = { dark: "Dark", light: "Light", block: "Color block" };

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as RGB;
}

export const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1-21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Colorfulness: max - min channel (0-255). */
const chroma = (hex: string) => {
  const c = hexToRgb(hex);
  return Math.max(...c) - Math.min(...c);
};

export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** The option that reads best on `bg` (highest contrast). */
export function bestOn(bg: string, options: string[]): string {
  return options.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best), options[0] ?? bg);
}

/** Effective color behind button text: the fill, or the container background when the fill is transparent. */
export const solid = (color: string, behind: string) => (color === TRANSPARENT ? behind : color);

/**
 * Which colors the layouts may use:
 * - "strict": only the client's palette (plus transparent for outline buttons)
 * - "neutrals": the palette plus white and black
 * - "tints": the palette, white and black, and lighter/darker versions of each palette color
 */
export type PoolMode = "strict" | "neutrals" | "tints";

export const POOL_MODES: { id: PoolMode; label: string; hint: string }[] = [
  { id: "strict", label: "Only these colors", hint: "Exactly the client’s palette." },
  { id: "neutrals", label: "+ White & black", hint: "Adds pure white and black for backgrounds and text." },
  { id: "tints", label: "+ Tints & shades", hint: "Also lighter/darker versions of each color, for soft backgrounds and hovers." },
];

const NEUTRALS = ["#ffffff", "#000000"];
const near = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 12;
};

export type PoolGroup = { label: string; colors: string[] };

/** The colors available for assignment, grouped for the color picker. */
export function colorPool(palette: string[], mode: PoolMode): PoolGroup[] {
  const groups: PoolGroup[] = [{ label: "Palette", colors: palette }];
  if (mode === "strict") return groups;
  const neutrals = NEUTRALS.filter((n) => !palette.some((p) => near(p, n)));
  if (neutrals.length) groups.push({ label: "White & black", colors: neutrals });
  if (mode === "tints") {
    const variants = palette.flatMap((c) => [mix(c, "#ffffff", 0.88), mix(c, "#ffffff", 0.55), mix(c, "#000000", 0.35), mix(c, "#000000", 0.75)]);
    const unique = variants.filter((v, i) => !variants.slice(0, i).some((w) => near(v, w)) && ![...palette, ...NEUTRALS].some((p) => near(p, v)));
    if (unique.length) groups.push({ label: "Tints & shades", colors: unique });
  }
  return groups;
}

/** Things worth telling the user about a palette under the chosen mode. */
export function paletteNotes(palette: string[], mode: PoolMode): string[] {
  if (!palette.length) return [];
  const pool = colorPool(palette, mode).flatMap((g) => g.colors);
  const notes: string[] = [];
  if (mode === "strict" && palette.length === 1) {
    notes.push("With one color and nothing else, text and background are the same color. Allow white & black (or tints) for readable layouts.");
  } else {
    if (Math.min(...pool.map(luminance)) > 0.2) notes.push("No dark color is available, so the Dark layout uses the darkest one there is.");
    if (Math.max(...pool.map(luminance)) < 0.6) notes.push("No light color is available, so the Light layout uses the lightest one there is.");
    const best = Math.max(...pool.flatMap((a) => pool.map((b) => contrast(a, b))));
    if (best < 4.5) {
      notes.push(`The highest contrast these colors allow is ${best.toFixed(1)}:1, below the 4.5:1 recommended for body text. Allowing white & black would help.`);
    }
  }
  return notes;
}

/**
 * Builds dark / light / color-block themes using only colors from the pool (plus transparent,
 * and, in "tints" mode, softened body text). Buttons are solid, turning into an outline on hover.
 * Works for any palette size, including 1 or 2 colors.
 */
export function autoThemes(palette: string[], mode: PoolMode = "neutrals", variant = 0): Theme[] {
  const brand = palette.length ? palette : ["#2563eb"];
  const pool = [...new Set(colorPool(brand, mode).flatMap((g) => g.colors))];
  const byLum = [...pool].sort((a, b) => luminance(a) - luminance(b));
  // Backgrounds: prefer the client's own colors, then tints/shades of them, and only then pure black/white.
  const ownByLum = [...brand].sort((a, b) => luminance(a) - luminance(b));
  const derived = byLum.filter((c) => !NEUTRALS.includes(c) && !brand.includes(c));
  // Each candidate list starts with the default pick; `variant` rotates through the alternatives.
  const pick = <T,>(list: T[]) => list[variant % list.length];
  const unique = (list: string[]) => [...new Set(list)];
  const darkest = pick(unique([
    ownByLum.find((c) => luminance(c) < 0.06) ?? derived.find((c) => luminance(c) < 0.06) ?? byLum[0],
    ...ownByLum.filter((c) => luminance(c) < 0.2), ...derived.filter((c) => luminance(c) < 0.2), byLum[0],
  ]));
  const lightest = pick(unique([
    [...ownByLum].reverse().find((c) => luminance(c) > 0.8) ?? [...derived].reverse().find((c) => luminance(c) > 0.8) ?? byLum[byLum.length - 1],
    ...[...ownByLum].reverse().filter((c) => luminance(c) > 0.6), ...[...derived].reverse().filter((c) => luminance(c) > 0.6), byLum[byLum.length - 1],
  ]));
  // The accent: the most colorful palette color, preferring ones that aren't just near-black/white.
  const accent = pick(
    [...brand].sort((a, b) => chroma(b) - chroma(a) || Math.abs(luminance(a) - 0.4) - Math.abs(luminance(b) - 0.4)),
  );

  const others = (x: string) => pool.filter((c) => c !== x);
  const textOn = (bg: string) => bestOn(bg, others(bg).length ? others(bg) : [bg]);
  /** Softer body text in tints mode (only while it stays readable); otherwise the most readable color. */
  const bodyOn = (bg: string) => {
    const strong = textOn(bg);
    const soft = mix(strong, bg, 0.18);
    return mode === "tints" && contrast(soft, bg) >= 4.5 ? soft : strong;
  };

  function buttonFor(bg: string): Theme["button"] {
    // Fill: the most colorful palette color that stands out from the background; else the text color.
    const fill =
      (contrast(accent, bg) >= 1.5 ? accent : undefined) ??
      [...brand].filter((c) => c !== bg && contrast(c, bg) >= 1.5).sort((a, b) => chroma(b) - chroma(a))[0] ?? textOn(bg);
    const white = pool.find((c) => c === "#ffffff") ?? textOn(fill);

    // House style, by the button's own color. Dark button: border and fill in the color, white text; hover clears
    // the fill and the text takes the color. Light button: the reverse, with dark text on the fill.
    if (fill === accent) {
      const isDark = luminance(accent) < 0.4;
      const label = isDark ? white : (pool.find((c) => c === "#000000") ?? textOn(accent));
      const hoverText = contrast(accent, bg) >= 3 ? accent : textOn(bg);
      return {
        normal: { border: accent, fill: accent, text: label },
        hover: { border: accent, fill: TRANSPARENT, text: hoverText },
      };
    }

    // Fallback (e.g. the accent is the background): solid button turning into an outline on hover.
    const normal: ButtonColors = { border: fill, fill, text: textOn(fill) };
    const hover: ButtonColors = { border: fill, fill: TRANSPARENT, text: contrast(fill, bg) >= 3 ? fill : textOn(bg) };
    return { normal, hover };
  }

  /** Labels on a solid color: white or black when allowed (like the button label), else the most readable color. */
  const labelOn = (bg: string) => {
    const bw = pool.filter((c) => NEUTRALS.includes(c));
    return bw.length ? bestOn(bg, bw) : textOn(bg);
  };

  /**
   * Property card: a card that stands apart from the container (a light card on dark, a dark card on light,
   * whichever reads more on a color block), its most readable text, and an accent-colored tag on the photo.
   */
  function propertyFor(bg: string): PropertyColors {
    // Colors that stand apart from the container, darkest first.
    const candidates = byLum.filter((c) => c !== bg && contrast(c, bg) >= 1.5);
    const ends = [darkest, lightest].filter((c) => candidates.includes(c));
    const cardBg = !candidates.length
      ? textOn(bg)
      : luminance(bg) < 0.2
        ? (candidates.includes(lightest) ? lightest : candidates[candidates.length - 1])
        : luminance(bg) > 0.6
          ? (candidates.includes(darkest) ? darkest : candidates[0])
          : bestOn(bg, ends.length ? ends : candidates);
    const card = cardBg;
    const tagBg =
      [accent, ...[...brand].sort((a, b) => chroma(b) - chroma(a))].find((c) => c !== card && contrast(c, card) >= 1.5) ??
      textOn(card);
    return { cardBg: card, cardText: textOn(card), tagBg, tagText: labelOn(tagBg) };
  }

  const theme = (id: ThemeId, bg: string): Theme => ({
    id, label: THEME_LABELS[id], bg, headline: textOn(bg), text: bodyOn(bg), button: buttonFor(bg), property: propertyFor(bg),
  });

  // Color block: the accent, unless it's the same as the dark/light background (e.g. a black & white palette).
  const blockBg = pick([accent, ...brand].filter((c) => c !== darkest && c !== lightest).concat(accent));
  return [theme("dark", darkest), theme("light", lightest), theme("block", blockBg)];
}

export function themesToCss(themes: Theme[]): string {
  return themes
    .map((t) => {
      const n = t.button.normal, h = t.button.hover;
      return [
        `.theme-${t.id} {`,
        `  --bg: ${t.bg};`,
        `  --headline: ${t.headline};`,
        `  --text: ${t.text};`,
        `  --button-border: ${n.border};`,
        `  --button-fill: ${n.fill};`,
        `  --button-text: ${n.text};`,
        `  --button-border-hover: ${h.border};`,
        `  --button-fill-hover: ${h.fill};`,
        `  --button-text-hover: ${h.text};`,
        ...(t.property
          ? [
              `  --property-card-bg: ${t.property.cardBg};`,
              `  --property-card-text: ${t.property.cardText};`,
              `  --property-tag-bg: ${t.property.tagBg};`,
              `  --property-tag-text: ${t.property.tagText};`,
            ]
          : []),
        `}`,
      ].join("\n");
    })
    .join("\n\n");
}

/** WCAG rating for normal-size text. */
export function rating(ratio: number): { label: string; ok: boolean } {
  if (ratio >= 7) return { label: "AAA", ok: true };
  if (ratio >= 4.5) return { label: "AA", ok: true };
  if (ratio >= 3) return { label: "AA large", ok: true };
  return { label: "Low", ok: false };
}
