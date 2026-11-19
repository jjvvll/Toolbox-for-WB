import type { FaceDetector } from "@mediapipe/tasks-vision";

/** A detected face in source-image pixels. */
export type Face = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  /** Midpoint between the eyes, when the model returned eye keypoints. */
  eyes: { x: number; y: number } | null;
  /** Ear-to-ear distance, when the model returned ear keypoints. */
  earSpan: number | null;
};

// Must match the installed @mediapipe/tasks-vision version (pinned in package.json):
// the JS glue and the wasm binary have to come from the same release.
const MEDIAPIPE_VERSION = "1.2.0";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

/** Detection runs on a downscaled copy; the model's input is only 128px anyway. */
const WORK_MAX = 2048;

let detectorPromise: Promise<FaceDetector> | null = null;

/**
 * MediaPipe's wasm prints routine status lines ("INFO: Created TensorFlow Lite XNNPACK
 * delegate for CPU.") through console.error, which the Next dev overlay shows as an error.
 * Drop only those lines while MediaPipe runs; everything else still gets through.
 */
const NOISE = /^(INFO:|[IW]\d{4} )|XNNPACK delegate/;
let quietDepth = 0;
let realError: typeof console.error | null = null;

async function quietly<T>(fn: () => T | Promise<T>): Promise<T> {
  if (quietDepth++ === 0) {
    const original = console.error;
    realError = original;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && NOISE.test(args[0])) return;
      original.apply(console, args);
    };
  }
  try {
    return await fn();
  } finally {
    if (--quietDepth === 0 && realError) {
      console.error = realError;
      realError = null;
    }
  }
}

function getDetector(): Promise<FaceDetector> {
  detectorPromise ??= quietly(async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    });
  }).catch((err) => {
    detectorPromise = null; // allow a retry, e.g. after a network blip
    throw err;
  });
  return detectorPromise;
}

/** Start downloading the model before the user picks an image. */
export function preloadDetector() {
  getDetector().catch(() => {});
}

function run(detector: FaceDetector, canvas: HTMLCanvasElement, ox: number, oy: number, scale: number): Face[] {
  const { detections } = detector.detect(canvas);
  const faces: Face[] = [];
  for (const d of detections) {
    const b = d.boundingBox;
    if (!b) continue;
    // Keypoints (normalized to the analysed canvas): 0–1 eyes, 2 nose, 3 mouth, 4–5 ears.
    const [e1, e2, , , ear1, ear2] = d.keypoints;
    const eyes =
      e1 && e2
        ? {
            x: (ox + ((e1.x + e2.x) / 2) * canvas.width) * scale,
            y: (oy + ((e1.y + e2.y) / 2) * canvas.height) * scale,
          }
        : null;
    faces.push({
      x: (ox + b.originX) * scale,
      y: (oy + b.originY) * scale,
      w: b.width * scale,
      h: b.height * scale,
      score: d.categories[0]?.score ?? 0,
      eyes,
      earSpan: ear1 && ear2 ? Math.abs(ear1.x - ear2.x) * canvas.width * scale : null,
    });
  }
  return faces;
}

function iou(a: Face, b: Face) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function dedupe(faces: Face[]): Face[] {
  const kept: Face[] = [];
  for (const f of faces.toSorted((a, b) => b.score - a.score)) {
    if (kept.every((k) => iou(k, f) < 0.3)) kept.push(f);
  }
  return kept;
}

/**
 * Find faces in the image, largest first. The detector is tuned for faces that fill a
 * good part of the frame, so if the whole image yields nothing (full-body or group shots)
 * it is scanned again in overlapping tiles.
 */
export async function detectFaces(img: HTMLImageElement): Promise<Face[]> {
  const detector = await getDetector();
  return quietly(() => findFaces(detector, img));
}

function findFaces(detector: FaceDetector, img: HTMLImageElement): Face[] {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const k = Math.min(1, WORK_MAX / Math.max(W, H));
  const work = document.createElement("canvas");
  work.width = Math.round(W * k);
  work.height = Math.round(H * k);
  work.getContext("2d")!.drawImage(img, 0, 0, work.width, work.height);
  const scale = 1 / k;

  let faces = run(detector, work, 0, 0, scale);

  if (faces.length === 0) {
    const tile = document.createElement("canvas");
    const tctx = tile.getContext("2d")!;
    for (const frac of [0.5, 0.3]) {
      const size = Math.round(Math.min(work.width, work.height) * frac);
      if (size < 96) continue;
      const step = Math.round(size / 2);
      tile.width = size;
      tile.height = size;
      for (let ty = 0; ty < work.height - step; ty += step) {
        for (let tx = 0; tx < work.width - step; tx += step) {
          const x = Math.min(tx, work.width - size);
          const y = Math.min(ty, work.height - size);
          tctx.clearRect(0, 0, size, size);
          tctx.drawImage(work, x, y, size, size, 0, 0, size, size);
          faces.push(...run(detector, tile, x, y, scale));
        }
      }
      if (faces.length) break;
    }
  }

  faces = dedupe(faces);
  return faces.sort((a, b) => b.w * b.h - a.w * a.h);
}
