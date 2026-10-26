// Picks a logo's palette. imagetracer's own sampling takes evenly spaced pixels, so on a
// small logo surrounded by background almost every sample is background and the logo's
// colors collapse into one. Here, distinct colors are seeded farthest-first from a
// histogram (so a small but different color still gets a slot), then refined with k-means.

export type RGBA = { r: number; g: number; b: number; a: number };

const MAX_SAMPLES = 60_000;
/** A color must cover at least this share of opaque pixels to seed a cluster (filters anti-aliasing). */
const MIN_SHARE = 0.002;
const KMEANS_ROUNDS = 6;

export function buildPalette(image: { width: number; height: number; data: Uint8ClampedArray }, count: number): RGBA[] {
  const { width, height, data } = image;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));

  // Opaque samples (r,g,b) and a 5-bit-per-channel histogram of them.
  const samples: number[] = [];
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let transparent = 0;
  for (let i = 0; i < total; i += step) {
    const p = i * 4;
    if (data[p + 3] < 128) {
      transparent++;
      continue;
    }
    const r = data[p], g = data[p + 1], b = data[p + 2];
    samples.push(r, g, b);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) {
      bin.n++; bin.r += r; bin.g += g; bin.b += b;
    } else bins.set(key, { n: 1, r, g, b });
  }

  const sampled = Math.ceil(total / step);
  const hasTransparency = transparent / sampled > 0.01;
  const palette: RGBA[] = hasTransparency ? [{ r: 0, g: 0, b: 0, a: 0 }] : [];
  const opaqueCount = samples.length / 3;
  if (!opaqueCount) return palette.length ? palette : [{ r: 0, g: 0, b: 0, a: 255 }];

  const k = Math.max(1, count - palette.length);
  const minN = Math.max(2, opaqueCount * MIN_SHARE);
  const candidates = [...bins.values()]
    .filter((b) => b.n >= minN)
    .map((b) => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number] }))
    .sort((a, b) => b.n - a.n);
  if (!candidates.length) {
    // Every color is rare (noisy/gradient image): fall back to the most common bins.
    candidates.push(...[...bins.values()].sort((a, b) => b.n - a.n).slice(0, k)
      .map((b) => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number] })));
  }

  // Farthest-first seeding: start from the most common color, then repeatedly add the
  // candidate farthest from every chosen center.
  const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centers: number[][] = [candidates[0].c];
  const nearestD = candidates.map((c) => dist2(c.c, centers[0]));
  while (centers.length < k) {
    let best = -1, bestD = 0;
    nearestD.forEach((d, i) => {
      if (d > bestD) { bestD = d; best = i; }
    });
    if (best < 0 || bestD < 9 * 9 * 3) break; // nothing meaningfully different left
    centers.push(candidates[best].c);
    candidates.forEach((c, i) => {
      nearestD[i] = Math.min(nearestD[i], dist2(c.c, candidates[best].c));
    });
  }

  // k-means refinement over all opaque samples.
  for (let round = 0; round < KMEANS_ROUNDS; round++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < samples.length; s += 3) {
      const px = [samples[s], samples[s + 1], samples[s + 2]];
      let ci = 0, cd = Infinity;
      centers.forEach((c, i) => {
        const d = dist2(px, c);
        if (d < cd) { cd = d; ci = i; }
      });
      acc[ci][0] += px[0]; acc[ci][1] += px[1]; acc[ci][2] += px[2]; acc[ci][3]++;
    }
    acc.forEach((a, i) => {
      if (a[3]) centers[i] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }

  for (const c of centers) palette.push({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), a: 255 });
  return palette;
}
