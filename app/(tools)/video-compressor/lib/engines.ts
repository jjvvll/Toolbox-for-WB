// Compression engines. Both are imported dynamically by the page, so nothing here loads until needed.
import type { Conversion as ConversionT } from "mediabunny";
import type { FfmpegRequest, FfmpegResponse } from "./ffmpeg.worker";
import { outputDims } from "./settings";

export type Probe = {
  duration: number | null;
  width: number;
  height: number;
  rotation: number;
  fps: number | null;
  videoCodec: string | null;
  hasAudio: boolean;
  /** Whether this browser can decode it with WebCodecs; otherwise ffmpeg.wasm is needed. */
  engine: "webcodecs" | "ffmpeg";
  note?: string;
};

export type Job = {
  shortSide: number;
  videoKbps: number;
  audioKbps: number;
  fpsCap: number;
  /** Hitting a file size: use constant bitrate so the encoder sticks to the budget. */
  constantBitrate?: boolean;
};

/** An error we can show as-is, grouped by kind. */
export class CompressError extends Error {
  constructor(
    readonly kind: "unsupported" | "memory" | "permission" | "disk" | "cancelled" | "other",
    message: string,
  ) {
    super(message);
  }
}

export function classifyError(err: unknown): CompressError {
  if (err instanceof CompressError) return err;
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "ConversionCanceledError" || name === "AbortError" || /cancel/i.test(msg)) {
    return new CompressError("cancelled", "Cancelled.");
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new CompressError("permission", "Permission denied. Allow the browser to edit this folder and try again.");
  }
  if (name === "QuotaExceededError" || name === "NoModificationAllowedError" || name === "InvalidModificationError" || /disk|space|quota/i.test(msg)) {
    return new CompressError("disk", `Couldn’t write the output file (${msg || name}). Check free disk space and folder permissions.`);
  }
  if (name === "NotReadableError" || name === "NotFoundError") {
    return new CompressError("permission", "Couldn’t read the original file. It may be in use, cloud-only, or moved.");
  }
  if (err instanceof RangeError || /out of memory|memory access out of bounds|allocation/i.test(msg)) {
    return new CompressError("memory", "Ran out of memory. Try a smaller preset, or the Chrome/Edge folder mode for big files.");
  }
  if (/codec|decode|encode|unsupported|not supported/i.test(msg)) {
    return new CompressError("unsupported", `This browser can’t process this video’s format (${msg}).`);
  }
  return new CompressError("other", msg || "Something went wrong.");
}

// ---------------------------------------------------------------------------------------------
// WebCodecs (mediabunny)

const mediabunny = () => import("mediabunny");

export async function probe(file: File): Promise<Probe> {
  const mb = await mediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("No video track found.");
    const audio = await input.getPrimaryAudioTrack();
    const [duration, canDecode, stats] = await Promise.all([
      input.computeDuration().catch(() => null),
      video.canDecode().catch(() => false),
      video.computePacketStats(120).catch(() => null),
    ]);
    return {
      duration,
      width: video.displayWidth,
      height: video.displayHeight,
      rotation: video.rotation,
      fps: stats?.averagePacketRate ? Math.round(stats.averagePacketRate * 100) / 100 : null,
      videoCodec: video.codec,
      hasAudio: !!audio,
      engine: canDecode ? "webcodecs" : "ffmpeg",
      note: canDecode ? undefined : `This browser can’t decode ${video.codec ?? "this"} video; the slower fallback will be used.`,
    };
  } catch {
    // Not a container mediabunny reads (e.g. AVI): ffmpeg will handle it.
    return { duration: null, width: 0, height: 0, rotation: 0, fps: null, videoCodec: null, hasAudio: true, engine: "ffmpeg", note: "Format not readable by the browser; the slower fallback will be used." };
  } finally {
    input.dispose();
  }
}

export type RunHandle = { cancel: () => Promise<void> };

/**
 * Compresses with WebCodecs. `target` is a WritableStream of positioned chunks (folder mode,
 * streams to disk) or null (returns the bytes; fallback mode).
 */
