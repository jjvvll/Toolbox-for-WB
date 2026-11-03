"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { detectFaces, preloadDetector, type Face } from "./lib/detect";
import { drawExtended, edgeColor, fillOf, headBox, isInsideImage, makeFraming, type Rect } from "./lib/frame";

type Source = { name: string; url: string; img: HTMLImageElement; edge: string };
type Shape = "square" | "circle";
type Format = "jpeg" | "png";
type Fill = { mode: "blur" | "color"; color: string };

const ASPECTS = [
  { id: "1:1", label: "1:1 Square", value: 1 },
  { id: "4:5", label: "4:5 Portrait", value: 4 / 5 },
  { id: "3:4", label: "3:4 Portrait", value: 3 / 4 },
] as const;
type AspectId = (typeof ASPECTS)[number]["id"];

const SIZES = [256, 400, 800, 1080];

const label = "flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";
const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const select =
  "rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm text-foreground disabled:opacity-60 dark:border-zinc-700";
const segment = (on: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    on ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;

/** Hatching for the parts of the editor outside the photo. */
const hatch: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(45deg, rgb(127 127 127 / 0.25) 0 6px, transparent 6px 12px)",
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
    img.onload = () => resolve({ name, url, img, edge: edgeColor(img) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image the browser can read."));
    };
    img.src = url;
  });
}

/** Draw the crop into `canvas` at the requested output width. */
function render(canvas: HTMLCanvasElement, img: HTMLImageElement, crop: Rect, width: number, shape: Shape, format: Format, fill: Fill) {
  const w = Math.round(width);
  const h = Math.round(width / (crop.w / crop.h));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.clip();
  } else if (format === "jpeg") {
    ctx.fillStyle = "#ffffff"; // JPG has no transparency
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = "high";

  if (!isInsideImage(crop, img.naturalWidth, img.naturalHeight)) {
    // The frame runs past the photo: fill the gap behind it.
    if (fill.mode === "color") {
      ctx.fillStyle = fill.color;
      ctx.fillRect(0, 0, w, h);
    } else {
      const bg = document.createElement("canvas");
      bg.width = w;
      bg.height = h;
      drawExtended(bg.getContext("2d")!, img, crop, w, h);
      ctx.filter = `blur(${Math.max(4, w * 0.03)}px)`;
      // Draw slightly oversized so the blur doesn't fade in from the canvas edges.
      const p = w * 0.08;
      ctx.drawImage(bg, -p, -p, w + 2 * p, h + 2 * p);
      ctx.filter = "none";
    }
  }

  // The sharp photo, clipped to where it actually exists.
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const x0 = Math.max(0, crop.x);
  const y0 = Math.max(0, crop.y);
  const x1 = Math.min(W, crop.x + crop.w);
  const y1 = Math.min(H, crop.y + crop.h);
  const s = w / crop.w;
  if (x1 > x0 && y1 > y0) {
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, (x0 - crop.x) * s, (y0 - crop.y) * s, (x1 - x0) * s, (y1 - y0) * s);
  }
  ctx.restore();
}

