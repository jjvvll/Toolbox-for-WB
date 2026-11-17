"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CopyButton from "@/components/copy-button";
import { PALETTE_STORAGE_KEY } from "../color-palette/lib/saved-root";
import Modal from "../notes/modal";
import {
  COLOR_PARTS,
  COLOR_STATES,
  TRANSPARENT,
  colorValue,
  colorVariables,
  describeColor,
  designedStyles,
  FONT_PRESETS,
  FONT_WEIGHTS,
  cleanSize,
  hasColors,
  resolveColor,
  withButtonStyles,
  type ButtonColorSet,
  type ColorPart,
  type ColorState,
  type DesignedStyles,
  type ButtonText,
} from "./lib/button-style";
import { buttonChoices, buttonCount, withButtons, type ButtonCount } from "./lib/buttons";
import { KINDS, STYLES } from "./lib/catalog";
import { COLUMNS, ROWS, positionLabel, withPosition, type Position } from "./lib/position";
import { buildPreviewDoc, readTheme, type PreviewTheme, type SectionKind } from "./lib/preview";
import { fillFor, type Audience, type Length, type Snippet } from "./lib/shared";

/** Widths the previews are laid out at. Cards always show the desktop layout, scaled down. */
const VIEWPORTS = { desktop: 1280, tablet: 820, mobile: 390 } as const;
type Device = keyof typeof VIEWPORTS;

/** How many buttons a design shows: its choices, as built, and the one picked (null for as built). */
type Buttons = { choices: ButtonCount[]; built: number; value: ButtonCount | null };

/** A design ready to copy. `position` is undefined for sections that can't be positioned. */
type Item = {
  key: string;
  snippet: Snippet;
  position?: Position | null;
  buttons: Buttons;
  colors: ButtonColorSet;
  /** The button text: a site template's, custom values, or null for as designed. */
  font: ButtonText | null;
  /** What each button's colors and text are before any are changed. */
  designed: DesignedStyles[];
};

const AUDIENCES: { id: Audience; label: string; detail: string }[] = [
  { id: "agent", label: "Individual", detail: "Agent Name, with a Learn More button to /about" },
  { id: "team", label: "Team", detail: "Team Name, with a Meet The Team button to /team" },
];

const LENGTHS: { id: Length; label: string; detail: string }[] = [
  { id: "short", label: "Short", detail: "Short: a headline with a paragraph or two, or a few brief items." },
  {
    id: "long",
    label: "Long",
    detail: "Long: several paragraphs, broken up with subheadings, images or a quote.",
  },
];

