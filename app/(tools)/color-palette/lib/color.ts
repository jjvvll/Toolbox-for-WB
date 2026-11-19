// Color math, the template :root variables, automatic assignment, and CSS export for the palette tool.

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

/** A hex color at the given opacity, for the live preview. */
export const withAlpha = (hex: string, alpha: number) => `rgba(${hexToRgb(hex).join(", ")}, ${alpha})`;

/**
 * Which colors the variables may use:
 * - "strict": only the client's palette
 * - "neutrals": the palette plus white and black
 * - "tints": the palette, white and black, and lighter/darker versions of each palette color
 */
export type PoolMode = "strict" | "neutrals" | "tints";

export const POOL_MODES: { id: PoolMode; label: string; hint: string }[] = [
  { id: "strict", label: "Only these colors", hint: "Exactly the client’s palette." },
  { id: "neutrals", label: "+ White & black", hint: "Adds pure white and black for backgrounds and text." },
  { id: "tints", label: "+ Tints & shades", hint: "Also lighter/darker versions of each color, for soft backgrounds." },
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
    if (Math.min(...pool.map(luminance)) > 0.2) notes.push("No dark color is available, so the Dark theme uses the darkest one there is.");
    if (Math.max(...pool.map(luminance)) < 0.6) notes.push("No light color is available, so the Light theme uses the lightest one there is.");
    const best = Math.max(...pool.flatMap((a) => pool.map((b) => contrast(a, b))));
    if (best < 4.5) {
      notes.push(`The highest contrast these colors allow is ${best.toFixed(1)}:1, below the 4.5:1 recommended for body text. Allowing white & black would help.`);
    }
  }
  return notes;
}

export type TemplateId = "visionary" | "masterpiece";
export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "visionary", label: "Visionary" },
  { id: "masterpiece", label: "Producer / Masterpiece" },
];

export type TextCase = "uppercase" | "capitalize" | "lowercase" | "none";
export const TEXT_CASES: TextCase[] = ["uppercase", "capitalize", "lowercase", "none"];

export type RootVarName =
  | "--primary-light-bg" | "--primary-dark-bg" | "--primary-dark" | "--primary-light"
  | "--accent-dark" | "--accent-light"
  | "--background-dark-inactive" | "--background-light-inactive"
  | "--border-dark-inactive" | "--border-dark-active" | "--border-light-inactive" | "--border-light-active"
  | "--typography-dark" | "--typography-light"
  | "--accent-button" | "--accent-tag" | "--typography-tag"
  | "--accent-ammenities" | "--typography-ammenities"
  | "--accent-card" | "--typography-card";

export type RootVar = {
  name: RootVarName;
  group: string;
  /** Follows this variable until it's set by hand. Variables without a link are core colors. */
  link?: RootVarName;
  /** Replaces `link` for one template. */
  linkIn?: Partial<Record<TemplateId, RootVarName>>;
  /** Exported as `rgba(from <color> r g b / <alpha>)`. */
  alpha?: number;
  /** Core colors only: the value before anything is assigned. */
  fallback?: string;
  /** Not part of every template. */
  only?: TemplateId;
};

/** In export order. The names, including "ammenities", match the templates' own CSS. */
export const ROOT_VARS: RootVar[] = [
  { name: "--primary-light-bg", group: "Main backgrounds", fallback: "#f6f1e7" },
  { name: "--primary-dark-bg", group: "Main backgrounds", link: "--primary-dark" },
  { name: "--primary-dark", group: "Primary", fallback: "#24384f" },
  { name: "--primary-light", group: "Primary", fallback: "#ffffff" },
  { name: "--accent-dark", group: "Accent", link: "--primary-dark" },
  { name: "--accent-light", group: "Accent", link: "--primary-light" },
  { name: "--background-dark-inactive", group: "Inactive & active states", link: "--primary-dark", alpha: 0.1 },
  { name: "--background-light-inactive", group: "Inactive & active states", link: "--primary-light", alpha: 0.1 },
  { name: "--border-dark-inactive", group: "Inactive & active states", link: "--primary-dark", alpha: 0.3 },
  { name: "--border-dark-active", group: "Inactive & active states", link: "--primary-dark" },
  { name: "--border-light-inactive", group: "Inactive & active states", link: "--primary-light", alpha: 0.3 },
  { name: "--border-light-active", group: "Inactive & active states", link: "--primary-light" },
  { name: "--typography-dark", group: "Typography", link: "--primary-dark" },
  { name: "--typography-light", group: "Typography", link: "--primary-light" },
  { name: "--accent-button", group: "Accent", fallback: "#4f7a9c" },
  { name: "--accent-tag", group: "Tag", fallback: "#c9b28a" },
  { name: "--typography-tag", group: "Tag", fallback: "#ffffff" },
  { name: "--accent-ammenities", group: "Amenities", link: "--accent-button", only: "visionary" },
  { name: "--typography-ammenities", group: "Amenities", link: "--typography-light", only: "visionary" },
  // Visionary's card uses the button color, so its text follows the amenities text, which sits on the same color.
  { name: "--accent-card", group: "Card", link: "--primary-dark", linkIn: { visionary: "--accent-button" } },
  { name: "--typography-card", group: "Card", link: "--primary-light", linkIn: { visionary: "--typography-ammenities" } },
];