export default function HeadshotTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [faces, setFaces] = useState<Face[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [selected, setSelected] = useState(0);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [aspectId, setAspectId] = useState<AspectId>("1:1");
  const [shape, setShape] = useState<Shape>("square");
  const [size, setSize] = useState(800);
  const [format, setFormat] = useState<Format>("jpeg");
  const [fill, setFill] = useState<Fill>({ mode: "blur", color: "#ffffff" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const avatars = useRef<(HTMLCanvasElement | null)[]>([]);
  const drag = useRef<{ px: number; py: number; start: Rect } | null>(null);
  const loadId = useRef(0);

  const aspectOf = (s: Shape, id: AspectId) => (s === "circle" ? 1 : ASPECTS.find((a) => a.id === id)!.value);
  const aspect = aspectOf(shape, aspectId);
  const imgW = source?.img.naturalWidth ?? 1;
  const imgH = source?.img.naturalHeight ?? 1;
  const face = faces?.[selected];
  const head = face ? headBox(face) : null;
  const framing = makeFraming(imgW, imgH, head, aspect, shape === "circle");
  const { view } = framing;

  useEffect(() => preloadDetector(), []);

  async function openFile(blob: Blob, name: string) {
    if (!blob.type.startsWith("image/")) {
      setError("Please choose a JPG, PNG, or WebP photo.");
      return;
    }
    const id = ++loadId.current;
    try {
      const next = await loadImage(blob, name);
      if (id !== loadId.current) return;
      const { naturalWidth: W, naturalHeight: H } = next.img;
      setSource((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return next;
      });
      setError(null);
      setNotice(null);
      setFaces(null);
      setSelected(0);
      setFill((f) => ({ ...f, color: next.edge }));
      setCrop(makeFraming(W, H, null, aspect, shape === "circle").auto());
      setDetecting(true);
      try {
        const found = await detectFaces(next.img);
        if (id !== loadId.current) return;
        setFaces(found);
        if (found.length) setCrop(makeFraming(W, H, headBox(found[0]), aspect, shape === "circle").auto());
        else setNotice("No face found. Drag the frame and use the zoom slider to crop by hand.");
      } catch (err) {
        if (id !== loadId.current) return;
        console.error(err);
        setFaces([]);
        setNotice("Couldn't load the face detector (are you offline?). You can still crop by hand.");
      } finally {
        if (id === loadId.current) setDetecting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Paste an image from the clipboard anywhere on the page.
  const openPasted = useEffectEvent((file: File) => void openFile(file, "pasted-photo.png"));
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest("textarea, input")) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        openPasted(file);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // Live preview at a fixed small size; the download re-renders at full size.
  useEffect(() => {
    if (!source || !crop || !preview.current) return;
    const big = preview.current;
    render(big, source.img, crop, 480, shape, format, fill);
    // Small round thumbnails, the way most sites display a profile photo.
    for (const c of avatars.current) {
      if (!c) continue;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      const side = Math.min(big.width, big.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(big, (big.width - side) / 2, (big.height - side) / 2, side, side, 0, 0, c.width, c.height);
    }
  }, [source, crop, shape, format, fill]);

  /** Switch aspect ratio, keeping the head as large in the frame as it was. */
  function changeAspect(nextShape: Shape, nextId: AspectId) {
    setShape(nextShape);
    setAspectId(nextId);
    if (!crop) return;
    const a = aspectOf(nextShape, nextId);
    const next = makeFraming(imgW, imgH, head, a, nextShape === "circle");
    setCrop(
      framing.head
        ? next.auto(fillOf(framing.head, crop))
        : next.constrain({ x: crop.x + crop.w / 2 - (crop.h * a) / 2, y: crop.y, w: crop.h * a, h: crop.h }),
    );
  }

  function chooseFace(i: number) {
    const f = faces?.[i];
    if (!f) return;
    setSelected(i);
    setCrop(makeFraming(imgW, imgH, headBox(f), aspect, shape === "circle").auto());
  }

  // Zoom: 1 = loosest crop allowed, higher = tighter (never tighter than the head).
  const zoom = crop ? framing.maxH / crop.h : 1;
  const maxZoom = Math.max(1, framing.maxH / framing.minH);
  function setZoom(z: number) {
    if (!crop) return;
    setCrop(framing.resize(crop, framing.maxH / Math.min(maxZoom, Math.max(1, z))));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, start: crop };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box) return;
    const k = view.w / box.width; // screen px → image px
    setCrop(framing.constrain({ ...d.start, x: d.start.x + (e.clientX - d.px) * k, y: d.start.y + (e.clientY - d.py) * k }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  // Wheel to zoom over the editor (needs a non-passive listener to stop page scroll).
  const wheelZoom = useEffectEvent((deltaY: number) => setZoom(zoom * (deltaY < 0 ? 1.08 : 1 / 1.08)));
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelZoom(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [source]);

  function download() {
    if (!source || !crop) return;
    const fmt: Format = shape === "circle" ? "png" : format;
    const canvas = document.createElement("canvas");
    render(canvas, source.img, crop, size, shape, fmt, fill);
    const base = source.name.replace(/\.[^.]+$/, "") || "photo";
    canvas.toBlob(
      (b) => b && saveBlob(b, `${base}-headshot.${fmt === "jpeg" ? "jpg" : "png"}`),
      `image/${fmt}`,
      0.92,
    );
  }

  /** Position a rect (in image px) inside the editor, which shows `view`. */
  const place = (r: Rect): React.CSSProperties => ({
    left: `${((r.x - view.x) / view.w) * 100}%`,
    top: `${((r.y - view.y) / view.h) * 100}%`,
    width: `${(r.w / view.w) * 100}%`,
    height: `${(r.h / view.h) * 100}%`,
  });
  const outH = Math.round(size / aspect);
  const padded = !!crop && !isInsideImage(crop, imgW, imgH);

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
          {source ? `${source.name} · ${imgW}×${imgH}` : "Drop a photo here, paste it with Ctrl+V, or"}
        </span>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
        >
          {source ? "Choose another" : "Choose photo"}
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
      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </p>
      )}

      {source && crop && (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-xs font-medium text-zinc-500">
              <span>Drag the frame to move it · scroll or use the slider to zoom</span>
              <span aria-live="polite" className="shrink-0">
                {detecting
                  ? "Finding faces…"
                  : faces && faces.length > 1
                    ? `${faces.length} faces · click one to switch`
                    : faces?.length === 1
                      ? "Face found"
                      : ""}
              </span>
            </div>
            <div className="flex justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
              <div
                ref={stage}
                className="relative touch-none select-none overflow-hidden"
                style={{ ...hatch, aspectRatio: `${view.w} / ${view.h}`, width: `min(100%, ${(60 * view.w) / view.h}vh)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview */}
                <img
                  src={source.url}
                  alt="Uploaded photo"
                  draggable={false}
                  className="absolute"
                  style={place({ x: 0, y: 0, w: imgW, h: imgH })}
                />

                {/* The area the frame is never allowed to cut into */}
                {framing.head && (
                  <div
                    className="pointer-events-none absolute z-20 rounded-[45%] border border-dashed border-white/80"
                    style={place(framing.head)}
                  />
                )}

                {faces && faces.length > 1 &&
                  faces.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => chooseFace(i)}
                      title={`Face ${i + 1}`}
                      className={`absolute z-30 rounded-md border-2 ${
                        i === selected ? "border-blue-400" : "border-white/70 hover:border-white"
                      }`}
                      style={place(f)}
                    />
                  ))}

                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  className={`absolute z-10 cursor-move border-2 border-white ${shape === "circle" ? "rounded-full" : ""}`}
                  style={{ ...place(crop), boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}
                >
                  {/* Rule-of-thirds guides */}
                  <div className="pointer-events-none absolute inset-0 opacity-40">
                    <div className="absolute inset-y-0 left-1/3 border-l border-white" />
                    <div className="absolute inset-y-0 left-2/3 border-l border-white" />
                    <div className="absolute inset-x-0 top-1/3 border-t border-white" />
                    <div className="absolute inset-x-0 top-2/3 border-t border-white" />
                  </div>
                </div>
              </div>
            </div>
            {framing.head && (
              <p className="text-[11px] text-zinc-500">
                The dashed outline is the head (hair and ears included). The frame always keeps it fully inside.
              </p>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            <figure className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <canvas
                ref={preview}
                className={`w-48 shadow-sm ${shape === "circle" ? "rounded-full" : "rounded-lg"}`}
                aria-label="Headshot preview"
              />
              {/* How it reads at typical avatar sizes */}
              <div className="flex items-end gap-3">
                {[64, 40, 28].map((px, i) => (
                  <canvas
                    key={px}
                    ref={(el) => {
                      avatars.current[i] = el;
                    }}
                    width={px * 2}
                    height={px * 2}
                    className="rounded-full"
                    style={{ width: px, height: px }}
                    aria-hidden
                  />
                ))}
              </div>
              <figcaption className="text-xs text-zinc-500">
                {size}×{outH} {shape === "circle" ? "PNG" : format === "jpeg" ? "JPG" : "PNG"}
              </figcaption>
            </figure>

            <label className={label}>
              Zoom
              <input
                type="range"
                min={1}
                max={maxZoom}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>

            <div className={label}>
              Shape
              <div role="radiogroup" aria-label="Shape" className="inline-flex self-start rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
                {(["square", "circle"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={shape === s}
                    onClick={() => changeAspect(s, aspectId)}
                    className={segment(shape === s)}
                  >
                    {s === "square" ? "Rectangle" : "Circle"}
                  </button>
                ))}
              </div>
            </div>

            {shape === "square" && (
              <label className={label}>
                Aspect ratio
                <select value={aspectId} onChange={(e) => changeAspect(shape, e.target.value as AspectId)} className={select}>
                  {ASPECTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {padded && (
              <div className={label}>
                Fill beyond the photo’s edge
                <div className="flex items-center gap-2">
                  <select
                    value={fill.mode}
                    onChange={(e) => setFill((f) => ({ ...f, mode: e.target.value as Fill["mode"] }))}
                    className={select}
                  >
                    <option value="blur">Blurred edges</option>
                    <option value="color">Solid color</option>
                  </select>
                  {fill.mode === "color" && (
                    <input
                      type="color"
                      value={fill.color}
                      onChange={(e) => setFill((f) => ({ ...f, color: e.target.value }))}
                      aria-label="Fill color"
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-transparent dark:border-zinc-700"
                    />
                  )}
                </div>
                <span className="text-[11px] font-normal text-zinc-500">
                  The head is too close to the photo’s edge to center it without extending the background.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                Width (px)
                <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={select}>
                  {SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Format
                <select
                  value={shape === "circle" ? "png" : format}
                  disabled={shape === "circle"}
                  onChange={(e) => setFormat(e.target.value as Format)}
                  className={select}
                >
                  <option value="jpeg">JPG</option>
                  <option value="png">PNG</option>
                </select>
              </label>
            </div>
            {shape === "circle" && (
              <p className="-mt-2 text-[11px] text-zinc-500">Circle exports as PNG with transparent corners.</p>
            )}
            {crop.w < size && (
              <p className="-mt-2 text-[11px] text-amber-600">
                The crop is only {Math.round(crop.w)}px wide, so it will be upscaled.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                ⬇ Download headshot
              </button>
              <button type="button" onClick={() => setCrop(framing.auto())} className={button} disabled={detecting}>
                ↻ Auto-frame
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
