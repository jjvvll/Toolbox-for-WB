/// <reference lib="webworker" />
// Minimal ffmpeg.wasm runner (single-thread core). Replaces @ffmpeg/ffmpeg's worker, whose
// `import(coreURL)` can't be bundled by Turbopack. No SharedArrayBuffer, so no COOP/COEP needed.

type Core = {
  exec: (...args: string[]) => void;
  ret: number;
  reset: () => void;
  setProgress: (cb: (p: { progress: number; time: number }) => void) => void;
  setLogger: (cb: (l: { type: string; message: string }) => void) => void;
  FS: {
    mkdir: (p: string) => void;
    rmdir: (p: string) => void;
    unlink: (p: string) => void;
    readFile: (p: string) => Uint8Array;
    mount: (type: unknown, opts: unknown, mountpoint: string) => void;
    unmount: (mountpoint: string) => void;
    filesystems: Record<string, unknown>;
  };
};

export type FfmpegRequest =
  | { type: "load"; coreURL: string; wasmURL: string }
  | { type: "convert"; file: File; args: string[] };
export type FfmpegResponse =
  | { type: "loaded" }
  | { type: "progress"; progress: number }
  | { type: "done"; data: Uint8Array }
  | { type: "error"; message: string };

let core: Core | null = null;
const log: string[] = [];

async function load(coreURL: string, wasmURL: string) {
  if (core) return;
  const mod = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ coreURL);
  core = (await mod.default({
    // The core reads the wasm location from this hash (same scheme @ffmpeg/ffmpeg uses).
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL: "" }))}`,
  })) as Core;
  core.setLogger(({ message }) => {
    log.push(message);
    if (log.length > 40) log.shift();
  });
  core.setProgress(({ progress }) => {
    if (progress >= 0 && progress <= 1) self.postMessage({ type: "progress", progress } satisfies FfmpegResponse);
  });
}

function convert(file: File, args: string[]): Uint8Array {
  const c = core!;
  const dir = `/in-${Date.now()}`;
  c.FS.mkdir(dir);
  // WORKERFS reads the File lazily instead of copying it into wasm memory.
  c.FS.mount(c.FS.filesystems.WORKERFS, { files: [file] }, dir);
  try {
    log.length = 0;
    c.exec("-i", `${dir}/${file.name}`, ...args, "out.mp4");
    const code = c.ret;
    c.reset();
    if (code !== 0) {
      const detail = log.filter((l) => /error|invalid|not supported|unknown|failed/i.test(l)).slice(-2).join(" ");
      throw new Error(`ffmpeg couldn’t convert this file${detail ? `: ${detail}` : " (unsupported or damaged)"}.`);
    }
    const data = c.FS.readFile("out.mp4");
    c.FS.unlink("out.mp4");
    return data;
  } finally {
    try {
      c.FS.unmount(dir);
      c.FS.rmdir(dir);
    } catch {
      // best effort
    }
  }
}

self.onmessage = async (e: MessageEvent<FfmpegRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg.coreURL, msg.wasmURL);
      self.postMessage({ type: "loaded" } satisfies FfmpegResponse);
    } else if (msg.type === "convert") {
      const data = convert(msg.file, msg.args);
      self.postMessage({ type: "done", data } satisfies FfmpegResponse, [data.buffer as ArrayBuffer]);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", message: /memory|OOM|Cannot enlarge/i.test(message) ? `out of memory: ${message}` : message } satisfies FfmpegResponse);
  }
};
