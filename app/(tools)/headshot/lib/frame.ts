import type { Face } from "./detect";

export type Rect = { x: number; y: number; w: number; h: number };

/** How much of the crop the head fills: default, tightest (zoomed in), loosest (zoomed out). */
const FILL_DEFAULT = 0.5;
const FILL_MAX = 0.85;
/** Tighter cap for a circle crop, whose curved edge would otherwise clip the head. */
const FILL_MAX_ROUND = 0.7;
const FILL_MIN = 0.2;
/** Close-ups may auto-zoom this far so the frame fits the photo instead of padding it. */
const FILL_FIT_LIMIT = 0.95;
/** Smallest crop, in source pixels, when there is no head to frame. */
const MIN_CROP = 64;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Slide `r` so it lies inside `bounds` (assumes it is no bigger). */
function slideInside(r: Rect, bounds: Rect): Rect {
  return {
    ...r,
    x: clamp(r.x, bounds.x, bounds.x + bounds.w - r.w),
    y: clamp(r.y, bounds.y, bounds.y + bounds.h - r.h),
  };
}

/** Slide `r` so it fully contains `inner` (assumes it is big enough). */
function slideAround(r: Rect, inner: Rect): Rect {
  return {
    ...r,
    x: clamp(r.x, inner.x + inner.w - r.w, inner.x),
    y: clamp(r.y, inner.y + inner.h - r.h, inner.y),
  };
}

export function isInsideImage(r: Rect, imgW: number, imgH: number) {
  const e = 0.5;
  return r.x >= -e && r.y >= -e && r.x + r.w <= imgW + e && r.y + r.h <= imgH + e;
}

/**
 * The whole head, hair and ears included, estimated from the face box.
 * The detector's box runs roughly from the forehead to the chin, so hair needs room above it.
 */
export function headBox(face: Face): Rect {
  const cx = face.eyes?.x ?? face.x + face.w / 2;
  const w = Math.max(face.w * 1.35, (face.earSpan ?? 0) * 1.3);
  const top = face.y - face.h * 0.65;
  const bottom = face.y + face.h * 1.08;
  return { x: cx - w / 2, y: top, w, h: bottom - top };
}

/** A crop centered on the head, which fills `fill` of it, with headroom above. */
function frameHead(head: Rect, aspect: number, fill: number): Rect {
  const h = Math.max(head.h / fill, head.w / (fill * aspect));
  const w = h * aspect;
  // Headroom shrinks as the head gets bigger in the frame; the rest goes to the shoulders.
  const headroom = (h - head.h) * 0.22;
  return { x: head.x + head.w / 2 - w / 2, y: head.y - headroom, w, h };
}

/** How much of the crop the head currently fills (inverse of frameHead's sizing). */
export function fillOf(head: Rect, crop: Rect) {
  return Math.max(head.h / crop.h, head.w / crop.w);
}

/**
 * Rules for one image + head + aspect ratio.
 * With a head, the crop must always contain it and may extend past the photo's edges
 * (the gap gets filled) so it can stay centered. Without one, it stays inside the photo.
 */
export function makeFraming(imgW: number, imgH: number, fullHead: Rect | null, aspect: number, round = false) {
  const image: Rect = { x: 0, y: 0, w: imgW, h: imgH };
  // Hair or ears beyond the photo's edge can't be shown anyway, so only protect what's in it.
  const head = fullHead && intersect(fullHead, image);

  // Default zoom: the head fills FILL_DEFAULT of the frame, but for close-ups where that frame
  // would be bigger than the photo, zoom in until it fits (up to a hard limit).
  const fitFill = head ? Math.max(head.h, head.w / aspect) / Math.min(imgH, imgW / aspect) : 0;
  const autoFill = clamp(fitFill, FILL_DEFAULT, FILL_FIT_LIMIT);
  const fillMax = Math.max(round ? FILL_MAX_ROUND : FILL_MAX, autoFill);

  // The area the crop may roam: the photo, grown only as far as the default head-centered
  // frame needs. A head well inside the photo adds nothing, so there's no empty margin.
  const view = head ? union(image, frameHead(head, aspect, autoFill)) : image;
  const maxH = Math.min(view.h, view.w / aspect);
  const minH = Math.min(maxH, head ? frameHead(head, aspect, fillMax).h : MIN_CROP);

  function constrain(r: Rect): Rect {
    const h = clamp(r.h, minH, maxH);
    const w = h * aspect;
    let out = slideInside({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h }, view);
    if (head) out = slideAround(out, head);
    return out;
  }

  function auto(fill = autoFill): Rect {
    if (head) return constrain(frameHead(head, aspect, clamp(fill, FILL_MIN, fillMax)));
    // No head: the largest centered crop, nudged toward the top.
    const h = maxH;
    const w = h * aspect;
    return constrain({ x: (imgW - w) / 2, y: (imgH - h) * 0.25, w, h });
  }

  /** Resize around the current center, then re-apply the rules. */
  function resize(r: Rect, h: number): Rect {
    const w = h * aspect;
    return constrain({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h });
  }

  return { head, view, minH, maxH, constrain, auto, resize };
}

/**
 * Draw `img` as seen through `crop` into a w×h area, extending the photo's outermost
 * pixels outward wherever the crop goes past its edges.
 */
export function drawExtended(ctx: CanvasRenderingContext2D, img: HTMLImageElement, crop: Rect, w: number, h: number) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const s = w / crop.w;
  const dx = -crop.x * s;
  const dy = -crop.y * s;
  const dw = W * s;
  const dh = H * s;
  const right = dx + dw;
  const bottom = dy + dh;
  // Overlap the strips by a pixel so no hairline gaps show.
  if (dx > 0) ctx.drawImage(img, 0, 0, 1, H, 0, dy, dx + 1, dh);
  if (right < w) ctx.drawImage(img, W - 1, 0, 1, H, right - 1, dy, w - right + 1, dh);
  if (dy > 0) ctx.drawImage(img, 0, 0, W, 1, dx, 0, dw, dy + 1);
  if (bottom < h) ctx.drawImage(img, 0, H - 1, W, 1, dx, bottom - 1, dw, h - bottom + 1);
  if (dx > 0 && dy > 0) ctx.drawImage(img, 0, 0, 1, 1, 0, 0, dx + 1, dy + 1);
  if (right < w && dy > 0) ctx.drawImage(img, W - 1, 0, 1, 1, right - 1, 0, w - right + 1, dy + 1);
  if (dx > 0 && bottom < h) ctx.drawImage(img, 0, H - 1, 1, 1, 0, bottom - 1, dx + 1, h - bottom + 1);
  if (right < w && bottom < h) ctx.drawImage(img, W - 1, H - 1, 1, 1, right - 1, bottom - 1, w - right + 1, h - bottom + 1);
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Average color of the photo's border, as a starting fill color. */
export function edgeColor(img: HTMLImageElement): string {
  const n = 24;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (x !== 0 && y !== 0 && x !== n - 1 && y !== n - 1) continue;
      const i = (y * n + x) * 4;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      count++;
    }
  }
  const hex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
