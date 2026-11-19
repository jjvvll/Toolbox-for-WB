// Color search: every color on a page, labelled with its LP element. Where LP
// sites keep colors:
//   <style id="website-css">       site palette (:root --primary-dark …) and site-wide rules
//   <style id="custom-style-css">  style presets (hyperlink / button / social icon styles)
//   <style id="global-css">        global body styles
//   <style id="page-css">          per-element settings and custom CSS, keyed by #section-<id>
//   style="" attributes            element color pickers (--bgColor …) and hard-coded styles
//   fill / stroke attributes       SVG icons and logos
// Every color is normalized to RGBA, so #023, #002349, rgb(0 35 73) and hsl(…) all match.

import type { ElementMap } from "@/app/api/audit/elements/route";
import { fetchPage } from "./audit";
import { makeLabeler, type Comp } from "./labeler";

export type Rgba = [number, number, number, number];
export type ColorToken = { t: string; c: Rgba };

export type ColorPart = {
  /** Source: "Site palette & styles", "Inline style" … */
  s: string;
  /** Selector or element path. */
  w: string;
  /** Property. */
  p: string;
  /** Value (shortened). */
  v: string;
  /** Media query. */
  m: string;
  c: ColorToken[];
  comp: Comp | null;
  /** A site-wide setting (palette, presets, template stylesheet). */
  site: boolean;
  /** The element is hidden on the page. */
  h: boolean;
  /** CSS for an element that isn't on this page. */
  absent: boolean;
};

const NAMED_COLORS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );
const NAMED_RE = new RegExp(`(?<![\\w-])(${NAMED_COLORS.join("|")})(?![\\w-])`, "gi");
const COLOR_PROP = /color|background|border|fill|stroke|outline|shadow|caret|column-rule|text-decoration|^--/i;

let ctx: CanvasRenderingContext2D | null = null;

/** Any CSS color → [r, g, b, a], or null if it isn't a color. The browser's canvas does the parsing. */
export function toRGBA(token: string): Rgba | null {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  let v: string | null = null;
  for (const probe of ["#000001", "#000002"]) {
    ctx.fillStyle = probe;
    ctx.fillStyle = token;
    if (ctx.fillStyle !== probe) {
      v = String(ctx.fillStyle);
      break;
    }
  }
  if (!v) return null;
  if (v[0] === "#") return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2], m[3] !== undefined ? +m[3] : 1] : null;
}

