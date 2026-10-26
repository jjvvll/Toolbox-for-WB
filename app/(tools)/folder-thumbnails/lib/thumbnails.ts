import { canvasToBlob, renderPdfFirstPage, type CoverFormat } from "@/lib/render-pdf-cover";

export type CapturePoint = "1s" | "10%" | "25%";
export type ThumbOptions = { width: number; format: CoverFormat; quality: number; capture: CapturePoint };
export type Thumb = { blob: Blob; width: number; height: number };

/** A failure we can explain to the user in the card. */
export class ThumbError extends Error {}

/** Draws `source` into a new canvas `width` px wide (never upscaled), keeping the aspect ratio. */
function scaleTo(source: CanvasImageSource, srcW: number, srcH: number, width: number): HTMLCanvasElement {
  const w = Math.min(width, srcW);
  const h = Math.round((srcH / srcW) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function once(target: EventTarget, ok: string, ms: number, timeoutMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new ThumbError(timeoutMessage));
    }, ms);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new ThumbError("The browser can't decode this video (unsupported format or codec)."));
    };
    function cleanup() {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      target.removeEventListener("error", onError);
    }
    target.addEventListener(ok, onOk);
    target.addEventListener("error", onError);
  });
}

export async function videoThumbnail(file: File, opts: ThumbOptions): Promise<Thumb> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  // Kept in the DOM but invisible: some browsers won't decode frames for detached videos.
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  try {
    const loaded = once(video, "loadedmetadata", 20_000, "Timed out reading the video.");
    video.src = url;
    await loaded;

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const wanted = opts.capture === "1s" ? 1 : duration * (opts.capture === "10%" ? 0.1 : 0.25);
    // Stay inside the video; very short clips use their middle.
    const time = duration > 0 ? Math.min(Math.max(wanted, 0), Math.max(duration - 0.1, 0)) : 0;

    const seeked = once(video, "seeked", 20_000, "Timed out seeking in the video.");
    video.currentTime = time || 0.001;
    await seeked;

    if (!video.videoWidth || !video.videoHeight) {
      throw new ThumbError("No picture in this file (audio-only, or the video codec isn't supported).");
    }
    const canvas = scaleTo(video, video.videoWidth, video.videoHeight, opts.width);
    const blob = await canvasToBlob(canvas, opts.format, opts.quality);
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    video.removeAttribute("src");
    video.load(); // releases the decoder
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export async function pdfThumbnail(file: File, opts: ThumbOptions): Promise<Thumb> {
  let rendered: Awaited<ReturnType<typeof renderPdfFirstPage>>;
  try {
    // At least 1.5x, and enough pixels for a sharp result at the output width.
    rendered = await renderPdfFirstPage(file, { minScale: 1.5, minWidth: opts.width });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new ThumbError(
      name === "PasswordException"
        ? "This PDF is password-protected."
        : name === "InvalidPDFException"
          ? "This PDF is damaged or not a valid PDF."
          : `Couldn't render this PDF${err instanceof Error && err.message ? ` (${err.message})` : ""}.`,
    );
  }
  const { canvas: page } = rendered;
  const canvas = scaleTo(page, page.width, page.height, opts.width);
  page.width = page.height = 0; // free the large render
  const blob = await canvasToBlob(canvas, opts.format, opts.quality);
  return { blob, width: canvas.width, height: canvas.height };
}