/** Colors set by hand or by auto-assign. Any variable missing here follows its link or fallback. */
export type RootValues = Partial<Record<RootVarName, string>>;

/** The starting point before a palette is added: the Visionary sample. */
export const ROOT_DEFAULTS: RootValues = { "--typography-dark": "#16212e" };

const varsByName = new Map(ROOT_VARS.map((v) => [v.name, v]));

export const varsFor = (template: TemplateId) => ROOT_VARS.filter((v) => !v.only || v.only === template);

/** The variable this one follows in the given template, if any. */
export const linkOf = (v: RootVar, template: TemplateId) => v.linkIn?.[template] ?? v.link;

/** The variable's color, without any opacity it's exported with. */
export function rootHex(values: RootValues, name: RootVarName, template: TemplateId): string {
  const set = values[name];
  if (set) return set;
  const def = varsByName.get(name)!;
  const link = linkOf(def, template);
  return link ? rootHex(values, link, template) : def.fallback!;
}

const cssValue = (values: RootValues, v: RootVar, template: TemplateId) => {
  const hex = rootHex(values, v.name, template);
  return v.alpha === undefined ? hex : `rgba(from ${hex} r g b / ${v.alpha})`;
};

/** The template's variables as name/value pairs, including --text-case. */
export function rootEntries(template: TemplateId, values: RootValues, textCase: TextCase): [string, string][] {
  return [...varsFor(template).map((v): [string, string] => [v.name, cssValue(values, v, template)]), ["--text-case", textCase]];
}

export function rootToCss(template: TemplateId, values: RootValues, textCase: TextCase): string {
  const label = TEMPLATES.find((t) => t.id === template)!.label;
  const lines = rootEntries(template, values, textCase).map(([name, value]) => `  ${name}: ${value};`);
  return [`/*${label}*/`, ":root {", ...lines, "}"].join("\n");
}

/**
 * Fills the core colors from the palette; everything else follows through its link. Works for any palette
 * size, including 1 or 2 colors. `variant` rotates through the alternatives for each choice.
 */
export function autoRoot(palette: string[], mode: PoolMode = "neutrals", variant = 0): RootValues {
  const brand = palette.length ? palette : ["#2563eb"];
  const pool = [...new Set(colorPool(brand, mode).flatMap((g) => g.colors))];
  const byLum = pool.toSorted((a, b) => luminance(a) - luminance(b));
  // Backgrounds: prefer the client's own colors, then tints/shades of them, and only then pure black/white.
  const ownByLum = brand.toSorted((a, b) => luminance(a) - luminance(b));
  const derived = byLum.filter((c) => !NEUTRALS.includes(c) && !brand.includes(c));
  const pick = <T,>(list: T[]) => list[variant % list.length];
  const unique = (list: string[]) => [...new Set(list)];
  const darkest = pick(unique([
    ownByLum.find((c) => luminance(c) < 0.06) ?? derived.find((c) => luminance(c) < 0.06) ?? byLum[0],
    ...ownByLum.filter((c) => luminance(c) < 0.2), ...derived.filter((c) => luminance(c) < 0.2), byLum[0],
  ]));
  const lightest = pick(unique([
    ownByLum.findLast((c) => luminance(c) > 0.8) ?? derived.findLast((c) => luminance(c) > 0.8) ?? byLum[byLum.length - 1],
    ...ownByLum.toReversed().filter((c) => luminance(c) > 0.6), ...derived.toReversed().filter((c) => luminance(c) > 0.6), byLum[byLum.length - 1],
  ]));
  const light = pool.includes("#ffffff") ? "#ffffff" : lightest;

  // Button: the most colorful palette color that shows up on the light background.
  const byChroma = brand.toSorted((a, b) => chroma(b) - chroma(a) || Math.abs(luminance(a) - 0.4) - Math.abs(luminance(b) - 0.4));
  const onLight = byChroma.filter((c) => contrast(c, lightest) >= 1.5);
  const accent = pick(onLight.length ? onLight : byChroma);
  // Tag: the next most colorful color that isn't a background and shows up on the card; otherwise it matches the button.
  const tag = byChroma.find((c) => c !== accent && c !== darkest && c !== lightest && contrast(c, darkest) >= 1.5) ?? accent;

  const values: RootValues = {
    "--primary-light-bg": lightest,
    "--primary-dark": darkest,
    "--primary-light": light,
    "--accent-button": accent,
    "--accent-tag": tag,
    "--typography-tag": bestOn(tag, [darkest, light]),
  };
  // Amenities use the button color and white text by default; a light button needs dark text instead.
  if (bestOn(accent, [darkest, light]) !== light) values["--typography-ammenities"] = darkest;
  return values;
}

/** WCAG rating for normal-size text. */
export function rating(ratio: number): { label: string; ok: boolean } {
  if (ratio >= 7) return { label: "AAA", ok: true };
  if (ratio >= 4.5) return { label: "AA", ok: true };
  if (ratio >= 3) return { label: "AA large", ok: true };
  return { label: "Low", ok: false };
}