export const rgbHex = (c: Rgba) => `#${c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

/** The color tokens inside one CSS value. */
export function extractColors(prop: string, value: string): ColorToken[] {
  const out: ColorToken[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    const c = toRGBA(t);
    if (c) {
      seen.add(k);
      out.push({ t, c });
    }
  };
  (value.match(/#[0-9a-f]{3,8}(?![\w-])/gi) ?? []).forEach((t) => {
    if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) push(t);
  });
  // Relative colors are skipped: their #hex is caught above.
  (value.match(/(?:rgba?|hsla?)\([^()]*\)/gi) ?? []).forEach((t) => {
    if (!/\bfrom\b|var\(/i.test(t)) push(t);
  });
  if (COLOR_PROP.test(prop)) (value.match(NAMED_RE) ?? []).forEach(push);
  return out;
}

/** Calls `cb` for every declaration in a stylesheet. LP's split H/S/L properties (--fontColor_H …) are recombined. */
export function walkCss(text: string, cb: (selector: string, prop: string, value: string, media: string, important: boolean) => void) {
  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(text.replace(/@import[^;]+;/gi, ""));
  } catch {
    return;
  }
  const visit = (rules: CSSRuleList, media: string) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        const hsl: Record<string, Partial<Record<"H" | "S" | "L", string>>> = {};
        for (let i = 0; i < r.style.length; i++) {
          const prop = r.style[i];
          const value = r.style.getPropertyValue(prop).trim();
          const m = prop.match(/^(--[\w-]+?)_([HSL])$/);
          if (m) (hsl[m[1]] ??= {})[m[2] as "H" | "S" | "L"] = value;
          cb(r.selectorText, prop, value, media, r.style.getPropertyPriority(prop) === "important");
        }
        for (const [base, v] of Object.entries(hsl)) {
          if (v.H !== undefined && v.S !== undefined && v.L !== undefined) {
            cb(r.selectorText, `${base} (H/S/L)`, `hsl(${parseFloat(v.H) || 0}, ${v.S}, ${v.L})`, media, false);
          }
        }
      }
      const inner = (r as CSSGroupingRule).cssRules;
      if (inner) visit(inner, r instanceof CSSMediaRule ? r.media.mediaText : ((r as CSSConditionRule).conditionText ?? media));
    }
  };
  visit(sheet.cssRules, "");
}

export const SITE_STYLE_BLOCKS: Record<string, string> = {
  "website-css": "Site palette & styles",
  "custom-style-css": "Style presets",
  "global-css": "Site global CSS",
};

/**
 * Whether an element is hidden on the page: the hidden attribute, inline
 * display:none, hiding classes, or a section switched off by the page's CSS.
 */
export function hiddenChecker(doc: Document): (el: Element) => boolean {
  const hiddenIds = new Set<string>();
  doc.querySelectorAll("style").forEach((st) =>
    walkCss(st.textContent ?? "", (sel, prop, value) => {
      const m = sel.trim().match(/^#(section-[0-9a-f-]{36})$/i);
      if (m && ((prop === "display" && /none/.test(value)) || (prop === "visibility" && /hidden/.test(value)))) hiddenIds.add(m[1]);
    }),
  );
  return (el) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (e.hasAttribute("hidden") || hiddenIds.has(e.id)) return true;
      if (/(?:^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i.test(e.getAttribute("style") ?? "")) return true;
      if (["d-none", "is-hidden", "hidden"].some((c) => e.classList.contains(c))) return true;
    }
    return false;
  };
}

const shorten = (v: string) => (v.length > 260 ? `${v.slice(0, 257)}…` : v);

/** Every color on one page. Needs the page's <style> blocks, so it runs before anything is stripped. */
export function collectColorParts(doc: Document, elMap: ElementMap | null): ColorPart[] {
  const parts: ColorPart[] = [];
  if (!doc.body) return parts;
  const { componentOf, pathOf } = makeLabeler(doc, elMap);
  const isHidden = hiddenChecker(doc);
  const add = (s: string, w: string, p: string, value: string, el: Element | null, extra: { comp?: Comp; media?: string; site?: boolean; absent?: boolean } = {}) => {
    const c = extractColors(p, value);
    if (!c.length) return;
    const comp = extra.comp ?? (el ? componentOf(el) : null);
    parts.push({
      s,
      w,
      p,
      v: shorten(value),
      m: extra.media ?? "",
      c,
      comp,
      site: !!extra.site,
      h: el && !comp?.global ? isHidden(el) : false,
      absent: !!extra.absent,
    });
  };

  // 1) <style> blocks
  doc.querySelectorAll("style").forEach((st) => {
    const siteLabel = SITE_STYLE_BLOCKS[st.id];
    const src = siteLabel ?? (st.id === "page-css" ? "Element styles (page CSS)" : "Page <style> block");
    walkCss(st.textContent ?? "", (sel, prop, value, media) => {
      if (siteLabel) return add(src, sel, prop, value, null, { site: true, comp: { name: siteLabel, global: true }, media });
      // Tie the rule to its element by the first #id in the selector (#section-…, #global-navbar, #modal-…).
      const id = sel.match(/#([A-Za-z][\w-]*)/)?.[1];
      const el = id ? doc.getElementById(id) : null;
      if (el) return add(src, sel, prop, value, el, { media });
      add(src, sel, prop, value, null, {
        media,
        absent: !!id,
        comp: id ? { name: "Element not on this page", heading: `#${id}` } : { name: "Page custom CSS (not tied to an element)" },
      });
    });
  });

  // 2) style="" attributes: element color settings (--bgColor …) and hard-coded inline styles
  doc.querySelectorAll("[style]").forEach((el) => {
    (el.getAttribute("style") ?? "").split(/;(?![^(]*\))/).forEach((decl) => {
      const i = decl.indexOf(":");
      if (i < 0) return;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).trim();
      if (!prop || !value) return;
      add(prop.startsWith("--") ? "Element setting" : "Inline style", pathOf(el) || el.tagName.toLowerCase(), prop, value, el);
    });
  });

  // 3) color attributes (SVG fill/stroke, legacy color/bgcolor)
  doc.querySelectorAll("[fill], [stroke], [stop-color], [bgcolor], font[color]").forEach((el) => {
    for (const a of ["fill", "stroke", "stop-color", "bgcolor", "color"]) {
      const v = el.getAttribute(a);
      if (v) add(el.closest("svg") ? "SVG attribute" : "HTML attribute", pathOf(el) || el.tagName.toLowerCase(), a, v, el);
    }
  });
  return parts;
}

/** The template's design stylesheet (styles.luxurypresence.com/<design>/index.css) linked from the page. */
export function designCssUrl(doc: Document, base: string): string {
  for (const l of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    try {
      const href = new URL(l.getAttribute("href") ?? "", base).href;
      if (/styles\.luxury(presence|coders)\.com\//.test(href)) return href;
    } catch {
      // bad href
    }
  }
  return "";
}

const designCache = new Map<string, Promise<ColorPart[]>>();

/** Colors in the template's design stylesheet: read once, only when asked for. */
export function designCssParts(url: string): Promise<ColorPart[]> {
  let hit = designCache.get(url);
  if (!hit) {
    hit = (async () => {
      const text = (await fetchPage(url, "css")).body;
      const slug = (new URL(url).pathname.split("/")[1] ?? "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const parts: ColorPart[] = [];
      walkCss(text, (sel, prop, value, media) => {
        const c = extractColors(prop, value);
        if (c.length) {
          parts.push({
            s: "Template design stylesheet",
            w: sel,
            p: prop,
            v: shorten(value),
            m: media,
            c,
            comp: { name: "Template design stylesheet", template: slug, global: true },
            site: true,
            h: false,
            absent: false,
          });
        }
      });
      return parts;
    })();
    hit.catch(() => designCache.delete(url)); // try again next time
    designCache.set(url, hit);
  }
  return hit;
}

export function parseColorInput(s: string): Rgba | null {
  let v = s.trim();
  if (!v) return null;
  if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) v = `#${v}`; // "002349" without the #
  return toRGBA(v);
}
