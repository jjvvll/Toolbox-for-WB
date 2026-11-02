"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CopyButton from "@/components/copy-button";
import { buildPalette } from "../logo-to-svg/lib/palette";
import {
  POOL_MODES,
  PROPERTY_DEFAULTS,
  TRANSPARENT,
  autoThemes,
  colorPool,
  contrast,
  hexToRgb,
  paletteNotes,
  rating,
  rgbToHex,
  solid,
  themesToCss,
  type ButtonColors,
  type PoolGroup,
  type PoolMode,
  type PropertyColors,
  type Theme,
} from "./lib/color";
import {
  DEFAULT_FONT,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  FONT_PAIRS,
  cssFamily,
  fontsToCss,
  googleFontsUrl,
  pairFor,
  type FontChoice,
  type FontPair,
} from "./lib/fonts";

/** Loads Google Fonts stylesheets for the given pairs (once per URL) while the component is mounted. */
function useGoogleFonts(pairs: FontPair[]) {
  const href = googleFontsUrl(pairs);
  useEffect(() => {
    if (document.head.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [href]);
}

/** `active: false` keeps a color in the palette without using it for styling. */
type Swatch = { hex: string; share?: number; active?: boolean };

/** The colors used for styling: every palette color that hasn't been switched off. */
const activeHex = (list: Swatch[]) => list.filter((s) => s.active !== false).map((s) => s.hex);
type Sample = { headline: string; text: string; button: string };
type Saved = { palette: Swatch[]; themes: Theme[]; sample: Sample; customized: boolean; mode?: PoolMode; font?: FontChoice };

const STORAGE_KEY = "color-palette:v1";
const SAMPLE: Sample = {
  headline: "Build something people love",
  text: "A short paragraph to see how body text reads on this background at a normal size.",
  button: "Get started",
};

function loadSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Draws an image into a canvas no larger than `max` px on its long side. */
function toCanvas(img: HTMLImageElement, max: number) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, ctx };
}

