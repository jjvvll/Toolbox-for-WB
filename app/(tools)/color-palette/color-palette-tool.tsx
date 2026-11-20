"use client";

import { askConfirm } from "@/components/ask-dialog";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import CopyButton from "@/components/copy-button";
import { buildPalette } from "../logo-to-svg/lib/palette";
import {
  POOL_MODES,
  TEMPLATES,
  TEXT_CASES,
  autoRoot,
  bestOn,
  colorPool,
  contrast,
  hexToRgb,
  linkOf,
  paletteNotes,
  rating,
  rgbToHex,
  rootEntries,
  rootHex,
  rootToCss,
  varsFor,
  withAlpha,
  type PoolGroup,
  type PoolMode,
  type RootValues,
  type RootVar,
  type RootVarName,
  type TemplateId,
  type TextCase,
} from "./lib/color";
import {
  DEFAULT_FONT,
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  FONT_PAIRS,
  cssFamily,
  googleFontsUrl,
  pairFor,
  type FontChoice,
  type FontPair,
} from "./lib/fonts";
import { PALETTE_STORAGE_KEY, activeHex, savedRootValues } from "./lib/saved-root";

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
type Sample = { headline: string; text: string; button: string };
type Saved = {
  palette: Swatch[];
  sample: Sample;
  customized: boolean;
  mode?: PoolMode;
  font?: FontChoice;
  template?: TemplateId;
  /** Missing in data saved before the :root variables, which is re-assigned from the palette. */
  values?: RootValues;
  textCase?: TextCase;
};

const SAMPLE: Sample = {
  headline: "Build something people love",
  text: "A short paragraph to see how body text reads on this background at a normal size.",
  button: "Get started",
};

