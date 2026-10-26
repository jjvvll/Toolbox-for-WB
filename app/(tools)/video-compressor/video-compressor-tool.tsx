"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../folder-thumbnails/lib/scan";
import type { Probe, RunHandle } from "./lib/engines";
import { entriesFromFiles, freeName, openOutput, scanFolder, type VideoEntry } from "./lib/files";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  estimateBytes,
  isValidSubfolder,
  outputDims,
  outputName,
  videoKbpsFor,
  type PresetId,
  type Settings,
} from "./lib/settings";

type Status = "idle" | "queued" | "working" | "done" | "larger" | "error" | "cancelled";
type Result = {
  outName: string;
  location: string;
  originalSize: number;
  outSize: number;
  url: string;
  originalUrl?: string;
  /** Fallback mode only: the bytes to download. */
  blob?: Blob;
};
type Item = VideoEntry & {
  selected: boolean;
  probe?: Probe | null;
  status: Status;
  progress: number;
  engineUsed?: "webcodecs" | "ffmpeg";
  result?: Result;
  error?: string;
  startedAt?: number;
  elapsed?: number;
};

const SETTINGS_KEY = "video-compressor:settings";
const BIG_FOR_FFMPEG = 1024 ** 3; // ~1 GB

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    return saved ? { ...DEFAULT_SETTINGS, ...saved } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const fmtTime = (s: number | null | undefined) => {
  if (s == null || !isFinite(s)) return "—";
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const supportsFolders = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
const looksCompressed = (name: string) => /-compressed(-\d+)?\.mp4$/i.test(name);

const input = "rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm dark:border-zinc-700";
const label = "flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";
const button = "rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const primary = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";

export default function VideoCompressorTool() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [items, setItems] = useState<Item[]>([]);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [mode, setMode] = useState<"folder" | "files" | null>(null);
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [queueStart, setQueueStart] = useState(0);
  const [, setTick] = useState(0);
  const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(null);

  const itemsRef = useRef<Item[]>([]);
  const cancelled = useRef(false);
  const current = useRef<{ run?: RunHandle; out?: { discard: () => Promise<void> } }>({});
  const urls = useRef(new Set<string>());
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const probeGen = useRef(0);

  const update = (fn: (list: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  };
  const patch = (id: string, changes: Partial<Item>) =>
    update((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));

  function setSettings(changes: Partial<Settings>) {
    setSettingsState((s) => {
      const next = { ...s, ...changes };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // not persisted; fine
      }
      return next;
    });
  }

  const track = (url: string) => {
    urls.current.add(url);
    return url;
  };
  function clearUrls() {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
  }

  // Release everything on leave.
  useEffect(() => {
    const set = urls.current;
    return () => {
      cancelled.current = true;
      void current.current.run?.cancel();
      set.forEach((u) => URL.revokeObjectURL(u));
      void wakeLock.current?.release().catch(() => {});
    };
  }, []);

  // Elapsed/ETA display tick.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Warn before closing the tab mid-run, and re-take the wake lock when the tab is shown again.
  useEffect(() => {
    if (!running) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !wakeLock.current) void acquireWakeLock();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  async function acquireWakeLock() {
    try {
      const lock = await navigator.wakeLock?.request("screen");
      if (!lock) return setWakeLockOk(false);
      wakeLock.current = lock;
      lock.addEventListener("release", () => {
        if (wakeLock.current === lock) wakeLock.current = null;
      });
      setWakeLockOk(true);
    } catch {
      setWakeLockOk(false);
    }
  }
  async function releaseWakeLock() {
    const lock = wakeLock.current;
    wakeLock.current = null;
    await lock?.release().catch(() => {});
  }

  async function probeAll() {
    const gen = ++probeGen.current;
    const { probe } = await import("./lib/engines");
    for (const it of itemsRef.current) {
      if (gen !== probeGen.current) return;
      try {
        const file = it.file ?? (await it.handle!.getFile());
        patch(it.id, { probe: await probe(file) });
      } catch {
        patch(it.id, { probe: null });
      }
    }
  }

  function setEntries(entries: VideoEntry[]) {
    clearUrls();
    update(() => entries.map((e) => ({ ...e, selected: !looksCompressed(e.name), status: "idle", progress: 0 })));
    void probeAll();
  }

  async function listFolder(handle: FileSystemDirectoryHandle, recursive: boolean) {
    setScanning(true);
    setMessage(null);
    try {
      const entries = await scanFolder(handle, { recursive, skipFolder: settings.subfolder.trim() || undefined });
      setEntries(entries);
      if (!entries.length) setMessage({ kind: "warn", text: "No videos (mp4, mov, m4v, webm, mkv, avi) found in this folder." });
    } catch (err) {
      setMessage({ kind: "error", text: `Couldn’t list the folder: ${err instanceof Error ? err.message : err}` });
    } finally {
      setScanning(false);
    }
  }

  async function openFolder() {
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker!({ id: "video-compressor", mode: "readwrite" });
    } catch {
      return; // cancelled
    }
    setRoot(handle);
    setMode("folder");
    await listFolder(handle, settings.scanSubfolders);
  }

  function pickFiles(list: FileList | null) {
    if (!list?.length) return;
    setRoot(null);
    setMode("files");
    setEntries(entriesFromFiles(list));
  }

  const settingsFor = (it: Item) => {
    const duration = it.probe?.duration ?? null;
    return {
      shortSide: settings.shortSide,
      videoKbps: videoKbpsFor(settings, duration),
      audioKbps: settings.audioKbps,
      fpsCap: settings.fpsCap,
      constantBitrate: !!settings.targetMB,
    };
  };
  const estimateFor = (it: Item) => {
    const d = it.probe?.duration;
    if (!d) return null;
    const job = settingsFor(it);
    return estimateBytes(d, job.videoKbps, job.audioKbps, it.probe?.hasAudio ?? true);
  };

  async function processOne(it: Item) {
    const startedAt = Date.now();
    patch(it.id, { status: "working", progress: 0, startedAt, error: undefined, result: undefined });
    const engines = await import("./lib/engines");
    const job = settingsFor(it);
    let outDir: FileSystemDirectoryHandle | null = null;
    let outName = "";
    let out: Awaited<ReturnType<typeof openOutput>> | null = null;
    const register = (h: RunHandle) => (current.current.run = h);
    const onProgress = (p: number) => patch(it.id, { progress: p });

    const open = async () => {
      if (!it.dir) return null;
      outDir = settings.subfolder.trim() ? await it.dir.getDirectoryHandle(settings.subfolder.trim(), { create: true }) : it.dir;
      outName = await freeName(outDir, outputName(it.name, settings.pattern));
      const o = await openOutput(outDir, outName);
      current.current.out = o;
      return o;
    };

    try {
      const file = it.file ?? (await it.handle!.getFile());
      out = await open();
      let engine: "webcodecs" | "ffmpeg" = engines.supportsWebCodecs() && it.probe?.engine !== "ffmpeg" ? "webcodecs" : "ffmpeg";
      let bytes: Uint8Array | null = null;

      if (engine === "webcodecs") {
        try {
          bytes = await engines.compressWebCodecs(file, job, out?.stream ?? null, onProgress, register);
        } catch (err) {
          const e = engines.classifyError(err);
          if (e.kind !== "unsupported" || cancelled.current) throw err;
          // WebCodecs can't handle this file: start over with ffmpeg.wasm.
          await out?.discard();
          out = await open();
          engine = "ffmpeg";
          patch(it.id, { progress: 0 });
        }
      }
      if (engine === "ffmpeg") {
        patch(it.id, { engineUsed: "ffmpeg" });
        bytes = await engines.compressFfmpeg(file, job, onProgress, register);
        if (out) await out.writeAll(bytes);
      }
      if (cancelled.current) throw new engines.CompressError("cancelled", "Cancelled.");

      // Size check and result.
      let outBlob: Blob;
      if (out && outDir) {
        outBlob = await (await (outDir as FileSystemDirectoryHandle).getFileHandle(outName)).getFile();
      } else {
        outBlob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "video/mp4" });
        outName = outputName(it.name, settings.pattern);
      }
      const elapsed = (Date.now() - startedAt) / 1000;
      if (outBlob.size >= file.size) {
        if (out) await out.discard();
        patch(it.id, {
          status: "larger",
          engineUsed: engine,
          elapsed,
          error: `The compressed file (${formatBytes(outBlob.size)}) wasn’t smaller than the original (${formatBytes(file.size)}), so it was deleted. The original is untouched; try a smaller preset.`,
        });
        return;
      }
      const sub = settings.subfolder.trim();
      patch(it.id, {
        status: "done",
        progress: 1,
        engineUsed: engine,
        elapsed,
        result: {
          outName,
          location: it.dir ? `${it.path.slice(0, it.path.length - it.name.length)}${sub ? `${sub}/` : ""}${outName}` : outName,
          originalSize: file.size,
          outSize: outBlob.size,
          url: track(URL.createObjectURL(outBlob)),
          originalUrl: settings.sideBySide ? track(URL.createObjectURL(file)) : undefined,
          blob: it.dir ? undefined : outBlob,
        },
      });
    } catch (err) {
      const e = (await import("./lib/engines")).classifyError(cancelled.current ? new Error("cancel") : err);
      await out?.discard();
      patch(it.id, { status: e.kind === "cancelled" ? "cancelled" : "error", error: e.message, elapsed: (Date.now() - startedAt) / 1000 });
    } finally {
      current.current = {};
    }
  }

  async function start() {
    const queue = itemsRef.current.filter((i) => i.selected);
    if (!queue.length) return;
    if (!isValidSubfolder(settings.subfolder.trim())) {
      setMessage({ kind: "error", text: "The output subfolder name contains characters that aren’t allowed." });
      return;
    }
    cancelled.current = false;
    setMessage(null);
    setRunning(true);
    setQueueStart(Date.now());
    await acquireWakeLock();
    update((list) => list.map((i) => (i.selected ? { ...i, status: "queued" as const, progress: 0, result: undefined, error: undefined } : i)));
    for (const it of queue) {
      if (cancelled.current) break;
      await processOne(itemsRef.current.find((i) => i.id === it.id)!);
    }
    if (cancelled.current) {
      update((list) => list.map((i) => (i.status === "queued" ? { ...i, status: "cancelled" as const, error: "Not started (queue cancelled)." } : i)));
    }
    await releaseWakeLock();
    setRunning(false);
    const done = itemsRef.current.filter((i) => i.status === "done");
    const saved = done.reduce((n, i) => n + (i.result!.originalSize - i.result!.outSize), 0);
    if (!cancelled.current) {
      setMessage({ kind: "ok", text: `Finished: ${done.length} of ${queue.length} compressed, ${formatBytes(Math.max(0, saved))} saved in total.` });
    }
  }

  async function cancel() {
    cancelled.current = true;
    // Mark the output as unwanted first, so stopping the encoder can't commit a partial file.
    await current.current.out?.discard();
    await current.current.run?.cancel();
  }

  // ---- derived values for the UI
  const selected = items.filter((i) => i.selected);
  const allSelected = items.length > 0 && selected.length === items.length;
  const totalSize = selected.reduce((n, i) => n + i.size, 0);
  const estimates = selected.map(estimateFor);
  const estimateTotal = estimates.every((e) => e != null) ? estimates.reduce((n, e) => n + (e ?? 0), 0) : null;
  const needsFfmpeg = selected.filter((i) => i.probe?.engine === "ffmpeg");
  const queueItems = items.filter((i) => ["queued", "working", "done", "larger", "error", "cancelled"].includes(i.status));
  const working = items.find((i) => i.status === "working");
  const queueBytes = queueItems.reduce((n, i) => n + i.size, 0);
  const doneBytes = queueItems.filter((i) => i.status !== "queued" && i.status !== "working").reduce((n, i) => n + i.size, 0);
  const queueProgress = queueBytes ? (doneBytes + (working ? working.size * working.progress : 0)) / queueBytes : 0;
  const queueElapsed = running ? (Date.now() - queueStart) / 1000 : 0;
  const queueEta = queueProgress > 0.01 ? (queueElapsed / queueProgress) * (1 - queueProgress) : null;
  const curElapsed = working?.startedAt ? (Date.now() - working.startedAt) / 1000 : 0;
  const curEta = working && working.progress > 0.01 ? (curElapsed / working.progress) * (1 - working.progress) : null;
  const preview = outputName("holiday.MOV", settings.pattern);

  function applyPreset(id: PresetId) {
    if (id === "custom") return setSettings({ preset: "custom" });
    const { shortSide, videoKbps, audioKbps, fpsCap } = PRESETS[id];
    setSettings({ preset: id, shortSide, videoKbps, audioKbps, fpsCap });
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <p>
          <span aria-hidden>🔒</span> Everything runs in your browser. Videos are read from and saved back to your own computer; nothing is uploaded.
        </p>
        <p className="text-xs opacity-90">
          Best in <strong>Chrome or Edge on desktop</strong>: folder access, saving next to the original, and hardware video
          encoding. Firefox and Safari work in basic mode (pick files, download results).
        </p>
      </div>

      {!supportsFolders() && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This browser can’t open folders, so compressed files are downloaded instead of saved next to the originals,
          and each one is held in memory until you download it. Large files may fail; Chrome or Edge is recommended.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {supportsFolders() ? (
          <button type="button" onClick={openFolder} disabled={running} className={primary}>
            📁 Open folder
          </button>
        ) : (
          <button type="button" onClick={() => fileInput.current?.click()} disabled={running} className={primary}>
            🎞️ Choose videos
          </button>
        )}
        <input ref={fileInput} type="file" multiple hidden accept="video/*,.mkv,.avi,.mov,.m4v" onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
        {supportsFolders() && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.scanSubfolders}
              disabled={running}
              onChange={(e) => {
                setSettings({ scanSubfolders: e.target.checked });
                if (root) void listFolder(root, e.target.checked);
              }}
              className="h-4 w-4 accent-blue-600"
            />
            Include subfolders
          </label>
        )}
        {root && <span className="text-sm text-zinc-500">📁 {root.name}{scanning ? " · scanning…" : ""}</span>}
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div role="radiogroup" aria-label="Preset" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["small", "balanced", "high", "custom"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={settings.preset === id}
              disabled={running}
              onClick={() => applyPreset(id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                settings.preset === id ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
              }`}
            >
              <span className="block font-medium">{id === "custom" ? "Custom" : PRESETS[id].label}</span>
              <span className="text-xs opacity-75">{id === "custom" ? "Your own settings" : PRESETS[id].hint}</span>
            </button>
          ))}
        </div>

        <details open={settings.preset === "custom"}>
          <summary className="cursor-pointer text-sm font-medium">Advanced options</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className={label}>
              Resolution (short side)
              <select className={input} value={settings.shortSide} disabled={running} onChange={(e) => setSettings({ shortSide: Number(e.target.value), preset: "custom" })}>
                <option value={0}>Keep original</option>
                {[360, 480, 720, 1080, 1440].map((v) => <option key={v} value={v}>{v}p</option>)}
              </select>
            </label>
            <label className={label}>
              Video bitrate (kbps)
              <input className={input} type="number" min={100} max={50000} step={100} value={settings.videoKbps} disabled={running || !!settings.targetMB}
                onChange={(e) => setSettings({ videoKbps: Math.max(100, Number(e.target.value) || 100), preset: "custom" })} />
            </label>
            <label className={label}>
              Audio bitrate
              <select className={input} value={settings.audioKbps} disabled={running} onChange={(e) => setSettings({ audioKbps: Number(e.target.value), preset: "custom" })}>
                {[48, 64, 96, 128, 160, 192].map((v) => <option key={v} value={v}>{v} kbps</option>)}
              </select>
            </label>
            <label className={label}>
              Frame rate cap
              <select className={input} value={settings.fpsCap} disabled={running} onChange={(e) => setSettings({ fpsCap: Number(e.target.value), preset: "custom" })}>
                <option value={0}>Keep original</option>
                {[24, 30, 60].map((v) => <option key={v} value={v}>{v} fps</option>)}
              </select>
            </label>
            <label className={label}>
              Target size per file (MB)
              <input className={input} type="number" min={0.1} step={0.1} placeholder="Off" value={settings.targetMB ?? ""} disabled={running}
                onChange={(e) => setSettings({ targetMB: e.target.value ? Math.max(0.1, Number(e.target.value)) : null, preset: "custom" })} />
            </label>
          </div>
          {settings.targetMB && (
            <p className="mt-2 text-xs text-zinc-500">Video bitrate is calculated per file from its duration to hit about {settings.targetMB} MB.</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className={label}>
              File name
              <input className={input} value={settings.pattern} disabled={running} onChange={(e) => setSettings({ pattern: e.target.value })} />
            </label>
            {mode !== "files" && (
              <label className={label}>
                Output subfolder (optional)
                <input className={input} value={settings.subfolder} placeholder="e.g. compressed" disabled={running} onChange={(e) => setSettings({ subfolder: e.target.value })} />
              </label>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={settings.sideBySide} disabled={running} onChange={(e) => setSettings({ sideBySide: e.target.checked })} className="h-4 w-4 accent-blue-600" />
              Show original and compressed side by side
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Example: holiday.MOV → {settings.subfolder.trim() && mode !== "files" ? `${settings.subfolder.trim()}/` : ""}{preview}. If that name exists, a number is added
            (“-2”). Originals are never modified, overwritten, or deleted.
          </p>
        </details>
      </section>

      {message && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${
          message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            : message.kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}

      {items.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allSelected} disabled={running}
                onChange={(e) => update((list) => list.map((i) => ({ ...i, selected: e.target.checked })))} className="h-4 w-4 accent-blue-600" />
              Select all
            </label>
            <span className="text-zinc-500">
              {selected.length} of {items.length} selected · {formatBytes(totalSize)}
              {selected.length > 0 && (estimateTotal != null ? ` → about ${formatBytes(estimateTotal)}` : " → estimate after scanning")}
            </span>
            <div className="ml-auto flex gap-2">
              {running ? (
                <button type="button" onClick={cancel} className={`${button} border-red-300 text-red-700 dark:border-red-800 dark:text-red-400`}>
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={start} disabled={!selected.length} className={primary}>
                  Compress {selected.length || ""} video{selected.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>

          {needsFfmpeg.length > 0 && !running && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {needsFfmpeg.length} selected file{needsFfmpeg.length === 1 ? "" : "s"} can’t be handled by the browser’s built-in video engine and will use the slower
              ffmpeg fallback, which loads ~30 MB once and may fail on very large files (over about 1 GB)
              {needsFfmpeg.some((i) => i.size > BIG_FOR_FFMPEG) ? ". At least one of them is over 1 GB." : "."}
            </p>
          )}

          {running && (
            <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
              <p className="font-medium">
                Keep this tab open and visible until it finishes.
                {wakeLockOk === false && " (This browser couldn’t keep the screen awake, so stop your computer from sleeping.)"}
              </p>
              {working && (
                <Bar label={`Current: ${working.name}${working.engineUsed === "ffmpeg" ? " (ffmpeg fallback)" : ""}`} value={working.progress}
                  detail={`${Math.round(working.progress * 100)}% · ${fmtTime(curElapsed)} elapsed · ${curEta != null ? `${fmtTime(curEta)} left` : "estimating…"}`} />
              )}
              <Bar label={`Queue: ${queueItems.filter((i) => !["queued", "working"].includes(i.status)).length} of ${queueItems.length} done`} value={queueProgress}
                detail={`${Math.round(queueProgress * 100)}% · ${fmtTime(queueElapsed)} elapsed · ${queueEta != null ? `${fmtTime(queueEta)} left` : "estimating…"}`} />
            </div>
          )}

          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((it) => (
              <Row key={it.id} item={it} estimate={estimateFor(it)} running={running}
                outDims={it.probe ? outputDims(it.probe.width, it.probe.height, settings.shortSide) : null}
                onToggle={(v) => patch(it.id, { selected: v })} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Bar({ label: text, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
        <span className="truncate">{text}</span>
        <span className="text-zinc-500">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={text}>
        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
    </div>
  );
}

function Row({ item: it, estimate, running, outDims, onToggle }: {
  item: Item;
  estimate: number | null;
  running: boolean;
  outDims: { width: number; height: number } | null;
  onToggle: (v: boolean) => void;
}) {
  const p = it.probe;
  const r = it.result;
  const saved = r ? Math.round((1 - r.outSize / r.originalSize) * 100) : 0;
  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <input type="checkbox" checked={it.selected} disabled={running} onChange={(e) => onToggle(e.target.checked)} aria-label={`Select ${it.name}`} className="h-4 w-4 accent-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={it.path}>{it.path}</p>
          <p className="text-xs text-zinc-500">
            {p === undefined ? "Reading details…" : p === null ? "Couldn’t read details" : (
              <>
                {fmtTime(p.duration)} · {p.width ? `${p.width}×${p.height}` : "unknown size"}
                {p.rotation ? ` (rotated ${p.rotation}°)` : ""}{p.fps ? ` · ${p.fps} fps` : ""}{p.videoCodec ? ` · ${p.videoCodec}` : ""}
                {outDims && p.width ? ` → ${outDims.width}×${outDims.height}` : ""}
              </>
            )}
          </p>
          {p?.note && <p className="text-xs text-amber-700 dark:text-amber-400">{p.note}</p>}
        </div>
        <div className="text-right text-xs">
          <p className="font-medium">{formatBytes(it.size)}</p>
          {estimate != null && it.status === "idle" && (
            <p className={estimate >= it.size ? "text-amber-600" : "text-zinc-500"}>
              ≈ {formatBytes(estimate)}{estimate >= it.size ? " (may not shrink)" : ""}
            </p>
          )}
        </div>
        <StatusBadge item={it} />
      </div>

      {it.status === "working" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-blue-600 transition-[width] duration-300" style={{ width: `${it.progress * 100}%` }} />
        </div>
      )}
      {it.error && <p className={`text-xs ${it.status === "larger" || it.status === "cancelled" ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{it.error}</p>}

      {r && (
        <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900/50">
          <p>
            <strong>{formatBytes(r.originalSize)}</strong> → <strong>{formatBytes(r.outSize)}</strong>{" "}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">({saved}% smaller)</span>
            <span className="text-zinc-500"> · {fmtTime(it.elapsed)}{it.engineUsed === "ffmpeg" ? " · ffmpeg fallback" : ""}</span>
          </p>
          {r.blob ? (
            <button type="button" className={`${button} w-fit`} onClick={() => {
              const a = document.createElement("a");
              a.href = r.url;
              a.download = r.outName;
              a.click();
            }}>
              ⬇ Download {r.outName}
            </button>
          ) : (
            <p className="text-xs text-zinc-500">Saved as <code>{r.location}</code> (original untouched).</p>
          )}
          <div className={`grid gap-3 ${r.originalUrl ? "md:grid-cols-2" : ""}`}>
            {r.originalUrl && (
              <figure>
                <figcaption className="mb-1 text-xs text-zinc-500">Original · {formatBytes(r.originalSize)}</figcaption>
                <video src={r.originalUrl} controls preload="metadata" className="max-h-80 w-full rounded-lg bg-black" />
              </figure>
            )}
            <figure>
              <figcaption className="mb-1 text-xs text-zinc-500">Compressed · {formatBytes(r.outSize)}</figcaption>
              <video src={r.url} controls preload="metadata" className="max-h-80 w-full rounded-lg bg-black" />
            </figure>
          </div>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ item }: { item: Item }) {
  const map: Record<Status, [string, string] | null> = {
    idle: null,
    queued: ["Queued", "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"],
    working: [`${Math.round(item.progress * 100)}%`, "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"],
    done: ["Done", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"],
    larger: ["Kept original", "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"],
    error: ["Failed", "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"],
    cancelled: ["Cancelled", "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"],
  };
  const b = map[item.status];
  return b ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b[1]}`}>{b[0]}</span> : null;
}
