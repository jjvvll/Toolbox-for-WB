"use client";

import { useEffect, useRef, useState } from "react";
import { renderPdfCover, type CoverFormat } from "@/lib/render-pdf-cover";

type Item = {
  id: string;
  file: File;
  format: CoverFormat;
  status: "queued" | "rendering" | "done" | "error";
  url?: string;
  width?: number;
  height?: number;
  pageCount?: number;
  error?: string;
};

const EXTENSIONS: Record<CoverFormat, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function outputName(file: File, format: CoverFormat) {
  return `${file.name.replace(/\.pdf$/i, "")}-cover.${EXTENSIONS[format]}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export default function PdfCoverTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [scale, setScale] = useState(2);
  const [format, setFormat] = useState<CoverFormat>("image/png");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef(Promise.resolve());
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function addFiles(fileList: FileList | null) {
    const pdfs = Array.from(fileList ?? []).filter(
      (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
    );
    if (!pdfs.length) return;

    const added = pdfs.map((file) => ({
      id: crypto.randomUUID(),
      file,
      format,
      status: "queued" as const,
    }));
    setItems((prev) => [...prev, ...added]);

    // Render one at a time so a large batch doesn't exhaust memory.
    const options = { scale, format };
    for (const item of added) {
      queue.current = queue.current.then(async () => {
        update(item.id, { status: "rendering" });
        try {
          const { blob, ...info } = await renderPdfCover(item.file, options);
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          update(item.id, { status: "done", url, ...info });
        } catch (err) {
          update(item.id, {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }
  }

  function remove(id: string) {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it?.url) {
        URL.revokeObjectURL(it.url);
        urls.current.delete(it.url);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearAll() {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    setItems([]);
  }

  async function downloadAll() {
    for (const it of items) {
      if (it.status !== "done" || !it.url) continue;
      triggerDownload(it.url, outputName(it.file, it.format));
      // Browsers drop rapid-fire downloads; space them out a little.
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const busy = items.some((i) => i.status === "queued" || i.status === "rendering");

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drag & drop PDFs here, or
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Choose PDFs
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Scale
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-background px-2 py-1 dark:border-zinc-700"
          >
            {[1, 1.5, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as CoverFormat)}
            className="rounded-md border border-zinc-300 bg-background px-2 py-1 dark:border-zinc-700"
          >
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPEG</option>
          </select>
        </label>
        <span className="text-zinc-500">Applies to newly added files.</span>

        {items.length > 0 && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={downloadAll}
              disabled={doneCount === 0}
              className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Download all ({doneCount})
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex aspect-[3/4] items-center justify-center bg-zinc-100 dark:bg-zinc-900">
                {it.status === "done" && it.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: URL preview
                  <img
                    src={it.url}
                    alt={`Page 1 of ${it.file.name}`}
                    className="h-full w-full object-contain"
                  />
                ) : it.status === "error" ? (
                  <p className="px-4 text-center text-sm text-red-600">{it.error}</p>
                ) : (
                  <p className="text-sm text-zinc-500">
                    {it.status === "rendering" ? "Rendering…" : "Queued"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={it.file.name}>
                    {it.file.name}
                  </p>
                  {it.status === "done" && (
                    <p className="text-xs text-zinc-500">
                      {it.width}×{it.height}px · {it.pageCount} page
                      {it.pageCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                {it.status === "done" && it.url && (
                  <button
                    type="button"
                    onClick={() => triggerDownload(it.url!, outputName(it.file, it.format))}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Download
                  </button>
                )}
                {it.status !== "queued" && it.status !== "rendering" && (
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    aria-label={`Remove ${it.file.name}`}
                    className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
