// Button styles: colors picked from the palette's :root variables, and the text's
// size and weight from a site template. Each button in a design can have its border,
// background and text colors set, at rest and on hover; the text size and weight
// apply to every button.
//
// A choice rewrites the declaration in the design's CSS that sets that value, so the
// copied CSS reads as if the design were built with it. Only when that can't be done
// alone (the value comes from the theme, or one declaration styles several cells that
// now need different values) is a rule added at the end of the CSS instead.
//
// Each setting changes only its own cell: a hover color left as designed keeps the
// design's hover color, even when the normal color under it changes.

import { buttonCount, parse, serialize } from "./buttons";
import { THEME_BUTTON_CSS, type SectionKind } from "./preview";
import { formatCss, type Snippet } from "./shared";

export const COLOR_PARTS = [
  { id: "border", label: "Border", property: "border-color" },
  { id: "background", label: "Background", property: "background-color" },
  { id: "text", label: "Text", property: "color" },
] as const;
export type ColorPart = (typeof COLOR_PARTS)[number]["id"];

const FONT_PARTS = [
  { id: "size", property: "font-size" },
  { id: "weight", property: "font-weight" },
] as const;
type FontPart = (typeof FONT_PARTS)[number]["id"];

/** Everything about a button that can be changed. */
type Part = ColorPart | FontPart;
const PARTS = [...COLOR_PARTS, ...FONT_PARTS];
const PROPERTY = Object.fromEntries(PARTS.map((p) => [p.id, p.property])) as Record<Part, string>;

/** The button text of each site template. */
export const FONT_PRESETS = [
  { id: "producer", label: "Producer", size: "14px", weight: "700" },
  { id: "masterpiece", label: "Masterpiece", size: "14px", weight: "600" },
  { id: "visionary", label: "Visionary", size: "12px", weight: "600" },
] as const;
export type FontPreset = (typeof FONT_PRESETS)[number]["id"];

export const FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;

/**
 * The button text picked: a template's, or values typed in. A custom size or weight
 * left blank (or not valid) keeps the design's own.
 */
export type ButtonText =
  | { preset: FontPreset }
  | { preset: "custom"; size: string; weight: string };

/**
 * A typed font size as CSS: a bare number is taken as px; px, rem and em are kept.
 * Undefined when it isn't a size, so nothing typed can break out of the declaration.
 */
export function cleanSize(raw: string): string | undefined {
  const match = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem|em)?$/);
  if (!match || Number(match[1]) <= 0) return undefined;
  return `${match[1]}${match[2] ?? "px"}`;
}

/** The size and weight a choice gives the buttons. A part left out keeps the design's. */
export function textValues(text: ButtonText | null): { size?: string; weight?: string } {
  if (!text) return {};
  if (text.preset !== "custom") return FONT_PRESETS.find((p) => p.id === text.preset)!;
  const weight = (FONT_WEIGHTS as readonly string[]).includes(text.weight) ? text.weight : undefined;
  return { size: cleanSize(text.size), weight };
}

export const COLOR_STATES = [
  { id: "normal", label: "Normal" },
  { id: "hover", label: "Hover" },
] as const;
export type ColorState = (typeof COLOR_STATES)[number]["id"];

/** "transparent", or a :root variable's name such as "--accent-button". */
export type ColorChoice = string;
export const TRANSPARENT = "transparent";

/** One button's choices. A part left out keeps the design's own color. */
export type ButtonColors = Partial<Record<ColorState, Partial<Record<ColorPart, ColorChoice>>>>;

/** The choices for the first button and the second. */
export type ButtonColorSet = ButtonColors[];

/** The CSS value a design gives each part of a button, by state. Undefined when nothing sets it. */
export type DesignedStyles = Record<ColorState, Partial<Record<Part, string>>>;

/** The :root variables a button can use: every color, leaving out fonts, sizes and the text case. */
export function colorVariables(vars: Record<string, string>): string[] {
  return Object.keys(vars).filter((name) => name.startsWith("--") && !/^--(global-|text-case)/.test(name));
}

/** The CSS value for a choice: transparent as is, a variable through var(). */
export const colorValue = (choice: ColorChoice) => (choice === TRANSPARENT ? TRANSPARENT : `var(${choice})`);