function loadSaved(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(PALETTE_STORAGE_KEY) ?? "null");
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
  const [template, setTemplate] = useState<TemplateId>(saved?.template ?? "visionary");
  const [textCase, setTextCase] = useState<TextCase>(saved?.textCase ?? "uppercase");
  const [values, setValues] = useState<RootValues>(() => savedRootValues(saved));
  const [customized, setCustomized] = useState(saved?.values ? saved.customized : false);
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
      localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify({ palette, values, sample, customized, mode, font, template, textCase } satisfies Saved));
    } catch {
      // storage unavailable; fine
    }
  }, [palette, values, sample, customized, mode, font, template, textCase]);

  const applyPalette = useCallback((next: Swatch[], keepAssignments: boolean) => {
    setPalette(next);
    if (!keepAssignments && activeHex(next).length) {
      setValues(autoRoot(activeHex(next), mode));
      setCustomized(false);
    }
  }, [mode]);

  /** Palette edits re-run the automatic assignment until colors have been set by hand. */
  const commitPalette = (next: Swatch[]) => applyPalette(next, customized);

  async function changeMode(next: PoolMode) {
    setMode(next);
    if (
      !customized ||
      (await askConfirm({ title: "Re-assign the variables for this option?", message: "Or keep the choices you set by hand.", confirmLabel: "Re-assign", cancelLabel: "Keep mine" }))
    ) {
      setValues(autoRoot(activeHex(palette), next));
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
    const keep =
      customized &&
      !(await askConfirm({ title: "Re-assign the variables from this screenshot?", message: "Or keep the assignments you set by hand.", confirmLabel: "Re-assign", cancelLabel: "Keep mine" }));
    applyPalette(extract(img, count), keep);
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

  function setVar(name: RootVarName, hex: string) {
    setValues((v) => ({ ...v, [name]: hex }));
    setCustomized(true);
  }

  /** Clears a hand-set color so the variable follows its link again. */
  function relinkVar(name: RootVarName) {
    setValues((v) => {
      const next = { ...v };
      delete next[name];
      return next;
    });
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
                disabled={!used.length} onClick={() => { autoVariant.current += 1; setValues(autoRoot(used, mode, autoVariant.current)); setCustomized(false); }}>
                ↻ Auto-assign
              </button>
              {palette.length > 0 && <CopyButton text={hexes.join(", ")} label="Copy" className="py-1.5 text-sm" />}
              {palette.length > 0 && (
                <button type="button" className={`${button} text-red-600`}
                  onClick={async () => {
                    if (await askConfirm({ title: "Remove all colors from the palette?", confirmLabel: "Clear", danger: true })) commitPalette([]);
                  }}>
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
            <legend className="mb-2 text-xs font-semibold">Variables may use</legend>
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

      {/* 3. Fonts (preview only) */}
      <FontPicker value={font} onChange={setFont} />

      {/* 4. Template, light and dark previews */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Template</h2>
          <div role="tablist" aria-label="Template" className="inline-flex rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={template === t.id} onClick={() => setTemplate(t.id)}
                className={`rounded px-2.5 py-1 font-medium ${template === t.id ? "bg-blue-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["light", "dark"] as const).map((side) => (
            <ThemePreview key={side} side={side} template={template} values={values} textCase={textCase} sample={sample} fonts={fonts} />
          ))}
        </div>
      </section>

      {/* 5. Every variable in the template's :root */}
      <VariablesPanel template={template} values={values} pool={pool} textCase={textCase}
        onTextCase={setTextCase} onSet={setVar} onRelink={relinkVar} />

      <CodePanel
        css={rootToCss(template, values, textCase)}
        json={JSON.stringify({ template, palette: hexes, used, variables: Object.fromEntries(rootEntries(template, values, textCase)) }, null, 2)}
      />
      <p className="text-xs text-zinc-500">
        Your palette and colors are saved in this browser. The screenshot isn’t stored. The{" "}
        <Link href="/code-editor" className="text-blue-600 hover:underline dark:text-blue-400">Code Editor</Link>{" "}
        preview uses these variables automatically.
      </p>
    </div>
  );
}

type Slot = { label: string; hint: string; value: string; set: (hex: string) => void };

function FontPicker({ value, onChange }: { value: FontChoice; onChange: (c: FontChoice) => void }) {
  const [category, setCategory] = useState(value.category);
  const pairs = FONT_PAIRS[category];
  useGoogleFonts(pairs);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Fonts <span className="font-normal text-zinc-500">(preview only, not exported)</span></h2>
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

/**
 * One theme on its main background. Buttons alternate: --accent-button on light, --accent-light on dark.
 * Button text uses whichever typography color reads better; on hover the fill clears, leaving an outline.
 */
function ThemePreview({ side, template, values, textCase, sample, fonts }: {
  side: "light" | "dark";
  template: TemplateId;
  values: RootValues;
  textCase: TextCase;
  sample: Sample;
  fonts: FontPair;
}) {
  const [forceHover, setForceHover] = useState(false);
  const v = (name: RootVarName) => rootHex(values, name, template);
  const isLight = side === "light";
  const bg = v(isLight ? "--primary-light-bg" : "--primary-dark-bg");
  const ink = v(isLight ? "--typography-dark" : "--typography-light");
  const fill = v(isLight ? "--accent-button" : "--accent-light");
  const label = bestOn(fill, [v("--typography-light"), v("--typography-dark")]);
  const hoverText = contrast(fill, bg) >= 3 ? fill : ink;
  const stateColor = isLight ? "dark" : "light";
  const hasAmenities = varsFor(template).some((x) => x.name === "--accent-ammenities");
  const amenityBg = v("--accent-ammenities"), amenityText = v("--typography-ammenities");
  const amenities = (className: string) => (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} style={{ fontFamily: cssFamily(fonts.body) }}>
      {["Pool", "Garage", "Waterfront"].map((a) => (
        <li key={a} className="px-2 py-1 text-[10px] font-bold leading-none tracking-wider"
          style={{ background: amenityBg, color: amenityText, textTransform: textCase }}>
          {a}
        </li>
      ))}
    </ul>
  );

  const checks = [
    { label: "Text", ratio: contrast(ink, bg) },
    { label: "Button", ratio: contrast(label, fill) },
    { label: "Button hover", ratio: contrast(hoverText, bg) },
    { label: "Card text", ratio: contrast(v("--typography-card"), v("--accent-card")) },
    { label: "Tag text", ratio: contrast(v("--typography-tag"), v("--accent-tag")) },
    ...(hasAmenities
      ? [
          { label: "Amenity text", ratio: contrast(amenityText, amenityBg) },
          { label: "Amenity on BG", ratio: contrast(amenityBg, bg) },
        ]
      : []),
  ];

  const buttonVars = {
    "--b-border": fill, "--b-fill": fill, "--b-text": label,
    "--h-border": fill, "--h-fill": "transparent", "--h-text": hoverText,
  } as React.CSSProperties;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex min-h-64 flex-1 flex-col gap-3 p-6 sm:p-8" style={{ background: bg }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70" style={{ color: ink }}>{isLight ? "Light" : "Dark"}</span>
        <h3 className="text-2xl leading-tight tracking-tight" style={{ color: ink, fontFamily: cssFamily(fonts.heading), fontWeight: fonts.heading.weight, textTransform: textCase }}>{sample.headline}</h3>
        <p className="text-sm leading-relaxed" style={{ color: ink, fontFamily: cssFamily(fonts.body), fontWeight: fonts.body.weight }}>{sample.text}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            style={forceHover ? { borderColor: fill, background: "transparent", color: hoverText, textTransform: textCase } : { ...buttonVars, textTransform: textCase }}
            className={`rounded-lg border-2 px-5 py-2.5 text-sm font-semibold transition-colors ${
              forceHover ? "" : "[background:var(--b-fill)] [border-color:var(--b-border)] [color:var(--b-text)] hover:[background:var(--h-fill)] hover:[border-color:var(--h-border)] hover:[color:var(--h-text)]"
            }`}
          >
            {sample.button}
          </button>
          {/* Inactive and active states, such as filter or tab buttons. */}
          <span className="border px-3 py-1.5 text-xs" style={{
            background: withAlpha(v(`--background-${stateColor}-inactive`), 0.1),
            borderColor: withAlpha(v(`--border-${stateColor}-inactive`), 0.3),
            color: ink, textTransform: textCase,
          }}>Inactive</span>
          <span className="border px-3 py-1.5 text-xs" style={{ borderColor: v(`--border-${stateColor}-active`), color: ink, textTransform: textCase }}>Active</span>
        </div>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          {/* Amenities look like the tag and can sit inside the card or outside it, depending on the element. */}
          <PropertyCard template={template} values={values} textCase={textCase} fonts={fonts}>
            {hasAmenities && amenities("mt-1")}
          </PropertyCard>
          {hasAmenities && amenities("sm:flex-col")}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={forceHover} onChange={(e) => setForceHover(e.target.checked)} className="accent-blue-600" />
          Preview button hover
        </label>
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
function PropertyCard({ template, values, textCase, fonts, children }: {
  template: TemplateId;
  values: RootValues;
  textCase: TextCase;
  fonts: FontPair;
  children?: React.ReactNode;
}) {
  const v = (name: RootVarName) => rootHex(values, name, template);
  return (
    <div className="w-full max-w-xs overflow-hidden" style={{ background: v("--accent-card"), color: v("--typography-card"), fontFamily: cssFamily(fonts.body) }}>
      <div className="relative flex aspect-[2/1] items-center justify-center bg-zinc-300 text-zinc-500">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m21 16-5-5-8 9" />
        </svg>
        <span className="absolute right-2 top-2 px-2 py-1 text-[10px] font-bold leading-none tracking-wider"
          style={{ background: v("--accent-tag"), color: v("--typography-tag"), textTransform: textCase }}>
          For sale
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3.5">
        <p className="text-2xl leading-none" style={{ fontFamily: cssFamily(fonts.heading), fontWeight: fonts.heading.weight }}>$289,000</p>
        <p className="text-xs font-bold leading-snug tracking-wide" style={{ textTransform: textCase }}>24557 Meadows Trail, Perry, MO 63462</p>
        <p className="text-[10px] tracking-wider opacity-90" style={{ textTransform: textCase }}>3 Beds | 2 Baths | 2,000 Sq.Ft.</p>
        {children}
      </div>
    </div>
  );
}

/** Every color in the template's :root, grouped. Linked ones follow their source until set by hand. */
function VariablesPanel({ template, values, pool, textCase, onTextCase, onSet, onRelink }: {
  template: TemplateId;
  values: RootValues;
  pool: PoolGroup[];
  textCase: TextCase;
  onTextCase: (c: TextCase) => void;
  onSet: (name: RootVarName, hex: string) => void;
  onRelink: (name: RootVarName) => void;
}) {
  const vars = varsFor(template);
  const groups = [...new Set(vars.map((x) => x.group))];
  const opacity = (x: RootVar) => (x.alpha === undefined ? "" : ` · ${x.alpha * 100}%`);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold">Variables</h2>
        <span className="text-xs text-zinc-500">Linked colors follow their source. Pick a color to override one.</span>
        <label className="ml-auto flex items-center gap-1.5 font-mono text-[11px]">
          --text-case
          <select value={textCase} onChange={(e) => onTextCase(e.target.value as TextCase)}
            className="rounded-md border border-zinc-300 bg-background px-1.5 py-1 dark:border-zinc-700">
            {TEXT_CASES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group} className="min-w-0">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{group}</h3>
            <ul className="flex flex-col gap-0.5">
              {vars.filter((x) => x.group === group).map((x) => {
                const link = linkOf(x, template);
                const overridden = !!link && !!values[x.name];
                const hex = rootHex(values, x.name, template);
                const hint = link && !overridden ? `= ${link}${opacity(x)}` : `${hex}${opacity(x)}`;
                return (
                  <li key={x.name} className="flex items-center gap-1">
                    <ColorSlot slot={{ label: x.name, hint, value: hex, set: (c) => onSet(x.name, c) }} pool={pool} />
                    {overridden && (
                      <button type="button" onClick={() => onRelink(x.name)} aria-label={`Link ${x.name} to ${link} again`}
                        title={`Link to ${link} again`}
                        className="shrink-0 rounded px-1.5 py-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400">
                        Relink
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const POPOVER_WIDTH = 224;
const GAP = 6;

function ColorSlot({ slot, pool }: { slot: Slot; pool: PoolGroup[] }) {
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
    const left = Math.max(8, Math.min(t.left, vw - POPOVER_WIDTH - 8));
    const below = t.bottom + GAP;
    const above = t.top - GAP - h;
    const top = below + h <= vh - 8 || above < 8 ? Math.min(below, Math.max(8, vh - h - 8)) : above;
    setPos({ top, left });
  }, []);

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
        className="group flex w-full items-center gap-2 rounded-md p-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
      >
        <span className="h-7 w-7 shrink-0 rounded border border-black/15 ring-blue-500 group-aria-expanded:ring-2"
          style={{ background: slot.value }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] leading-tight">{slot.label}</span>
          <span className="block truncate text-[10px] leading-tight text-zinc-500">{slot.hint}</span>
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popover}
            role="dialog"
            aria-label={`Choose ${slot.label} color`}
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPOVER_WIDTH }}
            className="manga-menu manga-dark z-[80] p-2 text-foreground"
          >
            <p className="mb-1.5 flex justify-between text-[11px] font-medium">
              {slot.label}
              <span className="font-mono text-zinc-500">{slot.value}</span>
            </p>
            <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.label}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{g.label}</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {g.colors.map((hex) => (
                      <button key={hex} type="button" title={hex} aria-label={`Use ${hex}`} onClick={() => choose(hex)}
                        className={swatchClass(hex === slot.value)} style={{ background: hex }} />
                    ))}
                  </div>
                </div>
              ))}
              {!groups.length && <p className="text-xs text-zinc-500">No palette yet; add a screenshot or hex codes, or use a custom color.</p>}
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-800">
              <input type="color" value={slot.value} onChange={(e) => slot.set(e.target.value)}
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
    line.split(/(#[0-9a-f]{6}\b)/gi).map((part, k) =>
      /^#[0-9a-f]{6}$/i.test(part) ? (
        <span key={k} className="whitespace-nowrap">
          <span className="mr-1 inline-block h-2.5 w-2.5 translate-y-px rounded-sm border border-black/20 align-baseline"
            style={{ background: part }} aria-hidden />
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
              {t === "css" ? "CSS :root" : "JSON"}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-500">Updates live as you change colors.</span>
        <CopyButton key={tab} text={code} label={tab === "css" ? "Copy CSS" : "Copy JSON"} className="ml-auto py-1.5 text-xs" />
      </div>
      <pre aria-label={tab === "css" ? "CSS variables" : "JSON"} tabIndex={0}
        className="max-h-80 overflow-auto bg-[var(--paper)] p-3 font-mono text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
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