function extract(img: HTMLImageElement, count: number): Swatch[] {
  const { canvas, ctx } = toCanvas(img, 600);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pal = buildPalette(data, count).filter((c) => c.a > 0);
  // Share of the screenshot each color covers.
  const counts = new Array(pal.length).fill(0);
  let total = 0;
  for (let p = 0; p < data.data.length; p += 16) {
    if (data.data[p + 3] < 128) continue;
    let best = 0, bestD = Infinity;
    pal.forEach((c, i) => {
      const d = (c.r - data.data[p]) ** 2 + (c.g - data.data[p + 1]) ** 2 + (c.b - data.data[p + 2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    counts[best]++;
    total++;
  }
  return pal
    .map((c, i) => ({ hex: rgbToHex(c.r, c.g, c.b), share: total ? counts[i] / total : 0 }))
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
}

const button = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default function ColorPaletteTool() {
  const [saved] = useState(loadSaved);
  const [image, setImage] = useState<{ url: string; img: HTMLImageElement; name: string } | null>(null);
  const [count, setCount] = useState(8);
  const [palette, setPalette] = useState<Swatch[]>(saved?.palette ?? []);
  const [mode, setMode] = useState<PoolMode>(saved?.mode ?? "neutrals");
  const [themes, setThemes] = useState<Theme[]>(() => {
    const auto = autoThemes(activeHex(saved?.palette ?? []), saved?.mode ?? "neutrals");
    // Themes saved before every container had a property card get auto-assigned card colors.
    return saved?.themes?.map((t) => (t.property ? t : { ...t, property: auto.find((a) => a.id === t.id)?.property })) ?? auto;
  });
  const [customized, setCustomized] = useState(saved?.customized ?? false);
  const [sample, setSample] = useState<Sample>(saved?.sample ?? SAMPLE);
  const [font, setFont] = useState<FontChoice>(saved?.font ?? DEFAULT_FONT);
  const fonts = pairFor(font);
  useGoogleFonts([fonts]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const fullCanvas = useRef<CanvasRenderingContext2D | null>(null);
  const autoVariant = useRef(0);

  // Remember the palette and assignments (not the screenshot) in this browser.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ palette, themes, sample, customized, mode, font } satisfies Saved));
    } catch {
      // storage unavailable; fine
    }
  }, [palette, themes, sample, customized, mode, font]);

  const applyPalette = useCallback((next: Swatch[], keepAssignments: boolean) => {
    setPalette(next);
    if (!keepAssignments && activeHex(next).length) {
      setThemes(autoThemes(activeHex(next), mode));
      setCustomized(false);
    }
  }, [mode]);

  /** Palette edits re-run the automatic assignment until colors have been set by hand. */
  const commitPalette = (next: Swatch[]) => applyPalette(next, customized);

  function changeMode(next: PoolMode) {
    setMode(next);
    if (!customized || window.confirm("Re-assign the layout colors for this option? (Cancel keeps your current choices.)")) {
      setThemes(autoThemes(activeHex(palette), next));
      setCustomized(false);
    }
  }

  /** Adds hex codes typed or pasted as text, e.g. "#1a2b3c, F60 0d9488". */
  function addHexes() {
    // "#abc" / "#aabbcc" anywhere, or a bare 6-digit code; bare 3 letters ("add", "bed") aren't treated as colors.
    const found = [...hexInput.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])|\b([0-9a-f]{6})\b/gi)]
      .map((m) => rgbToHex(...hexToRgb(m[1] ?? m[2])));
    if (!found.length) {
      setError("No hex codes found. Use a format like #1a2b3c or 1a2b3c.");
      return;
    }
    setError(null);
    const next = [...palette];
    for (const h of found) if (!next.some((p) => p.hex === h)) next.push({ hex: h });
    commitPalette(next);
    setHexInput("");
  }

  const openImage = useCallback(async (blob: Blob, name: string) => {
    if (!blob.type.startsWith("image/")) {
      setError("Please choose an image (PNG, JPG, WebP…).");
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("That image couldn’t be read."));
        img.src = url;
      });
    } catch (err) {
      URL.revokeObjectURL(url);
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, img, name };
    });
    fullCanvas.current = toCanvas(img, 4000).ctx;
    setError(null);
    applyPalette(extract(img, count), customized && !window.confirm("Re-assign the theme colors from this screenshot? (Cancel keeps your current assignments.)"));
  }, [applyPalette, count, customized]);

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest("textarea, input")) return;
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (file) {
        e.preventDefault();
        void openImage(file, "pasted-screenshot.png");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openImage]);

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  function addColor(hex: string) {
    const h = hex.toLowerCase();
    if (!palette.some((s) => s.hex === h)) commitPalette([...palette, { hex: h }]);
    setPicked(h);
  }

  function pickFromImage(e: React.MouseEvent<HTMLImageElement>) {
    const ctx = fullCanvas.current;
    if (!ctx) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * ctx.canvas.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * ctx.canvas.height);
    const [red, g, b] = ctx.getImageData(x, y, 1, 1).data;
    addColor(rgbToHex(red, g, b));
  }

  async function screenEyedropper() {
    try {
      const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (!EyeDropperCtor) return;
      const { sRGBHex } = await new EyeDropperCtor().open();
      addColor(sRGBHex.startsWith("#") ? sRGBHex : rgbToHex(...(sRGBHex.match(/\d+/g)!.map(Number) as [number, number, number])));
    } catch {
      // cancelled
    }
  }

  function updateTheme(id: Theme["id"], fn: (t: Theme) => Theme) {
    setThemes((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));
    setCustomized(true);
  }

  const hexes = palette.map((s) => s.hex);
  const used = activeHex(palette);
  const pool = colorPool(used, mode);
  const notes = palette.length && !used.length
    ? ["No colors are switched on. Tick at least one color to use it for styling."]
    : paletteNotes(used, mode);

  const toggleColor = (hex: string) =>
    commitPalette(palette.map((x) => (x.hex === hex ? { ...x, active: x.active === false } : x)));
  const setAllActive = (active: boolean) => commitPalette(palette.map((x) => ({ ...x, active })));
  /** Re-extracting with a different count keeps colors you switched off switched off. */
  const keepOff = (next: Swatch[]) =>
    next.map((n) => (palette.some((p) => p.hex === n.hex && p.active === false) ? { ...n, active: false } : n));
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* 1. Source (compact) + palette (wide) */}
      <section className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void openImage(f, f.name);
            }}
            className={`flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-2.5 text-center text-xs ${
              image ? "" : "min-h-36"
            } ${dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: screenshot */}
                <img
                  src={image.url}
                  alt="Your screenshot: click anywhere to pick that exact color"
                  onClick={pickFromImage}
                  className="max-h-44 max-w-full cursor-crosshair rounded-md object-contain"
                />
                <p className="text-[11px] leading-snug text-zinc-500">
                  Click the image to pick an exact color{picked && <> · <code>{picked}</code></>}
                </p>
              </>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">Drop a screenshot here or paste it with Ctrl+V</p>
            )}
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              {image ? "Replace screenshot" : "Choose screenshot"}
            </button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void openImage(f, f.name);
            }} />
          </div>

          {image && (
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Colors to extract: {count}
              <input type="range" min={3} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))}
                onPointerUp={() => applyPalette(keepOff(extract(image.img, count)), customized)}
                onKeyUp={() => applyPalette(keepOff(extract(image.img, count)), customized)} />
            </label>
          )}

          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <h2 className="text-xs font-semibold">Add colors</h2>
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); addHexes(); }}>
              <input value={hexInput} onChange={(e) => setHexInput(e.target.value)} placeholder="#1a2b3c, #f97316"
                aria-label="Hex codes to add" className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-2 py-1.5 font-mono text-xs dark:border-zinc-700" />
              <button type="submit" disabled={!hexInput.trim()} className={button}>Add</button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              <label className={`${button} flex flex-1 cursor-pointer items-center justify-center`}>
                + Color picker
                <input type="color" className="h-0 w-0 opacity-0" onChange={(e) => addColor(e.target.value)} />
              </label>
              {hasEyeDropper && (
                <button type="button" onClick={screenEyedropper} className={`${button} flex-1`} title="Pick a color from anywhere on your screen">
                  Eyedropper
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-sm font-semibold">Palette</h2>
            <span className="text-xs text-zinc-500">
              {palette.length ? `${used.length} of ${palette.length} in use` : "0 colors"}
            </span>
            {palette.length > 1 && (
              <span className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => setAllActive(true)} disabled={used.length === palette.length}
                  className="text-blue-600 hover:underline disabled:text-zinc-400 disabled:no-underline dark:text-blue-400">Use all</button>
                <button type="button" onClick={() => setAllActive(false)} disabled={!used.length}
                  className="text-blue-600 hover:underline disabled:text-zinc-400 disabled:no-underline dark:text-blue-400">Use none</button>
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" className={button}
                disabled={!used.length} onClick={() => { autoVariant.current += 1; setThemes(autoThemes(used, mode, autoVariant.current)); setCustomized(false); }}>
                ↻ Auto-assign
              </button>
              {palette.length > 0 && <CopyButton text={hexes.join(", ")} label="Copy" className="py-1.5 text-sm" />}
              {palette.length > 0 && (
                <button type="button" className={`${button} text-red-600`}
                  onClick={() => { if (window.confirm("Remove all colors from the palette?")) commitPalette([]); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {palette.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
              Add a screenshot to extract its colors, or enter the client’s colors on the left.
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {palette.map((s) => {
                const on = s.active !== false;
                return (
                  <li key={s.hex} className={`flex items-center gap-1.5 rounded-lg border p-1.5 transition-opacity ${
                    on ? "border-zinc-200 dark:border-zinc-800" : "border-dashed border-zinc-300 opacity-55 dark:border-zinc-700"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleColor(s.hex)} aria-label={`Use ${s.hex} for styling`}
                      title={on ? "In use: click to keep it in the palette but stop using it" : "Not in use: click to use it again"}
                      className="h-3.5 w-3.5 shrink-0 accent-blue-600" />
                    <button type="button" onClick={() => toggleColor(s.hex)} tabIndex={-1} aria-hidden
                      className="h-8 w-8 shrink-0 rounded-md border border-black/10" style={{ background: s.hex }} />
                    <span className="min-w-0 flex-1">
                      <button type="button" onClick={() => navigator.clipboard.writeText(s.hex)} title="Copy hex"
                        className={`block font-mono text-xs hover:underline ${on ? "" : "line-through"}`}>
                        {s.hex}
                      </button>
                      <span className="text-[10px] text-zinc-500">
                        {s.share !== undefined && `${Math.round(s.share * 100)}%`}{!on && (s.share !== undefined ? " · off" : "off")}
                      </span>
                    </span>
                    <button type="button" onClick={() => commitPalette(palette.filter((x) => x.hex !== s.hex))} aria-label={`Remove ${s.hex}`}
                      title="Remove from the palette"
                      className="rounded px-1 text-xs text-zinc-400 hover:text-red-600">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <fieldset className="mt-auto border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <legend className="mb-2 text-xs font-semibold">Layouts may use</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {POOL_MODES.map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                  mode === m.id ? "border-blue-600 ring-1 ring-blue-600" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}>
                  <input type="radio" name="pool-mode" checked={mode === m.id} onChange={() => changeMode(m.id)} className="mt-0.5 accent-blue-600" />
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-[11px] leading-snug text-zinc-500">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {notes.map((n) => (
            <p key={n} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{n}</p>
          ))}
        </div>
      </section>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

      {/* 2. Sample content */}
      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Sample text</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_10rem]">
          {(["headline", "text", "button"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {k === "headline" ? "Headline" : k === "text" ? "Text" : "Button label"}
              <input value={sample[k]} onChange={(e) => setSample((s) => ({ ...s, [k]: e.target.value }))}
                className="rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm text-foreground dark:border-zinc-700" />
            </label>
          ))}
        </div>
      </section>

      {/* 3. Fonts */}
      <FontPicker value={font} onChange={setFont} />

      {/* 4. Three simulations */}
      <section className="grid gap-4 xl:grid-cols-3">
        {themes.map((t) => (
          <ThemeCard key={t.id} theme={t} pool={pool} sample={sample} fonts={fonts} onChange={(fn) => updateTheme(t.id, fn)} />
        ))}
      </section>

      <CodePanel
        css={`${fontsToCss(fonts)}\n\n${themesToCss(themes)}`}
        json={JSON.stringify({ palette: hexes, used, fonts: { heading: fonts.heading, body: fonts.body }, themes }, null, 2)}
      />
      <p className="text-xs text-zinc-500">Your palette and colors are saved in this browser. The screenshot isn’t stored.</p>
    </div>
  );
}

