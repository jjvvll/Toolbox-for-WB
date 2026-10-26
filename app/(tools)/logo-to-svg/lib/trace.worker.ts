/// <reference lib="webworker" />
// Runs the tracers off the main thread so the page stays responsive while sliders move.

import { buildPalette } from "./palette";
import { buildSvg, compactPath, potraceToPaths, toHex, type Group } from "./svg-build";

export type TraceOptions = {
  mode: "single" | "multi";
  /** Single color: pixels darker than this (0-255) are traced. */
  threshold: number;
  invert: boolean;
  fill: string;
  /** Multi-color: palette size (2-16), including the background color. */
  colors: number;
  /** Multi-color: 1 (rough) - 10 (fine). */
  detail: number;
  /** 0-100: drop small specks and straighten curves. */
  simplify: number;
  smooth: boolean;
  removeBackground: boolean;
  decimals: number;
};

export type TraceRequest = { id: number; image: ImageData; options: TraceOptions };
export type TraceResponse =
  | { id: number; ok: true; svg: string; paths: number; colors: string[] }
  | { id: number; ok: false; error: string };

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

let potraceReady: Promise<typeof import("esm-potrace-wasm")> | null = null;
function loadPotrace() {
  potraceReady ??= import("esm-potrace-wasm").then(async (mod) => {
    await mod.init();
    return mod;
  });
  return potraceReady;
}

async function traceSingle(image: ImageData, o: TraceOptions) {
  const { width, height, data } = image;
  // Threshold to pure black (traced) / white, so Potrace sees exactly what the slider says.
  const bw = new ImageData(width, height);
  let bgR = 0, bgG = 0, bgB = 0, bgN = 0, fgN = 0;
  for (let p = 0; p < data.length; p += 4) {
    const opaque = data[p + 3] >= 128;
    const dark = lum(data[p], data[p + 1], data[p + 2]) < o.threshold;
    const fg = opaque && (o.invert ? !dark : dark);
    const v = fg ? 0 : 255;
    bw.data[p] = bw.data[p + 1] = bw.data[p + 2] = v;
    bw.data[p + 3] = 255;
    if (fg) fgN++;
    else if (opaque) {
      bgR += data[p]; bgG += data[p + 1]; bgB += data[p + 2]; bgN++;
    }
  }
  if (!fgN) return { svg: buildSvg(width, height, []), paths: 0, colors: [] };

  const { potrace } = await loadPotrace();
  const s = o.simplify / 100;
  const raw = await potrace(bw, {
    turdsize: Math.round(2 + s * 98),
    turnpolicy: 4,
    alphamax: o.smooth ? 1 : 0.55,
    opticurve: 1,
    opttolerance: 0.2 + s,
    extractcolors: false,
    pathonly: false,
  });
  const paths = potraceToPaths(raw, o.decimals);
  const background = !o.removeBackground && bgN ? toHex(bgR / bgN, bgG / bgN, bgB / bgN) : undefined;
  return {
    svg: buildSvg(width, height, [{ color: o.fill, paths }], background),
    paths: paths.length,
    colors: [o.fill],
  };
}

async function traceMulti(image: ImageData, o: TraceOptions) {
  const { default: ImageTracer } = await import("imagetracerjs");
  const s = o.simplify / 100;
  const tres = (11 - o.detail) * 0.5; // detail 10 -> 0.5 (fine), 1 -> 5 (rough)
  const options = ImageTracer.checkoptions({
    // Our own palette (see palette.ts); one cycle = assign pixels to it without averaging
    // the colors back together.
    pal: buildPalette(image, o.colors),
    colorquantcycles: 1,
    ltres: tres * (1 + s),
    qtres: tres * (1 + s),
    pathomit: Math.round(4 + s * 60),
    rightangleenhance: !o.smooth,
    blurradius: o.smooth ? 1 : 0,
    roundcoords: o.decimals,
    strokewidth: 0,
    scale: 1,
    desc: false,
  });
  const td = ImageTracer.imagedataToTracedata(image, options);

  // Background = the palette color most common along the image border.
  const { width, height, data } = image;
  const votes = new Array(td.palette.length).fill(0);
  const nearest = (p: number) => {
    let best = 0, bestD = Infinity;
    td.palette.forEach((c, i) => {
      const d = (c.r - data[p]) ** 2 + (c.g - data[p + 1]) ** 2 + (c.b - data[p + 2]) ** 2 + (c.a - data[p + 3]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const step = Math.max(1, Math.floor((width + height) / 400));
  for (let x = 0; x < width; x += step) {
    votes[nearest(x * 4)]++;
    votes[nearest(((height - 1) * width + x) * 4)]++;
  }
  for (let y = 0; y < height; y += step) {
    votes[nearest(y * width * 4)]++;
    votes[nearest((y * width + width - 1) * 4)]++;
  }
  const bgIndex = votes.indexOf(Math.max(...votes));

  const groups: Group[] = [];
  td.layers.forEach((layer, l) => {
    const c = td.palette[l];
    if (c.a < 13) return; // fully transparent areas
    if (o.removeBackground && l === bgIndex) return;
    const paths: string[] = [];
    layer.forEach((p, pi) => {
      if (p.isholepath) return;
      const d = ImageTracer.svgpathstring(td, l, pi, options).match(/ d="([^"]*)"/)?.[1];
      if (d) paths.push(compactPath(d));
    });
    if (paths.length) groups.push({ color: toHex(c.r, c.g, c.b), opacity: c.a / 255, paths });
  });
  // Background (if kept) first so it sits underneath; then larger colors before details.
  groups.sort((a, b) => {
    const isBg = (g: Group) => g.color === toHex(td.palette[bgIndex].r, td.palette[bgIndex].g, td.palette[bgIndex].b);
    return Number(isBg(b)) - Number(isBg(a)) || b.paths.join("").length - a.paths.join("").length;
  });
  return {
    svg: buildSvg(width, height, groups, undefined, true),
    paths: groups.reduce((n, g) => n + g.paths.length, 0),
    colors: groups.map((g) => g.color),
  };
}

self.onmessage = async (e: MessageEvent<TraceRequest>) => {
  const { id, image, options } = e.data;
  try {
    const result = options.mode === "single" ? await traceSingle(image, options) : await traceMulti(image, options);
    self.postMessage({ id, ok: true, ...result } satisfies TraceResponse);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies TraceResponse);
  }
};
