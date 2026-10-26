"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoverFormat } from "@/lib/render-pdf-cover";
import {
  coverNames,
  emptyReport,
  filesFromInput,
  formatBytes,
  scanDirectoryHandle,
  supportsDirectoryPicker,
  type MediaFile,
  type ScanReport,
} from "./lib/scan";
import {
  ThumbError,
  pdfThumbnail,
  videoThumbnail,
  type CapturePoint,
  type ThumbOptions,
} from "./lib/thumbnails";

type Item = MediaFile & {
  status: "queued" | "working" | "done" | "error";
  url?: string;
  blob?: Blob;
  width?: number;
  height?: number;
  error?: string;
  /** Settings the thumbnail was made with, to spot stale ones after a change. */
  optsKey?: string;
};

const CONCURRENCY = 2;
const PAGE_SIZE = 60;
const QUALITY = 0.85;
const FORMATS: { value: CoverFormat; label: string; ext: string }[] = [
  { value: "image/jpeg", label: "JPG", ext: "jpg" },
  { value: "image/webp", label: "WebP", ext: "webp" },
];
const WIDTHS = [640, 1280, 1920];
const CAPTURES: CapturePoint[] = ["1s", "10%", "25%"];

const keyOf = (o: ThumbOptions) => `${o.width}|${o.format}|${o.quality}|${o.capture}`;

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const selectClass =
  "rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm dark:border-zinc-700";
const secondaryButton =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