type Slot = { key: string; label: string; short?: string; value: string; allowTransparent?: boolean; set: (hex: string) => void };

function FontPicker({ value, onChange }: { value: FontChoice; onChange: (c: FontChoice) => void }) {
  const [category, setCategory] = useState(value.category);
  const pairs = FONT_PAIRS[category];
  useGoogleFonts(pairs);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Fonts</h2>
        <div role="tablist" aria-label="Font style" className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
          {FONT_CATEGORIES.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
              className={`rounded px-2.5 py-1 font-medium ${category === c ? "bg-blue-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
              {FONT_CATEGORY_LABELS[c].label}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">{FONT_CATEGORY_LABELS[category].hint}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {pairs.map((p, i) => {
          const selected = value.category === category && value.index === i;
          return (
            <li key={i}>
              <button type="button" aria-pressed={selected} onClick={() => onChange({ category, index: i })}
                className={`flex h-full w-full flex-col gap-1 rounded-lg border p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                  selected ? "border-blue-600 ring-1 ring-blue-600" : "border-zinc-200 dark:border-zinc-800"}`}>
                <span className="text-xl leading-tight" style={{ fontFamily: cssFamily(p.heading), fontWeight: p.heading.weight }}>
                  Build something
                </span>
                <span className="text-xs leading-snug text-zinc-600 dark:text-zinc-400" style={{ fontFamily: cssFamily(p.body), fontWeight: p.body.weight }}>
                  A short paragraph to see how body text reads.
                </span>
                <span className="mt-auto pt-1 text-[10px] text-zinc-500">
                  {p.heading.family}{p.body.family !== p.heading.family && ` + ${p.body.family}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ThemeCard({ theme: t, pool, sample, fonts, onChange }: {
  theme: Theme;
  pool: PoolGroup[];
  sample: Sample;
  fonts: FontPair;
  onChange: (fn: (t: Theme) => Theme) => void;
}) {
  const [state, setState] = useState<"normal" | "hover">("normal");
  const [forceHover, setForceHover] = useState(false);
  const n = t.button.normal, h = t.button.hover;
  const shown = forceHover ? h : n;

  const setButton = (which: "normal" | "hover", part: keyof ButtonColors, hex: string) =>
    onChange((th) => ({ ...th, button: { ...th.button, [which]: { ...th.button[which], [part]: hex } } }));

  const base: Slot[] = [
    { key: "bg", label: "Background", short: "BG", value: t.bg, set: (v) => onChange((th) => ({ ...th, bg: v })) },
    { key: "headline", label: "Headline", value: t.headline, set: (v) => onChange((th) => ({ ...th, headline: v })) },
    { key: "text", label: "Text", value: t.text, set: (v) => onChange((th) => ({ ...th, text: v })) },
  ];
  // Every container has a property card; themes saved before it existed fall back to the defaults.
  const prop = t.property ?? PROPERTY_DEFAULTS;
  const setProp = (part: keyof PropertyColors, hex: string) =>
    onChange((th) => ({ ...th, property: { ...(th.property ?? PROPERTY_DEFAULTS), [part]: hex } }));
  const propSlots: Slot[] = [
    { key: "p-cardBg", label: "Property card BG", short: "Card BG", value: prop.cardBg, set: (v) => setProp("cardBg", v) },
    { key: "p-cardText", label: "Property card typography", short: "Card text", value: prop.cardText, set: (v) => setProp("cardText", v) },
    { key: "p-tagBg", label: "Property tag BG", short: "Tag BG", value: prop.tagBg, set: (v) => setProp("tagBg", v) },
    { key: "p-tagText", label: "Property tag typography", short: "Tag text", value: prop.tagText, set: (v) => setProp("tagText", v) },
  ];
  const btn = t.button[state];
  const buttonSlots: Slot[] = (["border", "fill", "text"] as const).map((part) => ({
    key: `${state}-${part}`,
    label: part === "border" ? "Border" : part === "fill" ? "Fill" : "Text",
    value: btn[part],
    allowTransparent: part !== "text",
    set: (v) => setButton(state, part, v),
  }));

  const checks = [
    { label: "Headline", ratio: contrast(t.headline, t.bg) },
    { label: "Text", ratio: contrast(t.text, t.bg) },
    { label: "Button", ratio: contrast(solid(n.text, t.bg), solid(n.fill, t.bg)) },
    { label: "Button hover", ratio: contrast(solid(h.text, t.bg), solid(h.fill, t.bg)) },
    { label: "Card text", ratio: contrast(prop.cardText, prop.cardBg) },
    { label: "Tag text", ratio: contrast(prop.tagText, prop.tagBg) },
  ];

  const vars = {
    "--b-border": n.border, "--b-fill": n.fill, "--b-text": n.text,
    "--h-border": h.border, "--h-fill": h.fill, "--h-text": h.text,
  } as React.CSSProperties;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      {/* Preview */}
      <div className="flex min-h-64 flex-col justify-center gap-3 p-6 sm:p-8" style={{ background: t.bg }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70" style={{ color: t.text }}>{t.label}</span>
        <h3 className="text-2xl leading-tight tracking-tight" style={{ color: t.headline, fontFamily: cssFamily(fonts.heading), fontWeight: fonts.heading.weight }}>{sample.headline}</h3>
        <p className="text-sm leading-relaxed" style={{ color: t.text, fontFamily: cssFamily(fonts.body), fontWeight: fonts.body.weight }}>{sample.text}</p>
        <div>
          <button
            type="button"
            style={forceHover ? { borderColor: shown.border, background: shown.fill, color: shown.text } : vars}
            className={`rounded-lg border-2 px-5 py-2.5 text-sm font-semibold transition-colors ${
              forceHover ? "" : "[background:var(--b-fill)] [border-color:var(--b-border)] [color:var(--b-text)] hover:[background:var(--h-fill)] hover:[border-color:var(--h-border)] hover:[color:var(--h-text)]"
            }`}
          >
            {sample.button}
          </button>
        </div>
        <PropertyCard colors={prop} fonts={fonts} />
      </div>

      {/* Controls: compact rows of swatches */}
      <div className="flex flex-col gap-2.5 px-3 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Container</p>
            <div className="flex gap-1">{base.map((s) => <ColorSlot key={s.key} slot={s} pool={pool} />)}</div>
          </div>
          <span className="self-stretch border-l border-zinc-200 dark:border-zinc-800" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Button · {state === "normal" ? "Normal" : "Hover"}
            </p>
            <div className="flex gap-1">{buttonSlots.map((s) => <ColorSlot key={s.key} slot={s} pool={pool} alignRight />)}</div>
          </div>
        </div>

        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Property card</p>
          <div className="flex gap-1">{propSlots.map((s) => <ColorSlot key={s.key} slot={s} pool={pool} />)}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <div role="tablist" aria-label="Button state" className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(["normal", "hover"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={state === s} onClick={() => setState(s)}
                className={`rounded px-2 py-0.5 font-medium ${state === s ? "bg-blue-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
                {s === "normal" ? "Normal" : "Hover"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={forceHover} onChange={(e) => setForceHover(e.target.checked)} className="accent-blue-600" />
            Preview hover
          </label>
        </div>

        <ul className="flex flex-wrap gap-1 text-[10px]">
          {checks.map((c) => {
            const r = rating(c.ratio);
            return (
              <li key={c.label} title={`${c.label} contrast: ${c.ratio.toFixed(2)}:1 (${r.label})`}
                className={`rounded px-1.5 py-0.5 font-mono ${r.ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                <span className="font-sans opacity-70">{c.label}</span> {c.ratio.toFixed(1)} {r.label}
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

/** Sample real-estate listing card: photo placeholder with a tag, then price, address and details. */
function PropertyCard({ colors: c, fonts }: { colors: PropertyColors; fonts: FontPair }) {
  return (
    <div className="mt-2 w-full max-w-xs overflow-hidden" style={{ background: c.cardBg, color: c.cardText, fontFamily: cssFamily(fonts.body) }}>
      <div className="relative flex aspect-[2/1] items-center justify-center bg-zinc-300 text-zinc-500">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m21 16-5-5-8 9" />
        </svg>
        <span className="absolute right-2 top-2 px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-wider"
          style={{ background: c.tagBg, color: c.tagText }}>
          For sale
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3.5">
        <p className="text-2xl leading-none" style={{ fontFamily: cssFamily(fonts.heading), fontWeight: fonts.heading.weight }}>$289,000</p>
        <p className="text-xs font-bold uppercase leading-snug tracking-wide">24557 Meadows Trail, Perry, MO 63462</p>
        <p className="text-[10px] uppercase tracking-wider opacity-90">3 Beds | 2 Baths | 2,000 Sq.Ft.</p>
      </div>
    </div>
  );
}

const CHECKER ="repeating-conic-gradient(#d4d4d8 0% 25%, #ffffff 0% 50%) 50% / 10px 10px";
const POPOVER_WIDTH = 224;
const GAP = 6;

function ColorSlot({ slot, pool, alignRight = false }: { slot: Slot; pool: PoolGroup[]; alignRight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  // The popover is portaled to <body> with fixed positioning, so no card's overflow or stacking can hide it.
  // It opens below the swatch, or above when there isn't room, and stays inside the viewport.
  const place = useCallback(() => {
    const t = trigger.current?.getBoundingClientRect();
    const h = popover.current?.offsetHeight ?? 0;
    if (!t) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = alignRight ? t.right - POPOVER_WIDTH : t.left;
    left = Math.max(8, Math.min(left, vw - POPOVER_WIDTH - 8));
    const below = t.bottom + GAP;
    const above = t.top - GAP - h;
    const top = below + h <= vh - 8 || above < 8 ? Math.min(below, Math.max(8, vh - h - 8)) : above;
    setPos({ top, left });
  }, [alignRight]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
        return;
      }
      const target = e.target as Node;
      if (!trigger.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const isTransparent = slot.value === TRANSPARENT;
  const choose = (value: string) => {
    slot.set(value);
    setOpen(false);
  };
  const groups = pool.filter((g) => g.colors.length);
  const swatchClass = (selected: boolean) => `h-7 rounded-md border ${selected ? "ring-2 ring-blue-500 ring-offset-1" : "border-black/10"}`;

  return (
    <div className="min-w-0 flex-1">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${slot.label}: ${slot.value}. Change color`}
        title={`${slot.label}: ${slot.value}`}
        className="group flex w-full flex-col items-center gap-0.5 rounded-md p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <span className="h-6 w-full max-w-9 rounded border border-black/15 ring-blue-500 group-aria-expanded:ring-2"
          style={{ background: isTransparent ? CHECKER : slot.value }} />
        <span className="w-full truncate text-center text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">{slot.short ?? slot.label}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            role="dialog"
            aria-label={`Choose ${slot.label} color`}
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPOVER_WIDTH }}
            className="z-[80] rounded-xl border border-zinc-200 bg-background p-2 text-foreground shadow-2xl dark:border-zinc-800"
          >
            <p className="mb-1.5 flex justify-between text-[11px] font-medium">
              {slot.label}
              <span className="font-mono text-zinc-500">{slot.value}</span>
            </p>
            <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
              {groups.map((g, gi) => (
                <div key={g.label}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{g.label}</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {/* Button border/fill: "transparent" is always offered first. */}
                    {gi === 0 && slot.allowTransparent && (
                      <button type="button" title="Transparent" aria-label="Use transparent" onClick={() => choose(TRANSPARENT)}
                        className={swatchClass(isTransparent)} style={{ background: CHECKER }} />
                    )}
                    {g.colors.map((hex) => (
                      <button key={hex} type="button" title={hex} aria-label={`Use ${hex}`} onClick={() => choose(hex)}
                        className={swatchClass(hex === slot.value)} style={{ background: hex }} />
                    ))}
                  </div>
                </div>
              ))}
              {!groups.length && slot.allowTransparent && (
                <div className="grid grid-cols-6 gap-1.5">
                  <button type="button" title="Transparent" aria-label="Use transparent" onClick={() => choose(TRANSPARENT)}
                    className={swatchClass(isTransparent)} style={{ background: CHECKER }} />
                </div>
              )}
              {!groups.length && <p className="text-xs text-zinc-500">No palette yet; add a screenshot or hex codes, or use a custom color.</p>}
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-800">
              <input type="color" value={isTransparent ? "#ffffff" : slot.value} onChange={(e) => slot.set(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-zinc-300 bg-transparent dark:border-zinc-700" />
              Custom color
            </label>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Live, read-only view of the export, with a color chip beside every value. */
function CodePanel({ css, json }: { css: string; json: string }) {
  const [tab, setTab] = useState<"css" | "json">("css");
  const code = tab === "css" ? css : json;

  // Splits a line into text and color values so each color can show a chip.
  const renderLine = (line: string) =>
    line.split(/(#[0-9a-f]{6}\b|transparent)/gi).map((part, k) =>
      /^#[0-9a-f]{6}$/i.test(part) || part === TRANSPARENT ? (
        <span key={k} className="whitespace-nowrap">
          <span className="mr-1 inline-block h-2.5 w-2.5 translate-y-px rounded-sm border border-black/20 align-baseline"
            style={{ background: part === TRANSPARENT ? CHECKER : part }} aria-hidden />
          <span className="text-emerald-700 dark:text-emerald-400">{part}</span>
        </span>
      ) : (
        <span key={k}>{part}</span>
      ),
    );

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div role="tablist" aria-label="Export format" className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
          {(["css", "json"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 font-medium ${tab === t ? "bg-blue-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
              {t === "css" ? "CSS variables" : "JSON"}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">Updates live as you change colors.</span>
        <CopyButton key={tab} text={code} label={tab === "css" ? "Copy CSS" : "Copy JSON"} className="ml-auto py-1.5 text-xs" />
      </div>
      <pre aria-label={tab === "css" ? "CSS variables" : "JSON"} tabIndex={0}
        className="max-h-80 overflow-auto bg-white p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        {/* One text flow with real newlines, so selecting and copying by hand gives exactly the code. */}
        {code.split("\n").map((line, i) => (
          <Fragment key={i}>
            {i > 0 && "\n"}
            {renderLine(line)}
          </Fragment>
        ))}
      </pre>
    </section>
  );
}
