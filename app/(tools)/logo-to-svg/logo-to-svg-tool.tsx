"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CopyButton from "@/components/copy-button";
import { formatBytes } from "../folder-thumbnails/lib/scan";
import type { TraceOptions, TraceRequest, TraceResponse } from "./lib/trace.worker";

type Source = { name: string; url: string; img: HTMLImageElement };
type Result = { svg: string; paths: number; colors: string[]; ms: number };

const DEFAULTS: TraceOptions = {
  mode: "multi",
  threshold: 128,
  invert: false,
  fill: "#111827",
  colors: 4,
  detail: 7,
  simplify: 20,
  smooth: true,
  removeBackground: true,
  decimals: 1,
};
const MAX_WIDTH = 2000;
const LARGE_BYTES = 300 * 1024;
const MANY_PATHS = 1500;

/** Checkerboard so transparent areas are visible. */
const checker: React.CSSProperties = {
  backgroundImage:
    "conic-gradient(rgb(0 0 0 / 0.06) 25%, transparent 0 50%, rgb(0 0 0 / 0.06) 0 75%, transparent 0)",
  backgroundSize: "16px 16px",
};

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function loadImage(blob: Blob, name: string): Promise<Source> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ name, url, img });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image the browser can read."));
    };
    img.src = url;
  });
}