/**
 * A short name for a CSS color value: the :root variable it uses, with its opacity
 * when it's a see-through version, or the value itself.
 */
export function describeColor(value: string): string {
  const plain = value.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/);
  if (plain) return plain[1];
  const faded = value.match(/^rgba\(from var\((--[\w-]+)\) r g b \/ ([\d.]+)\)$/);
  if (faded) return `${faded[1]} at ${Math.round(Number(faded[2]) * 100)}%`;
  return value;
}

/** The value with each var() replaced by the variable's value, for a swatch outside the page. */
export function resolveColor(value: string, vars: Record<string, string>): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (all, name: string, fallback?: string) =>
    vars[name] ?? fallback ?? all,
  );
}

const HOLDERS: Record<SectionKind, { selector: string; wrapper: string }> = {
  opening: { selector: ".buttons", wrapper: "buttons" },
  profile: { selector: ".profile__actions", wrapper: "profile__actions" },
  text: { selector: ".content-block__actions", wrapper: "content-block__actions" },
  media: { selector: ".content-block__actions", wrapper: "content-block__actions" },
};

export const hasColors = (set: ButtonColorSet) =>
  set.some((colors) => Object.values(colors ?? {}).some((parts) => Object.keys(parts ?? {}).length > 0));

// ---------- What the design already uses ----------

/** A button as the CSS sees it: its classes, and the classes of the elements around it. */
type ButtonContext = {
  classes: string[];
  /** Classes of each element the button sits inside, innermost first. */
  ancestors: string[][];
  /** Every class used anywhere in the design. */
  known: Set<string>;
};

const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link", "source", "wbr"]);

/** Each button in the design's first button holder, in order. */
function buttonContexts(snippet: Snippet, kind: SectionKind): ButtonContext[] {
  const html = snippet.html;
  const start = html.indexOf(`class="${HOLDERS[kind].wrapper}"`);
  if (start < 0) return [];
  const known = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const buttons: ButtonContext[] = [];
  // The open elements as the HTML is read, each with its classes.
  const open: { tag: string; classes: string[] }[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)) {
    const [, closing, name, attributes] = match;
    const tag = name.toLowerCase();
    if (closing) {
      const at = open.map((e) => e.tag).lastIndexOf(tag);
      if (at >= 0) open.length = at;
      // The holder has closed: its buttons are all read.
      if (buttons.length && !open.some((e) => e.classes.includes(HOLDERS[kind].wrapper))) break;
      continue;
    }
    const classes = attributes.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    if (tag === "a" && open.some((e) => e.classes.includes(HOLDERS[kind].wrapper))) {
      buttons.push({ classes, ancestors: open.map((e) => e.classes).reverse(), known });
    }
    if (!VOID_TAGS.has(tag) && !attributes.trimEnd().endsWith("/")) open.push({ tag, classes });
  }
  return buttons;
}

/**
 * Whether a selector targets this button, and in which state. Selectors that reach
 * inside the button or match something else are null. A part of the selector for an
 * element around the button counts when its classes are on one of the button's
 * ancestors, or aren't in the design at all (the page the design is pasted into).
 */
function targets(selector: string, button: ButtonContext): ColorState | null {
  const parts = selector.trim().split(/\s*[\s>+~]\s*/);
  const last = parts.pop()!;
  if (last.includes("::") || /:(?!hover\b)[\w-]/.test(last)) return null;
  const tag = last.match(/^[a-z][\w-]*/)?.[0];
  if (tag && tag !== "a") return null;
  const own = last.match(/\.[\w-]+/g)?.map((c) => c.slice(1)) ?? [];
  if (!own.every((c) => button.classes.includes(c))) return null;
  if (!tag && !own.length) return null;
  for (const part of parts) {
    const needed = part.match(/\.[\w-]+/g)?.map((c) => c.slice(1)) ?? [];
    const onAncestor = button.ancestors.some((classes) => needed.every((c) => classes.includes(c)));
    if (!onAncestor && needed.some((c) => button.known.has(c))) return null;
  }
  return /:hover\b/.test(selector) ? "hover" : "normal";
}

