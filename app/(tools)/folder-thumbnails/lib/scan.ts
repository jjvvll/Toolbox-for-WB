export type MediaKind = "video" | "pdf";

export type MediaFile = {
  id: string;
  /** Path relative to the chosen folder, e.g. "trips/2024/beach.mp4". */
  path: string;
  name: string;
  kind: MediaKind;
  size: number;
  /** Null when the file couldn't be opened; `readError` then says why. */
  file: File | null;
  readError?: string;
  /** Folder that contains the file; only with the File System Access API. */
  dir: FileSystemDirectoryHandle | null;
};

/** What the scan passed over, so it's visible why a file has no card. */
export type ScanReport = {
  /** Other file types, by extension, e.g. { docx: 3, "(none)": 1 }. */
  otherFiles: Record<string, number>;
  /** Hidden/system folders that were not entered. */
  skippedFolders: string[];
  /** Folders whose contents couldn't be listed, with the reason. */
  unreadableFolders: { path: string; reason: string }[];
};

export const emptyReport = (): ScanReport => ({ otherFiles: {}, skippedFolders: [], unreadableFolders: [] });

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi"]);

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.trim().toLowerCase() : "");

/** By extension (case-insensitive), or by MIME type when the browser knows it. */
export function mediaKind(name: string, mime = ""): MediaKind | null {
  const ext = extOf(name);
  if (VIDEO_EXT.has(ext)) return "video";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  return null;
}

const hidden = (name: string) => name.startsWith(".") || name === "node_modules" || name === "$RECYCLE.BIN";

export const supportsDirectoryPicker = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

const reasonFor = (err: unknown) => {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotReadableError" || name === "NotFoundError") {
    return "Couldn’t open this file. It may be cloud-only (e.g. OneDrive “online-only”), open in another app, or moved.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") return "The browser wasn’t allowed to read this file.";
  return `Couldn’t open this file (${err instanceof Error ? err.message : String(err)}).`;
};

function countOther(report: ScanReport, name: string) {
  const ext = extOf(name) || "(none)";
  report.otherFiles[ext] = (report.otherFiles[ext] ?? 0) + 1;
}

/**
 * Walks a folder handle recursively, calling `onFound` as media files are discovered.
 * Files that can't be opened are still reported (with `readError`) instead of vanishing,
 * and a folder that can't be listed doesn't stop the rest of the scan.
 */
export async function scanDirectoryHandle(
  root: FileSystemDirectoryHandle,
  onFound: (files: MediaFile[]) => void,
  report: ScanReport,
  signal: { cancelled: boolean },
): Promise<void> {
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    const batch: MediaFile[] = [];
    const subdirs: [FileSystemDirectoryHandle, string][] = [];
    try {
      for await (const entry of dir.values()) {
        if (signal.cancelled) return;
        const path = prefix + entry.name;
        if (entry.kind === "directory") {
          if (hidden(entry.name)) report.skippedFolders.push(`${path}/`);
          else subdirs.push([entry as FileSystemDirectoryHandle, `${path}/`]);
          continue;
        }
        if (entry.name.startsWith(".")) continue; // e.g. .DS_Store
        const kind = mediaKind(entry.name);
        if (!kind) {
          countOther(report, entry.name);
          continue;
        }
        const base = { id: crypto.randomUUID(), path, name: entry.name, kind, dir };
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          batch.push({ ...base, size: file.size, file });
        } catch (err) {
          batch.push({ ...base, size: 0, file: null, readError: reasonFor(err) });
        }
      }
    } catch (err) {
      report.unreadableFolders.push({ path: prefix || "(top folder)", reason: err instanceof Error ? err.message : String(err) });
    }
    if (batch.length) onFound(batch);
    for (const [sub, subPrefix] of subdirs) await walk(sub, subPrefix);
  }
  await walk(root, "");
}

/** Fallback for browsers without showDirectoryPicker: <input webkitdirectory>. */
export function filesFromInput(list: FileList, report: ScanReport): MediaFile[] {
  const out: MediaFile[] = [];
  const skipped = new Set<string>();
  for (const file of Array.from(list)) {
    const rel = file.webkitRelativePath || file.name;
    // Drop the top folder name so paths match the picker version.
    const path = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
    const parts = path.split("/");
    const hiddenAt = parts.slice(0, -1).findIndex(hidden);
    if (hiddenAt >= 0) {
      skipped.add(`${parts.slice(0, hiddenAt + 1).join("/")}/`);
      continue;
    }
    if (file.name.startsWith(".")) continue;
    const kind = mediaKind(file.name, file.type);
    if (kind) out.push({ id: crypto.randomUUID(), path, name: file.name, kind, size: file.size, file, dir: null });
    else countOther(report, file.name);
  }
  report.skippedFolders.push(...skipped);
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * "<name without extension><suffix>.<ext>". If two sources in the same folder share
 * a base name (clip.mp4 + clip.pdf), the extension is kept to avoid clashes.
 */
export function coverNames(files: MediaFile[], ext: string, suffix = ""): Map<string, string> {
  const byDirBase = new Map<string, number>();
  const key = (f: MediaFile) => `${f.path.slice(0, f.path.length - f.name.length)}|${f.name.replace(/\.[^.]+$/, "").toLowerCase()}`;
  for (const f of files) byDirBase.set(key(f), (byDirBase.get(key(f)) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const f of files) {
    const base = (byDirBase.get(key(f)) ?? 0) > 1 ? f.name : f.name.replace(/\.[^.]+$/, "");
    names.set(f.id, `${base}${suffix}.${ext}`);
  }
  return names;
}