/** Pixels of the source scaled to `width`, which is also the SVG's coordinate width. */
function imageDataAt(img: HTMLImageElement, width: number): ImageData {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

const label = "flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";
const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default function LogoToSvgTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [options, setOptions] = useState<TraceOptions>(DEFAULTS);
  const [width, setWidth] = useState(800);
  const [result, setResult] = useState<Result | null>(null);
  const [tracing, setTracing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [code, setCode] = useState("");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(false);
  // Settings at the moment hand-editing began, to tell when they have changed since.
  const [editBase, setEditBase] = useState<{ options: TraceOptions; width: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  const worker = useRef<Worker | null>(null);
  const busy = useRef(false);
  const requestId = useRef(0);
  const started = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof TraceOptions>(key: K, value: TraceOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const openFile = useCallback(async (blob: Blob, name: string) => {
    if (!blob.type.startsWith("image/")) {
      setError("Please choose a PNG or JPG image.");
      return;
    }
    try {
      const next = await loadImage(blob, name);
      setSource((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return next;
      });
      setWidth(Math.min(next.img.naturalWidth, 1200));
      setEdited(false);
      setEditing(false);
      setEditBase(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Let text fields paste normally (the target can also be the document itself).
      if (e.target instanceof Element && e.target.closest("textarea, input")) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void openFile(file, "pasted-logo.png");
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [openFile]);

  const startWorker = useCallback(() => {
    const w = new Worker(new URL("./lib/trace.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<TraceResponse>) => {
      if (e.data.id !== requestId.current) return; // a newer trace superseded this one
      busy.current = false;
      setTracing(false);
      if (!e.data.ok) {
        setError(`Tracing failed: ${e.data.error}`);
        return;
      }
      const { svg, paths, colors } = e.data;
      setResult({ svg, paths, colors, ms: Math.round(performance.now() - started.current) });
      setCode(svg);
      setError(null);
    };
    w.onerror = () => {
      busy.current = false;
      setTracing(false);
      setError("The tracer crashed on this image. Try a smaller width or fewer colors.");
    };
    worker.current = w;
    return w;
  }, []);

  useEffect(() => () => worker.current?.terminate(), []);

  // Re-trace (debounced) when the image or any option changes, unless the user is hand-editing the code.
  useEffect(() => {
    if (!source) return;
    if (edited) return;
    const t = setTimeout(() => {
      // A trace still running is for old settings: stop it rather than wait.
      if (busy.current && worker.current) {
        worker.current.terminate();
        worker.current = null;
      }
      const w = worker.current ?? startWorker();
      const image = imageDataAt(source.img, width);
      const id = ++requestId.current;
      busy.current = true;
      started.current = performance.now();
      setTracing(true);
      w.postMessage({ id, image, options } satisfies TraceRequest, [image.data.buffer]);
    }, 350);
    return () => clearTimeout(t);
    // `edited` is read, not a trigger: editing alone shouldn't re-trace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, options, width, startWorker]);

  // Preview renders the current code (traced or hand-edited) as an image, so scripts in it can't run.
  useEffect(() => {
    if (!code) return;
    const t = setTimeout(() => {
      const url = URL.createObjectURL(new Blob([code], { type: "image/svg+xml" }));
      setPreviewBroken(false);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    }, edited ? 250 : 0);
    return () => clearTimeout(t);
  }, [code, edited]);

  function discardEdits() {
    setEdited(false);
    setEditing(false);
    setEditBase(null);
    setOptions((o) => ({ ...o })); // re-trigger the trace
  }

  async function downloadPng() {
    if (!previewUrl) return;
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("The SVG code has errors, so it can't be rendered."));
        img.src = previewUrl;
      });
      const vb = code.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
      const w = Math.round(Number(vb?.[1]) || img.naturalWidth || width);
      const h = Math.round(Number(vb?.[2]) || img.naturalHeight || width);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => b && saveBlob(b, `${baseName}-preview.png`), "image/png");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const baseName = source?.name.replace(/\.[^.]+$/, "") || "logo";
  const bytes = new Blob([code]).size;
  const pathCount = edited ? (code.match(/<path\b/g)?.length ?? 0) : (result?.paths ?? 0);
  const tooBig = bytes > LARGE_BYTES || pathCount > MANY_PATHS;
  const staleEdits = edited && !!editBase && (editBase.options !== options || editBase.width !== width);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void openFile(f, f.name);
        }}
        className={`flex flex-wrap items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 text-center text-sm transition-colors ${
          source ? "py-3" : "py-10"
        } ${dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-300 dark:border-zinc-700"}`}
      >
        <span className="text-zinc-600 dark:text-zinc-400">
          {source ? `${source.name} · ${source.img.naturalWidth}×${source.img.naturalHeight}` : "Drop a PNG or JPG logo here, paste it with Ctrl+V, or"}
        </span>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
        >
          {source ? "Choose another" : "Choose image"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void openFile(f, f.name);
          }}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {source && (
        <>
          <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-3">
              <div role="radiogroup" aria-label="Mode" className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
                {(["single", "multi"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={options.mode === m}
                    onClick={() => set("mode", m)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      options.mode === m ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {m === "single" ? "Single color" : "Multi-color"}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-500">
                {options.mode === "single" ? "Potrace: crisp one-color shapes." : "ImageTracer: one layer per color."}
              </span>
              <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
                {tracing ? "Tracing…" : result ? `Traced in ${result.ms} ms` : ""}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {options.mode === "single" ? (
                <>
                  <label className={label}>
                    Threshold: {options.threshold}
                    <input type="range" min={1} max={254} value={options.threshold} onChange={(e) => set("threshold", Number(e.target.value))} />
                  </label>
                  <label className={label}>
                    Fill color
                    <span className="flex items-center gap-2">
                      <input type="color" value={options.fill} onChange={(e) => set("fill", e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-transparent dark:border-zinc-700" />
                      <code className="text-xs">{options.fill}</code>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 self-end pb-1 text-sm">
                    <input type="checkbox" checked={options.invert} onChange={(e) => set("invert", e.target.checked)} className="h-4 w-4 accent-blue-600" />
                    Light logo on dark background
                  </label>
                </>
              ) : (
                <>
                  <label className={label}>
                    Number of colors: {options.colors}
                    <input type="range" min={2} max={16} value={options.colors} onChange={(e) => set("colors", Number(e.target.value))} />
                  </label>
                  <label className={label}>
                    Detail: {options.detail}
                    <input type="range" min={1} max={10} value={options.detail} onChange={(e) => set("detail", Number(e.target.value))} />
                  </label>
                </>
              )}
              <label className={label}>
                Simplify: {options.simplify}
                <input type="range" min={0} max={100} value={options.simplify} onChange={(e) => set("simplify", Number(e.target.value))} />
              </label>
              <label className={label}>
                Width (px)
                <input
                  type="number"
                  min={16}
                  max={MAX_WIDTH}
                  value={width}
                  onChange={(e) => setWidth(Math.min(MAX_WIDTH, Math.max(16, Number(e.target.value) || 16)))}
                  className="rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm text-foreground dark:border-zinc-700"
                />
              </label>
              <label className={label}>
                Coordinate decimals
                <select
                  value={options.decimals}
                  onChange={(e) => set("decimals", Number(e.target.value))}
                  className="rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm text-foreground dark:border-zinc-700"
                >
                  <option value={0}>0 (smallest)</option>
                  <option value={1}>1</option>
                  <option value={2}>2 (most precise)</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-1 text-sm">
                <input type="checkbox" checked={options.smooth} onChange={(e) => set("smooth", e.target.checked)} className="h-4 w-4 accent-blue-600" />
                Smooth curves
              </label>
              <label className="flex items-center gap-2 self-end pb-1 text-sm">
                <input type="checkbox" checked={options.removeBackground} onChange={(e) => set("removeBackground", e.target.checked)} className="h-4 w-4 accent-blue-600" />
                Remove background
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              Width sets both the SVG’s coordinate size and the tracing resolution: larger is more detailed but slower.
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <figure className="flex flex-col gap-2">
              <figcaption className="text-xs font-medium text-zinc-500">Original</figcaption>
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" style={checker}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview */}
                <img src={source.url} alt="Original logo" className="max-h-full max-w-full object-contain" />
              </div>
            </figure>
            <figure className="flex flex-col gap-2">
              <figcaption className="flex items-center justify-between text-xs font-medium text-zinc-500">
                SVG result{edited && <span className="text-amber-600">showing your edited code</span>}
              </figcaption>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-zinc-200 p-3 dark:border-zinc-800" style={checker}>
                {previewUrl && !previewBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob: preview of the SVG
                  <img src={previewUrl} alt="Traced SVG" onError={() => setPreviewBroken(true)} className="max-h-full max-w-full object-contain" />
                ) : (
                  <p className="text-sm text-zinc-500">{previewBroken ? "The SVG code has errors and can’t be displayed." : "Tracing…"}</p>
                )}
                {tracing && result && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">Updating…</span>
                )}
              </div>
            </figure>
          </div>

          {code && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span>
                  <strong>{pathCount.toLocaleString()}</strong> path{pathCount === 1 ? "" : "s"}
                </span>
                <span>
                  <strong>{formatBytes(bytes)}</strong>
                </span>
                {!edited && result && result.colors.length > 0 && (
                  <span className="flex items-center gap-1">
                    {result.colors.map((c) => (
                      <span key={c} title={c} className="h-4 w-4 rounded border border-black/10" style={{ background: c }} />
                    ))}
                  </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <CopyButton text={code} label="Copy SVG code" className="py-2 text-sm" />
                  <button type="button" onClick={() => saveBlob(new Blob([code], { type: "image/svg+xml" }), `${baseName}.svg`)} className={button}>
                    ⬇ .svg
                  </button>
                  <button type="button" onClick={downloadPng} disabled={previewBroken} className={button}>
                    ⬇ .png preview
                  </button>
                </div>
              </div>

              {tooBig && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  This SVG is large ({formatBytes(bytes)}, {pathCount.toLocaleString()} paths). Try{" "}
                  {options.mode === "multi" ? "fewer colors, lower detail, " : ""}more simplification, fewer decimals, or a smaller width.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">SVG code</span>
                <div className="flex items-center gap-2 text-xs">
                  {staleEdits && (
                    <span className="text-amber-600">Options changed. Your edits are kept until you re-trace.</span>
                  )}
                  {edited && (
                    <button type="button" onClick={discardEdits} className={`${button} py-1 text-xs`}>
                      ↻ Discard edits & re-trace
                    </button>
                  )}
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} className="accent-blue-600" />
                    Edit code
                  </label>
                </div>
              </div>
              <textarea
                value={code}
                readOnly={!editing}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (!edited) setEditBase({ options, width });
                  setEdited(true);
                }}
                spellCheck={false}
                aria-label="SVG code"
                className={`h-72 w-full resize-y rounded-xl border border-zinc-200 p-3 font-mono text-xs leading-relaxed outline-none dark:border-zinc-800 ${
                  editing ? "bg-background focus:border-blue-500" : "bg-zinc-50 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
                }`}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