/** Fires when the palette tool saves in another tab, so the previews follow it live. */
function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSavedPalette() {
  try {
    return localStorage.getItem(PALETTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A zero width means the element is momentarily not laid out; keeping the last real
    // width stops the previews from being torn down and reloaded.
    const observer = new ResizeObserver(([entry]) => setWidth((w) => entry.contentRect.width || w));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
    active
      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
  }`;

/** One level of the library's filters: a label, then its choices. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function SectionsTool() {
  // The levels, outermost first: the style set, the kind of section, then either who it's
  // for (sections that name someone) or how much copy it holds (content sections).
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [kind, setKind] = useState<SectionKind>("opening");
  const [audience, setAudience] = useState<Audience>("agent");
  const [length, setLength] = useState<Length>("short");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Where each heading sits over the photo, by design. Unset means as designed.
  const [positions, setPositions] = useState<Record<string, Position | null>>({});
  // How many buttons each design shows, by design. Unset means as built.
  const [buttonCounts, setButtonCounts] = useState<Record<string, ButtonCount | null>>({});
  // Each design's button colors, by design. Unset means as designed.
  const [buttonColors, setButtonColors] = useState<Record<string, ButtonColorSet>>({});
  // Each design's button text, by design. Unset means as designed.
  const [buttonFonts, setButtonFonts] = useState<Record<string, ButtonText | null>>({});

  const savedPalette = useSyncExternalStore(subscribeStorage, readSavedPalette, () => null);
  const theme = useMemo(() => readTheme(savedPalette), [savedPalette]);

  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const currentKind = KINDS.find((k) => k.id === kind)!;
  const currentAudience = AUDIENCES.find((a) => a.id === audience)!;
  const currentLength = LENGTHS.find((l) => l.id === length)!;
  const byLength = currentKind.choice === "length";
  const items = useMemo(
    () =>
      style.sections[kind]
        .filter((snippet) => !byLength || snippet.length === length)
        .map((snippet): Item => {
          const key = `${style.id}-${kind}-${snippet.id}`;
          const value = buttonCounts[key] ?? null;
          const buttons = { choices: buttonChoices(snippet, kind), built: buttonCount(snippet, kind), value };
          const colors = buttonColors[key] ?? [];
          const font = buttonFonts[key] ?? null;
          const sized = withButtons(snippet, kind, value);
          const designed = designedStyles(sized, kind);
          const styled = withButtonStyles(sized, kind, colors, font);
          const filled = { ...styled, html: fillFor(styled.html, audience) };
          const item = { key, snippet: filled, buttons, colors, font, designed };
          // Only headings sit over a photo; the rest are full-width sections of their own.
          if (kind !== "opening") return item;
          const position = positions[key] ?? null;
          return { ...item, snippet: withPosition(filled, position), position };
        }),
    [style, kind, audience, byLength, length, positions, buttonCounts, buttonColors, buttonFonts],
  );
  const setColors = (key: string, colors: ButtonColorSet) =>
    setButtonColors((all) => ({ ...all, [key]: colors }));
  const setFont = (key: string, font: ButtonText | null) =>
    setButtonFonts((all) => ({ ...all, [key]: font }));
  const colorVars = useMemo(() => colorVariables(theme.vars), [theme]);
  const setPosition = (key: string, position: Position | null) =>
    setPositions((all) => ({ ...all, [key]: position }));
  const setButtons = (key: string, count: ButtonCount | null) =>
    setButtonCounts((all) => ({ ...all, [key]: count }));
  const open = items.find((item) => item.key === openKey) ?? null;

  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <FilterRow label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={style.id === s.id}
              title={s.hint}
              onClick={() => {
                setStyleId(s.id);
                setOpenKey(null);
              }}
              className={chip(style.id === s.id)}
            >
              {s.label}{" "}
              <span className="font-normal opacity-70">
                {KINDS.reduce((total, k) => total + s.sections[k.id].length, 0)}
              </span>
            </button>
          ))}
        </FilterRow>

        <FilterRow label="Section">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => {
                setKind(k.id);
                setOpenKey(null);
              }}
              className={chip(kind === k.id)}
            >
              {k.label} <span className="font-normal opacity-70">{style.sections[k.id].length}</span>
            </button>
          ))}
        </FilterRow>

        {byLength ? (
          <FilterRow label="Length">
            {LENGTHS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={length === l.id}
                title={l.detail}
                onClick={() => {
                  setLength(l.id);
                  setOpenKey(null);
                }}
                className={chip(length === l.id)}
              >
                {l.label}{" "}
                <span className="font-normal opacity-70">
                  {style.sections[kind].filter((snippet) => snippet.length === l.id).length}
                </span>
              </button>
            ))}
          </FilterRow>
        ) : (
          <FilterRow label="For">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={audience === a.id}
                title={a.detail}
                onClick={() => setAudience(a.id)}
                className={chip(audience === a.id)}
              >
                {a.label}
              </button>
            ))}
          </FilterRow>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        <h2 className="text-base font-medium text-foreground">
          {style.label} <span className="text-zinc-400">/</span> {currentKind.label}{" "}
          <span className="text-zinc-400">/</span>{" "}
          {byLength ? currentLength.label : currentAudience.label}{" "}
          <span className="font-normal text-zinc-500">{items.length} designs</span>
        </h2>
        <p>
          {style.hint} {currentKind.hint}
          {byLength && ` ${currentLength.detail}`}
        </p>
        <p>
          Click a preview to see it full size and on a phone. The text, links and images are
          placeholders to replace after pasting.
        </p>
        <p>
          Use the Buttons choice on a design to show two buttons, one, or none before copying. The
          HTML and CSS change to match: removed buttons take their CSS with them.
        </p>
        <p>
          Click a design to set its button text size and weight from a site template (Producer,
          Masterpiece or Visionary), and each button&apos;s border, background and text colors, normal
          and on hover, from the palette&apos;s :root variables or transparent. The choices are written
          into its CSS as you make them.
        </p>
        {kind === "opening" && (
          <p>
            Use the grid on a design to choose where it sits over the photo, such as bottom left or
            center, before copying. The position is added to its CSS; left and right apply on
            desktop, and every design centers itself on tablets and phones.
          </p>
        )}
        <p className="text-xs text-zinc-500">
          {theme.fromPalette
            ? `Previews use your ${theme.templateLabel} colors and fonts from the `
            : "Previews use sample colors. Save a palette to see your own, in the "}
          <Link href="/color-palette" className="text-blue-600 hover:underline dark:text-blue-400">
            Color Palette tool
          </Link>
          . The CSS only ever uses the palette&apos;s :root variables, so it follows each site&apos;s
          own colors.
        </p>
      </div>

      <ul className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {items.map((item, i) => (
          <Card
            key={item.key}
            index={i + 1}
            kind={kind}
            snippet={item.snippet}
            position={item.position}
            onPosition={(position) => setPosition(item.key, position)}
            buttons={item.buttons}
            onButtons={(count) => setButtons(item.key, count)}
            theme={theme}
            onOpen={() => setOpenKey(item.key)}
          />
        ))}
      </ul>

      {open && (
        <Detail
          kind={kind}
          snippet={open.snippet}
          position={open.position}
          onPosition={(position) => setPosition(open.key, position)}
          buttons={open.buttons}
          onButtons={(count) => setButtons(open.key, count)}
          colors={open.colors}
          designed={open.designed}
          onColors={(colors) => setColors(open.key, colors)}
          font={open.font}
          onFont={(font) => setFont(open.key, font)}
          colorVars={colorVars}
          theme={theme}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}

/**
 * A 3 by 3 grid for where a heading sits over the photo. Picking the selected
 * cell again goes back to the design's own position.
 */
function PositionPicker({
  value,
  onChange,
  fullWidth = false,
}: {
  value: Position | null;
  onChange: (position: Position | null) => void;
  /** Full-width designs only move up and down. */
  fullWidth?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Position over the photo"
      className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {ROWS.flatMap((y) =>
        COLUMNS.map((x) => {
          const active = value?.x === x && value.y === y;
          const disabled = fullWidth && x !== "center";
          const label = positionLabel({ x, y });
          return (
            <button
              key={`${y}-${x}`}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={disabled ? "This design spans the full width" : label}
              disabled={disabled}
              onClick={() => onChange(active ? null : { x, y })}
              className={`flex size-4 items-center justify-center rounded-sm transition-colors disabled:opacity-30 ${
                active
                  ? "bg-blue-600"
                  : "enabled:hover:bg-zinc-200 dark:enabled:hover:bg-zinc-800"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${active ? "bg-white" : "bg-zinc-400 dark:bg-zinc-500"}`}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}

/**
 * How many buttons a design shows: none, one or two. Picking the number it was built
 * with goes back to it as built.
 */
function ButtonPicker({ buttons, onChange }: { buttons: Buttons; onChange: (count: ButtonCount | null) => void }) {
  if (!buttons.choices.length) return null;
  const current = buttons.value ?? buttons.built;
  return (
    <div role="group" aria-label="Buttons" className="flex shrink-0 items-center gap-1.5">
      <span className="text-xs text-zinc-500">Buttons</span>
      <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
        {buttons.choices.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={current === n}
            title={n === 0 ? "No buttons" : n === 1 ? "One button" : "Two buttons"}
            onClick={() => onChange(n === buttons.built ? null : n)}
            className={`min-w-6 rounded-sm px-1.5 text-xs font-medium tabular-nums transition-colors ${
              current === n
                ? "bg-blue-600 text-white"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The buttons' text size and weight, from a site template, and each shown button's
 * border, background and text colors, normal and on hover. Every color is transparent
 * or one of the palette's :root variables; "As designed" keeps the design's own value,
 * and says what it is.
 */
function ButtonStylePanel({
  count,
  colors,
  designed,
  onChange,
  font,
  onFont,
  colorVars,
  theme,
}: {
  /** How many buttons the design shows right now. */
  count: number;
  colors: ButtonColorSet;
  designed: DesignedStyles[];
  onChange: (colors: ButtonColorSet) => void;
  font: ButtonText | null;
  onFont: (font: ButtonText | null) => void;
  colorVars: string[];
  theme: PreviewTheme;
}) {
  if (count === 0) return null;
  const set = (button: number, state: ColorState, part: ColorPart, choice: string) => {
    const next = [...colors];
    const states = { ...next[button] };
    const parts = { ...states[state] };
    if (choice) parts[part] = choice;
    else delete parts[part];
    states[state] = parts;
    next[button] = states;
    onChange(next);
  };
  const checkerboard = "repeating-conic-gradient(#d4d4d8 0 25%, #fff 0 50%) 0 0 / 8px 8px";
  /** The CSS value a cell ends up with: the choice, or the design's own color. */
  const valueOf = (button: number, state: ColorState, part: ColorPart): string | undefined => {
    const choice = colors[button]?.[state]?.[part];
    if (choice) return colorValue(choice);
    const own = designed[button]?.[state][part];
    // A border that follows the text takes the text color.
    return own === "currentColor" ? valueOf(button, state, "text") : own;
  };
  const swatch = (value: string | undefined) => {
    if (!value) return undefined;
    if (value === TRANSPARENT) return checkerboard;
    const resolved = resolveColor(value, theme.vars);
    // See-through colors are drawn over the checkerboard, so their opacity shows.
    return /gradient|url\(/.test(resolved)
      ? resolved
      : `linear-gradient(${resolved}, ${resolved}), ${checkerboard}`;
  };
  const designedLabel = (button: number, state: ColorState, part: ColorPart) => {
    const own = designed[button]?.[state][part];
    return own ? `As designed (${own === "currentColor" ? "text color" : describeColor(own)})` : "As designed";
  };

  const buttonLabel = (button: number) =>
    count > 1 ? (button === 0 ? "First button" : "Second button") : "Button";

  const own = designed[0]?.normal;
  const textOptions = [
    { id: null, label: "As designed", size: own?.size ?? "", weight: own?.weight ?? "" },
    ...FONT_PRESETS,
  ];
  const custom = font?.preset === "custom" ? font : null;
  const sizeValid = !custom || !custom.size.trim() || !!cleanSize(custom.size);
  // Custom starts from what the buttons show now, ready to adjust.
  const startCustom = () => {
    const now = FONT_PRESETS.find((p) => p.id === font?.preset) ?? own;
    onFont({ preset: "custom", size: now?.size ?? "", weight: now?.weight ?? "" });
  };

  return (
    <aside
      aria-label="Button styles"
      className="flex flex-col gap-4 border-t border-zinc-200 p-4 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l dark:border-zinc-800"
    >
      <div>
        <h3 className="text-sm font-medium">Button text</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Font size and weight for every button, from a site template or your own.
        </p>
        <div role="group" aria-label="Button text" className="mt-2 grid grid-cols-2 gap-1.5">
          {textOptions.map((option) => {
            const active = (font?.preset ?? null) === option.id;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => onFont(option.id ? { preset: option.id } : null)}
                className={`flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                <span
                  className={`text-xs font-medium ${active ? "text-blue-700 dark:text-blue-300" : ""}`}
                >
                  {option.label}
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  {[option.size, option.weight && `weight ${option.weight}`].filter(Boolean).join(" · ")}
                </span>
              </button>
            );
          })}
          <div
            className={`col-span-2 rounded-md border px-2.5 py-1.5 transition-colors ${
              custom
                ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
                : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
            }`}
          >
            <button
              type="button"
              aria-pressed={!!custom}
              onClick={() => !custom && startCustom()}
              className="flex w-full flex-col items-start text-left"
            >
              <span className={`text-xs font-medium ${custom ? "text-blue-700 dark:text-blue-300" : ""}`}>
                Custom
              </span>
              {!custom && <span className="text-[11px] text-zinc-500">Your own size and weight</span>}
            </button>
            {custom && (
              <div className="mt-1.5 grid grid-cols-2 gap-2 pb-0.5">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-zinc-500">Size</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={custom.size}
                    placeholder={own?.size ?? "14px"}
                    aria-invalid={!sizeValid}
                    onChange={(e) => onFont({ ...custom, size: e.target.value })}
                    className={`h-7 min-w-0 rounded-md border bg-background px-1.5 text-xs tabular-nums ${
                      sizeValid ? "border-zinc-300 dark:border-zinc-700" : "border-red-500"
                    }`}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-zinc-500">Weight</span>
                  <select
                    value={custom.weight}
                    onChange={(e) => onFont({ ...custom, weight: e.target.value })}
                    className="h-7 min-w-0 rounded-md border border-zinc-300 bg-background px-1.5 text-xs dark:border-zinc-700"
                  >
                    <option value="">As designed{own?.weight ? ` (${own.weight})` : ""}</option>
                    {FONT_WEIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={`col-span-2 text-[11px] ${sizeValid ? "text-zinc-500" : "text-red-600"}`}>
                  {sizeValid
                    ? "A number is read as px; rem and em work too. Leave blank to keep the design's."
                    : "Use a number such as 13, or 13px, 0.8rem or 0.8em."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Button colors</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          From the palette&apos;s :root variables, or transparent. Written into the design&apos;s CSS.
        </p>
      </div>

      {Array.from({ length: count }, (_, button) => (
        <section
          key={button}
          aria-label={buttonLabel(button)}
          className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide uppercase">{buttonLabel(button)}</span>
            {hasColors([colors[button] ?? {}]) && (
              <button
                type="button"
                onClick={() => {
                  const next = [...colors];
                  next[button] = {};
                  onChange(next);
                }}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Reset
              </button>
            )}
          </div>

          {COLOR_STATES.map((s) => (
            <fieldset key={s.id} className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                {s.label}
              </legend>
              {COLOR_PARTS.map((p) => {
                const choice = colors[button]?.[s.id]?.[p.id];
                return (
                  <label key={p.id} className="grid grid-cols-[5rem_1fr] items-center gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{p.label}</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-5 shrink-0 rounded border border-zinc-300 dark:border-zinc-700"
                        style={{ background: swatch(valueOf(button, s.id, p.id)) }}
                      />
                      <select
                        title={choice ? colorValue(choice) : designedLabel(button, s.id, p.id)}
                        value={choice ?? ""}
                        onChange={(e) => set(button, s.id, p.id, e.target.value)}
                        className={`h-7 min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-1.5 text-xs dark:border-zinc-700 ${
                          choice ? "" : "text-zinc-500"
                        }`}
                      >
                        <option value="">{designedLabel(button, s.id, p.id)}</option>
                        <option value={TRANSPARENT}>transparent</option>
                        {colorVars.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </section>
      ))}
    </aside>
  );
}

const positionText = (position: Position | null) =>
  position ? positionLabel(position) : "As designed";

function Card({
  index,
  kind,
  snippet,
  position,
  onPosition,
  buttons,
  onButtons,
  theme,
  onOpen,
}: {
  index: number;
  kind: SectionKind;
  snippet: Snippet;
  position?: Position | null;
  onPosition: (position: Position | null) => void;
  buttons: Buttons;
  onButtons: (count: ButtonCount | null) => void;
  theme: PreviewTheme;
  onOpen: () => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  // Previews are only built once they're close to the screen: sixty pages at once is a lot.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, ref]);

  const doc = useMemo(
    () => (near ? buildPreviewDoc(kind, snippet.html, snippet.css, theme) : null),
    [near, kind, snippet, theme],
  );

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background dark:border-zinc-800">
      <div ref={ref} className="relative bg-zinc-100 dark:bg-zinc-900">
        {doc && width > 0 ? (
          <PreviewFrame doc={doc} viewport={VIEWPORTS.desktop} width={width} title={snippet.name} />
        ) : (
          <div className="h-60" />
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${snippet.name}`}
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-zinc-200 p-3 dark:border-zinc-800">
        {/* The name and the copy buttons share a row; the copy buttons never split up. */}
        <div className="flex items-center gap-2">
          <p className="mr-auto min-w-0 truncate text-sm font-medium" title={snippet.name}>
            <span className="mr-2 font-normal tabular-nums text-zinc-400">
              {String(index).padStart(2, "0")}
            </span>
            {snippet.name}
          </p>
          <div className="flex shrink-0 gap-2">
            <CopyButton text={snippet.html} label="Copy HTML" />
            <CopyButton text={snippet.css} label="Copy CSS" />
          </div>
        </div>
        {(buttons.choices.length > 0 || position !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ButtonPicker buttons={buttons} onChange={onButtons} />
            {position !== undefined && (
              <div className="flex items-center gap-2">
                <PositionPicker value={position} onChange={onPosition} fullWidth={snippet.fullWidth} />
                <span className="text-xs text-zinc-500">Position: {positionText(position)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The snippet's page in an iframe laid out `viewport` px wide and scaled down to
 * fit `width`. The frame grows to the height of its content, so nothing scrolls.
 */
function PreviewFrame({
  doc,
  viewport,
  width,
  title,
  interactive = false,
}: {
  doc: string;
  viewport: number;
  width: number;
  title: string;
  interactive?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const scale = Math.min(1, width / viewport);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(body.offsetHeight);
    };
    // Runs for every page the frame loads; fonts arriving later change the height again.
    const onLoad = () => {
      observer?.disconnect();
      const body = frame.contentDocument?.body;
      if (!body) return;
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(body);
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className="mx-auto overflow-hidden"
      style={{ width: viewport * scale, height: height ? height * scale : 240 }}
    >
      {/* No allow-scripts, so nothing in the page can run. allow-same-origin only lets
          this component measure the page's height. */}
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-same-origin"
        srcDoc={doc}
        tabIndex={interactive ? 0 : -1}
        className="block origin-top-left border-0"
        style={{
          width: viewport,
          height: Math.max(height, 1),
          transform: `scale(${scale})`,
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
}

function Detail({
  kind,
  snippet,
  position,
  onPosition,
  buttons,
  onButtons,
  colors,
  designed,
  onColors,
  font,
  onFont,
  colorVars,
  theme,
  onClose,
}: {
  kind: SectionKind;
  snippet: Snippet;
  position?: Position | null;
  onPosition: (position: Position | null) => void;
  buttons: Buttons;
  onButtons: (count: ButtonCount | null) => void;
  colors: ButtonColorSet;
  designed: DesignedStyles[];
  onColors: (colors: ButtonColorSet) => void;
  font: ButtonText | null;
  onFont: (font: ButtonText | null) => void;
  colorVars: string[];
  theme: PreviewTheme;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>();
  const doc = useMemo(
    () => buildPreviewDoc(kind, snippet.html, snippet.css, theme),
    [kind, snippet, theme],
  );

  return (
    <Modal onClose={onClose} label={snippet.name} className="max-w-7xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="mr-auto font-medium">{snippet.name}</h2>
        {position !== undefined && (
          <div className="mr-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Position: {positionText(position)}</span>
            <PositionPicker value={position} onChange={onPosition} fullWidth={snippet.fullWidth} />
          </div>
        )}
        <ButtonPicker buttons={buttons} onChange={onButtons} />
        {(Object.keys(VIEWPORTS) as Device[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={device === d}
            onClick={() => setDevice(d)}
            className={`${chip(device === d)} capitalize`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-1 rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
        >
          ✕
        </button>
      </div>

      {/* Preview and code scroll on the left; the button colors stay in view on the right. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <div ref={stageRef} className="bg-zinc-100 dark:bg-zinc-900">
            {stageWidth > 0 && (
              <PreviewFrame
                doc={doc}
                viewport={VIEWPORTS[device]}
                width={stageWidth}
                title={`${snippet.name} preview`}
                interactive
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
            <CodeBlock label="HTML" code={snippet.html} />
            <CodeBlock label="CSS" code={snippet.css} />
          </div>
        </div>
        <ButtonStylePanel
          count={buttons.value ?? buttons.built}
          colors={colors}
          designed={designed}
          onChange={onColors}
          font={font}
          onFont={onFont}
          colorVars={colorVars}
          theme={theme}
        />
      </div>
    </Modal>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="text-xs font-medium tracking-wide text-zinc-500">{label}</span>
        <CopyButton text={code} label={`Copy ${label}`} />
      </div>
      <pre className="max-h-96 overflow-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
