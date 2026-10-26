// Pure helpers that turn tracer output into clean, grouped SVG. No DOM, so they run in a worker.

export type Group = { color: string; opacity?: number; paths: string[] };

export const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Formats a number with at most `decimals` places and no trailing zeros ("-0" becomes "0"). */
export function fmt(n: number, decimals: number): string {
  const s = Number(n.toFixed(decimals)).toString();
  return s === "-0" ? "0" : s;
}

/**
 * Applies `x' = x*sx + tx, y' = y*sy + ty` to path data that uses M/m, L/l, C/c and Z/z
 * (Potrace's output), and rounds it. Each point is rounded from its exact absolute
 * position and written relative to the previous *rounded* point, so rounding errors
 * never accumulate along a path.
 */
export function transformPath(d: string, sx: number, sy: number, tx: number, ty: number, decimals: number): string {
  const tokens = d.match(/[MmLlCcZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let out = "";
  let cmd = "";
  let last = ""; // last command letter written; repeats can be omitted (except "m": extra pairs after a moveto mean lineto)
  let i = 0;
  const emit = (letter: string, args: string) => {
    out += (letter === last && letter !== "m" ? " " : letter) + args;
    last = letter;
  };
  // Exact (unrounded) and rounded current point / subpath start, in output space.
  let cx = 0, cy = 0, rx = 0, ry = 0, startX = 0, startY = 0, startRX = 0, startRY = 0;
  const round = (v: number) => Number(v.toFixed(decimals));
  const num = () => Number(tokens[i++]);
  const pair = (relative: boolean, baseX: number, baseY: number): [number, number] => {
    const x = num() * sx, y = num() * sy;
    return relative ? [baseX + x, baseY + y] : [x + tx, y + ty];
  };
  const rel = (ax: number, ay: number) => `${fmt(round(ax) - rx, decimals)} ${fmt(round(ay) - ry, decimals)}`;

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        out += "z";
        last = "z";
        cx = startX; cy = startY; rx = startRX; ry = startRY;
      }
      continue;
    }
    const relative = cmd === cmd.toLowerCase();
    const op = cmd.toLowerCase();
    if (op === "m") {
      const [x, y] = pair(relative, cx, cy);
      emit("m", rel(x, y));
      cx = startX = x; cy = startY = y; rx = startRX = round(x); ry = startRY = round(y);
      cmd = relative ? "l" : "L"; // extra pairs after a moveto are linetos
    } else if (op === "l") {
      const [x, y] = pair(relative, cx, cy);
      emit("l", rel(x, y));
      cx = x; cy = y; rx = round(x); ry = round(y);
    } else if (op === "c") {
      const [x1, y1] = pair(relative, cx, cy);
      const [x2, y2] = pair(relative, cx, cy);
      const [x, y] = pair(relative, cx, cy);
      emit("c", `${rel(x1, y1)} ${rel(x2, y2)} ${rel(x, y)}`);
      cx = x; cy = y; rx = round(x); ry = round(y);
    } else {
      i++; // unknown command: skip the number
    }
  }
  // The first moveto is relative to (0,0), which is the same as absolute.
  return out.replace(/^m/, "M");
}

/** Parses Potrace's SVG: returns path data with its group transform baked in. */
export function potraceToPaths(svg: string, decimals: number): string[] {
  const t = svg.match(/translate\(([-\d.e]+),([-\d.e]+)\)\s*scale\(([-\d.e]+),([-\d.e]+)\)/);
  const [tx, ty, sx, sy] = t ? t.slice(1).map(Number) : [0, 0, 1, 1];
  return [...svg.matchAll(/<path d="([^"]+)"/g)]
    .map((m) => transformPath(m[1], sx, sy, tx, ty, decimals))
    .filter((d) => d.length > 2);
}

/** Tidies imagetracer's absolute path data: "M 1 2 L 3 4 Z " -> "M1 2L3 4Z". */
export function compactPath(d: string): string {
  return d.replace(/\s*([A-Za-z])\s*/g, "$1").trim();
}

export function buildSvg(
  width: number,
  height: number,
  groups: Group[],
  background?: string,
  /** Thin same-color stroke that hides hairline seams between adjacent color shapes. */
  seamStroke = false,
): string {
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`];
  if (background) lines.push(`  <rect id="background" width="${width}" height="${height}" fill="${background}"/>`);
  groups.forEach((g, i) => {
    const attrs = [`id="color-${i + 1}"`, `fill="${g.color}"`];
    if (seamStroke) attrs.push(`stroke="${g.color}"`, `stroke-width="0.5"`, `stroke-linejoin="round"`);
    if (g.opacity !== undefined && g.opacity < 1) attrs.push(`opacity="${fmt(g.opacity, 2)}"`);
    lines.push(`  <g ${attrs.join(" ")}>`);
    for (const d of g.paths) lines.push(`    <path d="${d}"/>`);
    lines.push("  </g>");
  });
  lines.push("</svg>");
  return lines.join("\n") + "\n";
}