export async function compressWebCodecs(
  file: File,
  job: Job,
  target: WritableStream | null,
  onProgress: (p: number) => void,
  register: (h: RunHandle) => void,
): Promise<Uint8Array | null> {
  const mb = await mediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new CompressError("unsupported", "No video track found.");
    const dims = outputDims(video.displayWidth, video.displayHeight, job.shortSide);
    const bitrate = job.videoKbps * 1000;

    // Same check as VideoEncoder.isConfigSupported(), for H.264 at the output size and bitrate.
    // Note: a bare number passed to Quality means a quality *level*; bitrates must be { bitrate }.
    const videoQuality = new mb.Quality({ bitrate, bitrateMode: job.constantBitrate ? "constant" : "variable" });
    const audioQuality = new mb.Quality({ bitrate: job.audioKbps * 1000 });
    if (!(await mb.canEncodeVideo("avc", { width: dims.width, height: dims.height, quality: videoQuality }))) {
      throw new CompressError("unsupported", `This browser can’t encode H.264 at ${dims.width}×${dims.height}.`);
    }
    const audioCodec = (await mb.canEncodeAudio("aac", { quality: audioQuality })) ? "aac" : "opus";

    let fps: number | undefined;
    if (job.fpsCap) {
      const stats = await video.computePacketStats(120).catch(() => null);
      if (stats && stats.averagePacketRate > job.fpsCap + 0.5) fps = job.fpsCap;
    }

    const bufferTarget = target ? null : new mb.BufferTarget();
    const output = new mb.Output({
      // Metadata at the end: nothing has to be held in memory to move it to the front.
      format: new mb.Mp4OutputFormat({ fastStart: false }),
      target: target ? new mb.StreamTarget(target as WritableStream<import("mediabunny").StreamTargetChunk>, { chunked: true }) : bufferTarget!,
    });
    const conversion: ConversionT = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      video: {
        width: dims.width,
        height: dims.height,
        fit: "contain",
        codec: "avc",
        quality: videoQuality,
        frameRate: fps,
        forceTranscode: true,
        // Keep rotation as metadata (default), like the original.
        allowTransformationMetadata: true,
      },
      audio: { codec: audioCodec, quality: audioQuality },
    });
    if (!conversion.isValid || conversion.discardedTracks.some((d) => d.track.type === "video")) {
      const reason = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason.replace(/_/g, " ")}`).join(", ");
      throw new CompressError("unsupported", `Can’t convert this file in the browser (${reason || "invalid conversion"}).`);
    }
    register({ cancel: () => conversion.cancel() });
    conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    return bufferTarget ? new Uint8Array(bufferTarget.buffer!) : null;
  } finally {
    input.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// ffmpeg.wasm fallback (single-thread core: no SharedArrayBuffer, so no COOP/COEP headers needed)

let ffWorker: Worker | null = null;
let ffReady: Promise<Worker> | null = null;

function loadFfmpeg(): Promise<Worker> {
  ffReady ??= new Promise<Worker>((resolve, reject) => {
    const w = new Worker(new URL("./ffmpeg.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<FfmpegResponse>) => {
      if (e.data.type === "loaded") resolve(w);
      else if (e.data.type === "error") reject(new CompressError("unsupported", `Couldn’t start the ffmpeg fallback: ${e.data.message}`));
    };
    w.onerror = () => reject(new CompressError("other", "Couldn’t start the ffmpeg fallback."));
    w.postMessage({
      type: "load",
      // Served from this site (bundled assets), not a CDN.
      coreURL: new URL("@ffmpeg/core", import.meta.url).href,
      wasmURL: new URL("@ffmpeg/core/wasm", import.meta.url).href,
    } satisfies FfmpegRequest);
    ffWorker = w;
  }).catch((err) => {
    stopFfmpeg();
    throw err;
  });
  return ffReady;
}

/** Terminating the worker is the only way to stop ffmpeg.wasm mid-run; it reloads next time. */
export function stopFfmpeg() {
  ffWorker?.terminate();
  ffWorker = null;
  ffReady = null;
}

export async function compressFfmpeg(
  file: File,
  job: Job,
  onProgress: (p: number) => void,
  register: (h: RunHandle) => void,
): Promise<Uint8Array> {
  let cancelled = false;
  let rejectRun: (err: unknown) => void = () => {};
  register({
    cancel: async () => {
      cancelled = true;
      stopFfmpeg();
      rejectRun(new CompressError("cancelled", "Cancelled."));
    },
  });
  const w = await loadFfmpeg();
  if (cancelled) throw new CompressError("cancelled", "Cancelled.");

  const S = job.shortSide;
  const args: string[] = [];
  // Downscale only, keeping aspect ratio; -2 keeps the other side even. ffmpeg also bakes in rotation.
  if (S) args.push("-vf", `scale='if(gte(iw,ih),-2,min(${S},iw))':'if(gte(iw,ih),min(${S},ih),-2)'`);
  if (job.fpsCap) args.push("-fpsmax", String(job.fpsCap));
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-b:v", `${job.videoKbps}k`, "-maxrate", `${Math.round(job.videoKbps * 1.5)}k`, "-bufsize", `${job.videoKbps * 2}k`,
    "-c:a", "aac", "-b:a", `${job.audioKbps}k`,
    "-movflags", "+faststart",
  );

  return new Promise<Uint8Array>((resolve, reject) => {
    rejectRun = reject;
    w.onmessage = (e: MessageEvent<FfmpegResponse>) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.progress);
      else if (m.type === "done") resolve(m.data);
      else if (m.type === "error") reject(classifyError(new Error(m.message)));
    };
    w.onerror = (e) => {
      stopFfmpeg(); // a crashed core (often out of memory) can't be reused
      reject(classifyError(new Error(e.message || "ffmpeg crashed (possibly out of memory)")));
    };
    w.postMessage({ type: "convert", file, args } satisfies FfmpegRequest);
  });
}

export const supportsWebCodecs = () => typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