export default function FolderThumbnailsTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "zip 40%" / "saving 3/10"
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [report, setReport] = useState<ScanReport | null>(null);

  const [capture, setCapture] = useState<CapturePoint>("10%");
  const [width, setWidth] = useState(1280);
  const [format, setFormat] = useState<CoverFormat>("image/jpeg");
  const options: ThumbOptions = { width, format, quality: QUALITY, capture };
  const ext = FORMATS.find((f) => f.value === format)!.ext;

  const itemsRef = useRef<Item[]>([]);
  const optionsRef = useRef(options);
  const running = useRef(0);
  const generation = useRef(0);
  const scanSignal = useRef({ cancelled: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    optionsRef.current = options;
  });

  // itemsRef is the source of truth (the worker pool reads it synchronously);
  // every change goes through here so state and ref never disagree.
  const update = useCallback((fn: (list: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<Item>) =>
      update((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it))),
    [update],
  );

  // Lets a finished job start the next one without pump referring to itself.
  const pumpRef = useRef<() => void>(() => {});

  // Worker pool: keeps at most CONCURRENCY files decoding at once.
  const pump = useCallback(() => {
    const gen = generation.current;
    while (running.current < CONCURRENCY) {
      const next = itemsRef.current.find((it) => it.status === "queued");
      if (!next) return;
      const file = next.file;
      if (!file) {
        patch(next.id, { status: "error", error: next.readError ?? "This file couldn’t be opened." });
        continue;
      }
      running.current++;
      patch(next.id, { status: "working" });
      const opts = optionsRef.current;
      const job = next.kind === "video" ? videoThumbnail(file, opts) : pdfThumbnail(file, opts);
      job
        .then((thumb) => {
          if (gen !== generation.current) return;
          patch(next.id, {
            status: "done",
            blob: thumb.blob,
            url: URL.createObjectURL(thumb.blob),
            width: thumb.width,
            height: thumb.height,
            optsKey: keyOf(opts),
            error: undefined,
          });
        })
        .catch((err) => {
          if (gen !== generation.current) return;
          patch(next.id, {
            status: "error",
            error: err instanceof ThumbError ? err.message : `Couldn't create a thumbnail (${err instanceof Error ? err.message : String(err)}).`,
          });
        })
        .finally(() => {
          running.current--;
          if (gen === generation.current) setTimeout(() => pumpRef.current(), 0);
        });
    }
  }, [patch]);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  function reset() {
    generation.current++;
    scanSignal.current.cancelled = true;
    running.current = 0;
    for (const it of itemsRef.current) if (it.url) URL.revokeObjectURL(it.url);
    update(() => []);
    setMessage(null);
    setReport(null);
    setVisible(PAGE_SIZE);
  }

  function addFiles(files: MediaFile[]) {
    // Files that couldn't be opened during the scan get an error card straight away.
    const added: Item[] = files.map((f) =>
      f.file ? { ...f, status: "queued" } : { ...f, status: "error", error: f.readError },
    );
    update((list) => [...list, ...added]);
    pump();
  }

  async function openFolder() {
    if (!supportsDirectoryPicker()) {
      inputRef.current?.click();
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!({ id: "folder-thumbnails", mode: "read" });
    } catch {
      return; // picker cancelled
    }
    reset();
    const signal = { cancelled: false };
    scanSignal.current = signal;
    setRoot(handle);
    setFolderName(handle.name);
    setScanning(true);
    const scanReport = emptyReport();
    try {
      await scanDirectoryHandle(handle, addFiles, scanReport, signal);
    } catch (err) {
      setMessage({ kind: "error", text: `Couldn't read the whole folder: ${err instanceof Error ? err.message : err}` });
    } finally {
      if (!signal.cancelled) {
        setScanning(false);
        setReport(scanReport);
      }
    }
  }

  function onInputFiles(list: FileList | null) {
    if (!list?.length) return;
    reset();
    setRoot(null);
    const rel = list[0].webkitRelativePath;
    setFolderName(rel.includes("/") ? rel.split("/")[0] : "Selected files");
    const scanReport = emptyReport();
    const files = filesFromInput(list, scanReport);
    setReport(scanReport);
    addFiles(files);
  }

  function regenerate(only?: (it: Item) => boolean) {
    // Files that couldn't be opened can't be retried here; reopen the folder for those.
    const requeue = (it: Item) => !!it.file && it.status !== "working" && (!only || only(it));
    for (const it of itemsRef.current) if (requeue(it) && it.url) URL.revokeObjectURL(it.url);
    update((list) =>
      list.map((it) =>
        requeue(it) ? { ...it, status: "queued" as const, url: undefined, blob: undefined, error: undefined } : it,
      ),
    );
    pump();
  }

  // Lazy rendering: reveal more cards as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, visible]);

  // Release thumbnails when leaving the page.
  useEffect(() => () => {
    generation.current++;
    for (const it of itemsRef.current) if (it.url) URL.revokeObjectURL(it.url);
  }, []);

  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "error").length;
  const finished = done.length + failed;
  const processing = finished < items.length;
  const stale = done.some((i) => i.optsKey !== keyOf(options));
  const names = coverNames(items, ext);
  const canSaveToFolder = !!root && typeof root.requestPermission === "function" && done.length > 0;

  async function downloadZip() {
    setBusy("Preparing ZIP…");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const it of done) {
        const dir = it.path.slice(0, it.path.length - it.name.length);
        zip.file(dir + names.get(it.id)!, it.blob!);
      }
      // Images are already compressed, so just store them.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (m) =>
        setBusy(`Building ZIP… ${Math.round(m.percent)}%`),
      );
      saveBlob(blob, `${folderName ?? "thumbnails"}-covers.zip`);
    } catch (err) {
      setMessage({ kind: "error", text: `ZIP failed: ${err instanceof Error ? err.message : err}` });
    } finally {
      setBusy(null);
    }
  }

  async function saveIntoFolder() {
    if (!root?.requestPermission) return;
    const ok = window.confirm(
      `Write ${done.length} thumbnail${done.length === 1 ? "" : "s"} into “${root.name}”, next to each source file?\n\n` +
        `Each is named <file>-cover.${ext}. Existing files with those names are replaced.`,
    );
    if (!ok) return;
    if ((await root.requestPermission({ mode: "readwrite" })) !== "granted") {
      setMessage({ kind: "error", text: "Write permission was not granted, so nothing was saved." });
      return;
    }
    let saved = 0;
    const errors: string[] = [];
    for (const it of done) {
      setBusy(`Saving ${saved + errors.length + 1} of ${done.length}…`);
      try {
        const handle = await it.dir!.getFileHandle(names.get(it.id)!, { create: true });
        const writable = await handle.createWritable();
        await writable.write(it.blob!);
        await writable.close();
        saved++;
      } catch (err) {
        errors.push(`${it.path}: ${err instanceof Error ? err.message : err}`);
      }
    }
    setBusy(null);
    setMessage(
      errors.length
        ? { kind: "error", text: `Saved ${saved}; ${errors.length} failed. First error: ${errors[0]}` }
        : { kind: "ok", text: `Saved ${saved} thumbnail${saved === 1 ? "" : "s"} into “${root.name}”.` },
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span aria-hidden>🔒</span>
        Everything runs in your browser. Your videos and PDFs are read locally and never leave this device.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={openFolder}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          📁 Open folder
        </button>
        <input
          ref={(el) => {
            inputRef.current = el;
            // Not in React's types; lets the picker choose a whole folder.
            el?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            onInputFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Video frame at
          <select value={capture} onChange={(e) => setCapture(e.target.value as CapturePoint)} className={selectClass}>
            {CAPTURES.map((c) => (
              <option key={c} value={c}>
                {c === "1s" ? "1 second" : `${c} of duration`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Width
          <select value={width} onChange={(e) => setWidth(Number(e.target.value))} className={selectClass}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as CoverFormat)} className={selectClass}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} ({QUALITY * 100}%)
              </option>
            ))}
          </select>
        </label>
      </div>
      {!supportsDirectoryPicker() && (
        <p className="-mt-2 text-xs text-zinc-500">
          Your browser uses the basic folder picker, so “Save thumbnails into the folder” isn’t available. Use Chrome
          or Edge for that.
        </p>
      )}

      {folderName && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium">📁 {folderName}</span>
            <span className="text-zinc-500">
              {scanning ? `Scanning… ${items.length} found` : `${items.length} file${items.length === 1 ? "" : "s"}`}
              {items.length > 0 && ` · ${finished} of ${items.length} processed`}
              {failed > 0 && ` · ${failed} couldn’t be read`}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {stale && !processing && (
                <button type="button" onClick={() => regenerate()} className={secondaryButton}>
                  ↻ Apply new settings
                </button>
              )}
              <button type="button" onClick={downloadZip} disabled={!done.length || !!busy} className={secondaryButton}>
                ⬇ Download all as ZIP ({done.length})
              </button>
              {canSaveToFolder && (
                <button type="button" onClick={saveIntoFolder} disabled={!!busy || processing} className={secondaryButton}>
                  💾 Save thumbnails into the folder
                </button>
              )}
            </div>
          </div>
          {items.length > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={finished}>
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${(finished / items.length) * 100}%` }}
              />
            </div>
          )}
          {busy && <p className="text-xs text-zinc-500">{busy}</p>}
          {report && !scanning && <ScanSummary items={items} report={report} />}
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {folderName && !scanning && items.length === 0 && !message && (
        <p className="text-sm text-zinc-500">No videos (mp4, webm, mov, m4v, mkv, avi) or PDFs found in this folder.</p>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.slice(0, visible).map((it) => (
            <Card
              key={it.id}
              item={it}
              coverName={names.get(it.id)!}
              onRetry={() => regenerate((x) => x.id === it.id)}
            />
          ))}
        </ul>
      )}
      {visible < items.length && (
        <div ref={sentinel} className="py-6 text-center text-xs text-zinc-500">
          Showing {visible} of {items.length}…
        </div>
      )}
    </div>
  );
}

function ScanSummary({ items, report }: { items: Item[]; report: ScanReport }) {
  const videos = items.filter((i) => i.kind === "video").length;
  const pdfs = items.filter((i) => i.kind === "pdf").length;
  const unopened = items.filter((i) => !i.file).length;
  const other = Object.entries(report.otherFiles).sort((a, b) => b[1] - a[1]);
  const otherCount = other.reduce((n, [, c]) => n + c, 0);
  const hasDetails = otherCount > 0 || report.skippedFolders.length > 0 || report.unreadableFolders.length > 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <details className="text-xs text-zinc-600 dark:text-zinc-400">
      <summary className={hasDetails ? "cursor-pointer" : "list-none"}>
        Found {plural(videos, "video")} and {plural(pdfs, "PDF")}
        {unopened > 0 && `, ${unopened} couldn’t be opened`}
        {otherCount > 0 && ` · skipped ${plural(otherCount, "other file")}`}
        {report.skippedFolders.length > 0 && ` · ${plural(report.skippedFolders.length, "hidden folder")} not scanned`}
        {report.unreadableFolders.length > 0 && ` · ${plural(report.unreadableFolders.length, "folder")} couldn’t be read`}
      </summary>
      {hasDetails && (
        <div className="mt-2 flex flex-col gap-1 pl-4">
          {other.length > 0 && (
            <p>
              Other file types (not videos or PDFs): {other.map(([ext, n]) => `${ext === "(none)" ? "no extension" : "." + ext} ×${n}`).join(", ")}
            </p>
          )}
          {report.skippedFolders.length > 0 && <p>Hidden/system folders skipped: {report.skippedFolders.join(", ")}</p>}
          {report.unreadableFolders.map((u) => (
            <p key={u.path} className="text-red-600 dark:text-red-400">
              Couldn’t list {u.path}: {u.reason}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}

function Card({ item, coverName, onRetry }: { item: Item; coverName: string; onRetry: () => void }) {
  const dir = item.path.slice(0, item.path.length - item.name.length);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background [contain-intrinsic-size:auto_320px] [content-visibility:auto] dark:border-zinc-800">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {item.status === "done" && item.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: preview
          <img
            src={item.url}
            alt={`Thumbnail of ${item.name}`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : item.status === "error" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <span className="text-2xl" aria-hidden>
              {item.kind === "video" ? "🎞️" : "📄"}
            </span>
            <p className="text-xs text-red-600 dark:text-red-400">{item.error}</p>
            {item.file && (
              <button type="button" onClick={onRetry} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                Try again
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">{item.status === "working" ? "Generating…" : "Queued"}</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={item.path}>
            {item.name}
          </p>
          {dir && (
            <p className="truncate text-[11px] text-zinc-400" title={dir}>
              {dir}
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                item.kind === "video"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              }`}
            >
              {item.kind === "video" ? (item.name.split(".").pop() ?? "video") : "pdf"}
            </span>
            {item.file ? formatBytes(item.size) : "size unknown"}
            {item.width && ` · ${item.width}×${item.height}`}
          </span>
          {item.status === "done" && item.blob && (
            <button
              type="button"
              onClick={() => saveBlob(item.blob!, coverName)}
              title={`Download ${coverName}`}
              className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Download
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
