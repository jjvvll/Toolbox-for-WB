import { numberedName } from "./settings";

export const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "mkv", "avi"];

export type VideoEntry = {
  id: string;
  /** Path relative to the opened folder. */
  path: string;
  name: string;
  size: number;
  /** Folder mode: read straight from disk through these handles. */
  handle: FileSystemFileHandle | null;
  dir: FileSystemDirectoryHandle | null;
  /** Fallback mode: the picked File. */
  file: File | null;
};

const isVideo = (name: string) => VIDEO_EXT.includes(name.split(".").pop()?.toLowerCase() ?? "");
const skipDir = (name: string) => name.startsWith(".") || name === "node_modules" || name === "$RECYCLE.BIN";

export async function scanFolder(
  root: FileSystemDirectoryHandle,
  { recursive, skipFolder }: { recursive: boolean; skipFolder?: string },
): Promise<VideoEntry[]> {
  const out: VideoEntry[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    const subdirs: [FileSystemDirectoryHandle, string][] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "directory") {
        // Don't list our own output folder as input.
        const isOutput = !!skipFolder && prefix === "" && entry.name === skipFolder;
        if (recursive && !skipDir(entry.name) && !isOutput) subdirs.push([entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`]);
        continue;
      }
      if (entry.name.startsWith(".") || !isVideo(entry.name)) continue;
      let size = 0;
      try {
        size = (await (entry as FileSystemFileHandle).getFile()).size;
      } catch {
        // listed anyway; reading will fail later with a clear message
      }
      out.push({ id: crypto.randomUUID(), path: prefix + entry.name, name: entry.name, size, handle: entry as FileSystemFileHandle, dir, file: null });
    }
    for (const [sub, p] of subdirs) await walk(sub, p);
  }
  await walk(root, "");
  return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

export function entriesFromFiles(files: FileList): VideoEntry[] {
  return Array.from(files)
    .filter((f) => isVideo(f.name) || f.type.startsWith("video/"))
    .map((f) => ({ id: crypto.randomUUID(), path: f.name, name: f.name, size: f.size, handle: null, dir: null, file: f }));
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TypeMismatchError") return true; // a folder with that name
    return false;
  }
}

/** First free name: "x-compressed.mp4", then "x-compressed-2.mp4", … Never an existing file. */
export async function freeName(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = numberedName(name, n);
    if (!(await exists(dir, candidate))) return candidate;
  }
  throw new Error("Couldn’t find a free file name for the output.");
}

/**
 * Opens a writable for a new output file, wrapped so that finishing commits it but
 * `discard()` throws the written data away (Chrome writes to a temporary file until close).
 */
export async function openOutput(dir: FileSystemDirectoryHandle, name: string) {
  const handle = await dir.getFileHandle(name, { create: true });
  const fsw = await handle.createWritable({ keepExistingData: false });
  let discard = false;
  let settled = false;
  const stream = new WritableStream({
    write: (chunk) => fsw.write(chunk),
    close: async () => {
      settled = true;
      await (discard ? fsw.abort() : fsw.close());
    },
    abort: async (reason) => {
      settled = true;
      await fsw.abort(reason);
    },
  });
  return {
    handle,
    stream,
    /** Writes a whole buffer (ffmpeg path) and commits. */
    async writeAll(data: Uint8Array) {
      const w = stream.getWriter();
      await w.write(data);
      await w.close();
    },
    /** Marks the output as unwanted; call before the stream closes, or after to abort if still open. */
    async discard() {
      discard = true;
      if (!settled) {
        try {
          await fsw.abort();
        } catch {
          // already closed/aborted
        }
        settled = true;
      }
      try {
        await dir.removeEntry(name);
      } catch {
        // may already be gone
      }
    },
  };
}