/** Specificity as one comparable number: ids, then classes and pseudo-classes, then tags. */
function specificity(selector: string): number {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+|:(?!:)[\w-]+|\[[^\]]*\]/g)?.length ?? 0;
  const tags = selector.replace(/[.#:][\w-]+|\[[^\]]*\]/g, " ").match(/[a-z][\w-]*/gi)?.length ?? 0;
  return ids * 10000 + classes * 100 + tags;
}

/** Cascade order: !important, then specificity, then the later rule. Ties go to the later one. */
function outranks(rank: number[], other: number[]): boolean {
  const i = rank.findIndex((n, k) => n !== other[k]);
  return i < 0 || rank[i] > other[i];
}

/** A color in a declaration's value: a function such as var() or rgba(), a hex, or a keyword. */
const COLOR_TOKEN = /(?:var|rgba?|hsla?)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[\da-f]{3,8}\b|\btransparent\b|\bcurrentColor\b/i;

/** The value a declaration gives a part, or undefined when it doesn't touch that part. */
function partValue(property: string, value: string, part: Part): string | undefined {
  if (part === "size") return property === "font-size" ? value : undefined;
  if (part === "weight") return property === "font-weight" ? value : undefined;
  if (part === "text") return property === "color" ? value : undefined;
  if (part === "background") return property === "background-color" || property === "background" ? value : undefined;
  if (property === "border-color") return value;
  if (property !== "border") return undefined;
  // The shorthand sets the color too: the one it names, or the text color when it names none.
  return value.match(COLOR_TOKEN)?.[0] ?? "currentColor";
}

/** Where a color is set: a declaration in one of the design's top-level rules. */
type Source = { item: number; declaration: number };

/** The value a cell shows, and the design's declaration that sets it (none when it's the theme's). */
type Winner = { value: string; rank: number[]; source?: Source };

type Cell = { button: number; state: ColorState; part: Part };

/** The theme's base button text, from its .lp-btn rule, ahead of its button colors. */
const THEME_BUTTON_RULES = `.lp-btn{font-size:14px;font-weight:700}\n${THEME_BUTTON_CSS}`;

/** A rule in cascade order. `source` is its index among the design's items; none for the theme's. */
type CascadeRule = { selector: string; body: string; order: number; source?: number };

/** The theme's button rules, then the design's top-level rules (its desktop rules). */
function cascade(snippet: Snippet): CascadeRule[] {
  const theme = parse(THEME_BUTTON_RULES).items.map((item) => ({ item, source: undefined as number | undefined }));
  const own = parse(snippet.css).items.map((item, index) => ({ item, source: index as number | undefined }));
  return [...theme, ...own]
    .flatMap(({ item, source }) => (item.type === "rule" ? [{ ...item, source }] : []))
    .map(({ selector, body, source }, order) => ({ selector, body, order, source }));
}

/** Where a rule reaches a button: each state it applies in, with its best rank there. */
function reach(rule: CascadeRule, button: ButtonContext, important: boolean): Partial<Record<ColorState, number[]>> {
  const ranks: Partial<Record<ColorState, number[]>> = {};
  for (const selector of rule.selector.split(/,\s*/)) {
    const state = targets(selector, button);
    if (!state) continue;
    const rank = [important ? 1 : 0, specificity(selector), rule.order];
    // A rule for the button at rest still applies while it's hovered.
    for (const target of state === "hover" ? (["hover"] as const) : (["normal", "hover"] as const)) {
      const current = ranks[target];
      if (!current || outranks(rank, current)) ranks[target] = rank;
    }
  }
  return ranks;
}

/**
 * For each button in the design, the declaration that wins each cell, read from the
 * theme's button rules and the design's CSS (desktop rules only).
 */
function winners(snippet: Snippet, kind: SectionKind): Record<ColorState, Partial<Record<Part, Winner>>>[] {
  const rules = cascade(snippet);
  return buttonContexts(snippet, kind).map((button) => {
    const best: Record<ColorState, Partial<Record<Part, Winner>>> = { normal: {}, hover: {} };
    for (const rule of rules) {
      rule.body.split(";").forEach((declaration, d) => {
        const colon = declaration.indexOf(":");
        if (colon < 0) return;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        let value = declaration.slice(colon + 1).trim();
        const important = /!important$/.test(value);
        value = value.replace(/\s*!important$/, "");
        const reached = Object.entries(reach(rule, button, important)) as [ColorState, number[]][];
        for (const { id: part } of PARTS) {
          const found = partValue(property, value, part);
          if (found === undefined) continue;
          const source = rule.source === undefined ? undefined : { item: rule.source, declaration: d };
          for (const [state, rank] of reached) {
            const current = best[state][part];
            if (!current || outranks(rank, current.rank)) best[state][part] = { value: found, rank, source };
          }
        }
      });
    }
    return best;
  });
}

/** The colors and text each button in the design shows, normal and on hover. */
export function designedStyles(snippet: Snippet, kind: SectionKind): DesignedStyles[] {
  const values = (cells: Partial<Record<Part, Winner>>) =>
    Object.fromEntries(Object.entries(cells).map(([part, w]) => [part, w!.value]));
  return winners(snippet, kind).map((button) => ({ normal: values(button.normal), hover: values(button.hover) }));
}

/**
 * The declaration with its value (or, in a border shorthand, its color) swapped for
 * `color`, or null when it can't be swapped cleanly: a border shorthand that names no
 * color, or a background image.
 */
function restyle(declaration: string, color: string): string | null {
  const colon = declaration.indexOf(":");
  const property = declaration.slice(0, colon).trim();
  const raw = declaration.slice(colon + 1).trim();
  const important = /!important$/.test(raw) ? " !important" : "";
  const value = raw.replace(/\s*!important$/, "");
  const name = property.toLowerCase();
  if (name === "border") {
    return COLOR_TOKEN.test(value) ? `${property}: ${value.replace(COLOR_TOKEN, color)}${important}` : null;
  }
  if (name === "background" && !new RegExp(`^(?:${COLOR_TOKEN.source})$`, "i").test(value)) return null;
  return `${property}: ${color}${important}`;
}

// ---------- The choice ----------

const cellKey = (c: Cell) => `${c.button}:${c.state}:${c.part}`;

/**
 * The design with the chosen colors and button text written into its CSS, for the
 * buttons it shows. A null `text` keeps the design's own text size and weight.
 *
 * Each changed value is placed the plainest way that changes nothing else:
 *   1. rewrite the declaration that sets it now;
 *   2. otherwise, add a declaration to one of the design's own button rules;
 *   3. otherwise, add a rule for that one button at the end of the CSS.
 */
export function withButtonStyles(
  snippet: Snippet,
  kind: SectionKind,
  set: ButtonColorSet,
  text: ButtonText | null = null,
): Snippet {
  const shown = buttonCount(snippet, kind);
  const found = winners(snippet, kind).slice(0, shown);
  const font = textValues(text);
  const chosen = (cell: Cell): string | undefined => {
    if (cell.part === "size" || cell.part === "weight") return font[cell.part];
    const choice = set[cell.button]?.[cell.state]?.[cell.part];
    return choice ? colorValue(choice) : undefined;
  };
  const winner = (cell: Cell) => found[cell.button]?.[cell.state][cell.part];
  /** The value a cell should end up with: the choice, or the design's own. */
  const desired = (cell: Cell) => chosen(cell) ?? winner(cell)?.value;
  const all: Cell[] = found.flatMap((_, button) =>
    COLOR_STATES.flatMap(({ id: state }) => PARTS.map(({ id: part }) => ({ button, state, part }))),
  );
  if (!all.some(chosen)) return snippet;

  const items = parse(snippet.css).items;
  const rules = cascade(snippet);
  const buttons = buttonContexts(snippet, kind).slice(0, shown);
  /** Cells whose declaration couldn't be rewritten, with the value each needs. */
  const pending: (Cell & { value: string })[] = [];

  // 1. Cells that share a declaration are decided together.
  const groups = new Map<string, Cell[]>();
  for (const cell of all) {
    const source = winner(cell)?.source;
    if (!source) {
      // Set by the theme, or not at all: there's nothing of the design's to rewrite.
      const value = chosen(cell);
      if (value) pending.push({ ...cell, value });
      continue;
    }
    const key = `${source.item}:${source.declaration}`;
    groups.set(key, [...(groups.get(key) ?? []), cell]);
  }
  for (const cells of groups.values()) {
    const changed = cells.filter(chosen);
    if (!changed.length) continue;
    const { source, value: designed } = winner(cells[0])!;
    const wanted = new Set(changed.map(chosen));
    const rule = items[source!.item];
    const declarations = rule.type === "rule" ? rule.body.split(";") : [];
    const rewritten = wanted.size === 1 ? restyle(declarations[source!.declaration], [...wanted][0]!) : null;
    if (rule.type !== "rule" || rewritten === null) {
      for (const cell of changed) pending.push({ ...cell, value: chosen(cell)! });
      continue;
    }
    declarations[source!.declaration] = rewritten;
    rule.body = declarations.map((d) => d.trim()).filter(Boolean).join("; ");
    // Cells the declaration also set, but that weren't changed, keep their value.
    for (const cell of cells) if (!chosen(cell)) pending.push({ ...cell, value: designed });
  }

  // 2. A declaration added to one of the design's rules that reaches the cell and wins
  // there, as long as every other cell it would win also wants that value.
  const placed = new Set<string>();
  const host = (cell: Cell & { value: string }): boolean => {
    for (const rule of rules) {
      const item = rule.source === undefined ? undefined : items[rule.source];
      if (item?.type !== "rule") continue;
      const own = rule.selector.split(/,\s*/).some((s) => targets(s, buttons[cell.button]) === cell.state);
      if (!own) continue;
      const wins = all.filter((c) => {
        if (c.part !== cell.part) return false;
        const rank = reach(rule, buttons[c.button], true)[c.state];
        const current = winner(c);
        return rank && (!current || outranks(rank, current.rank));
      });
      if (!wins.some((c) => cellKey(c) === cellKey(cell))) continue;
      if (!wins.every((c) => desired(c) === cell.value)) continue;
      const property = PROPERTY[cell.part];
      const declaration = `${property}: ${cell.value} !important`;
      const declarations = item.body.split(";").map((d) => d.trim()).filter(Boolean);
      const at = declarations.findIndex((d) => d.slice(0, d.indexOf(":")).trim().toLowerCase() === property);
      if (at >= 0) declarations[at] = declaration;
      else declarations.push(declaration);
      item.body = declarations.join("; ");
      for (const c of wins) placed.add(cellKey(c));
      return true;
    }
    return false;
  };
  const extra: (Cell & { value: string })[] = [];
  for (const cell of pending) {
    if (placed.has(cellKey(cell)) || /gradient|url\(/.test(cell.value)) continue;
    if (!host(cell)) extra.push(cell);
  }

  // 3. A rule added for a normal value outranks the design's own hover rules, so the
  // hover value goes in beside it: the one chosen, or the design's.
  for (const cell of extra.filter((c) => c.state === "normal")) {
    const same = (c: Cell) => c.button === cell.button && c.state === "hover" && c.part === cell.part;
    if (extra.some(same)) continue;
    const hover: Cell = { ...cell, state: "hover" };
    const value = desired(hover);
    if (value && !/gradient|url\(/.test(value)) extra.push({ ...hover, value });
  }

  let css = formatCss(serialize(items));
  const added = found.flatMap((_, button) =>
    COLOR_STATES.flatMap(({ id: state }) => {
      const declarations = PARTS.flatMap((p) => {
        const cell = extra.find((c) => c.button === button && c.state === state && c.part === p.id);
        return cell ? [`${PROPERTY[p.id]}: ${cell.value} !important`] : [];
      });
      if (!declarations.length) return [];
      // Counted among the holder's links, so the first and second button can differ.
      const selector = `${HOLDERS[kind].selector} > a.lp-btn:nth-of-type(${button + 1})${state === "hover" ? ":hover" : ""}`;
      return [`${selector} { ${declarations.join("; ")} }`];
    }),
  );
  if (added.length) css = `${css}\n${formatCss(`/* Button styles */ ${added.join("\n")}`)}`;
  return { ...snippet, css };
}
