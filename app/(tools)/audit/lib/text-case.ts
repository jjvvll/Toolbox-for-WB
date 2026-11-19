// Text case: every piece of text that shows in UPPERCASE (or lowercase,
// Capitalized, small caps). Two causes are reported separately:
//   Styled: CSS makes it that case (text-transform / font-variant), worked out the way the
//           browser does it from the template stylesheet, the site's style blocks, element
//           settings and inline styles, including var(--…).
//   Typed:  the words themselves are written in capitals, so changing the style won't fix them.
// The cascade is calculated for a desktop (1440px) and a mobile (390px) screen.

import type { ElementMap } from "@/app/api/audit/elements/route";
import { clean, fetchPage, parseHtml } from "./audit";
import { SITE_STYLE_BLOCKS, hiddenChecker } from "./colors";
import { makeLabeler, type Comp } from "./labeler";
import { logError } from "@/lib/error-log";

export type Screen = "d" | "m";
export const CASE_WIDTHS: Record<Screen, number> = { d: 1440, m: 390 };
const CASE_PROPS = /^(text-transform|font-variant|font-variant-caps|--[\w-]+)$/i;
const SKIP_HOSTS = /(^|\.)(fonts\.googleapis\.com|use\.typekit\.net|fonts\.gstatic\.com)$/i;

type Decl = {
  src: string;
  sel: string;
  parts: { sel: string; spec: number }[];
  prop: string;
  value: string;
  imp: boolean;
  media: string;
  inline?: boolean;
  order: number;
};

/** How one text looks at one screen width. */
export type Look = { tt: string; why: string; sc: string; scWhy: string };
export type CasePart = { t: string; typed: string[]; d: Look; m: Look; comp: Comp; path: string; h: boolean };

/** Whether a media query applies at this width: width conditions are evaluated, print is skipped, anything else counts. */
function mediaApplies(media: string, width: number): boolean {
  if (!media) return true;
  return media.split(",").some((part) => {
    const q = part.trim().toLowerCase();
    if (/^(only\s+)?print\b/.test(q)) return false;
    let ok = true;
    const px = (n: string, u?: string) => +n * (u === "em" || u === "rem" ? 16 : 1);
    q.replace(/\((min|max)-width\s*:\s*([\d.]+)(px|em|rem)?\s*\)/g, (m, k: string, n: string, u?: string) => {
      if (k === "min" ? width < px(n, u) : width > px(n, u)) ok = false;
      return m;
    });
    q.replace(/\(\s*width\s*(>=|<=|>|<)\s*([\d.]+)(px|em|rem)?\s*\)/g, (m, op: string, n: string, u?: string) => {
      const v = px(n, u);
      const pass = { ">=": width >= v, "<=": width <= v, ">": width > v, "<": width < v }[op];
      if (!pass) ok = false;
      return m;
    });
    return q.startsWith("not ") ? !ok : ok;
  });
}

/** "a, b:is(c, d)" → ["a", "b:is(c, d)"] */
function splitSelectors(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && !depth) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Property names are case-insensitive; custom properties (--headingCase) are not.
const propKey = (p: string) => (p.startsWith("--") ? p : p.toLowerCase());

/** [ids, classes/attributes/pseudo-classes, tags] as one comparable number. */
function specificity(sel: string): number {
  const s = sel.replace(/:where\([^()]*\)/g, " ").replace(/:(?:not|is|has)\(([^()]*)\)/g, " $1 ");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const tags = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:+[\w-]+(\([^)]*\))?/g, " ").match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 1e6 + cls * 1e3 + tags;
}

// Generated text and hover/focus states aren't the text as it normally shows.
const NOT_STATIC = /::?(before|after|first-letter|first-line|marker|placeholder|selection|backdrop|-webkit-[\w-]+|-moz-[\w-]+)\b|:(hover|focus|focus-visible|focus-within|active|visited|target|checked)\b/i;

/** The declarations Text case needs from one stylesheet. */
function caseDecls(text: string, src: string): Omit<Decl, "order">[] {
  const out: Omit<Decl, "order">[] = [];
  let sheet: CSSStyleSheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(text.replace(/@import[^;]+;/gi, ""));
  } catch {
    return out;
  }
  const visit = (rules: CSSRuleList, media: string) => {
    for (const r of rules) {
      if (r instanceof CSSStyleRule) {
        const parts = splitSelectors(r.selectorText)
          .filter((p) => !NOT_STATIC.test(p))
          .map((sel) => ({ sel, spec: specificity(sel) }));
        if (parts.length) {
          for (let i = 0; i < r.style.length; i++) {
            const prop = r.style[i];
            if (CASE_PROPS.test(prop)) {
              out.push({
                src,
                sel: r.selectorText,
                parts,
                prop: propKey(prop),
                value: r.style.getPropertyValue(prop).trim(),
                imp: r.style.getPropertyPriority(prop) === "important",
                media,
              });
            }
          }
        }
      }
      const inner = (r as CSSGroupingRule).cssRules;
      if (inner) visit(inner, r instanceof CSSMediaRule ? r.media.mediaText : media);
    }
  };
  visit(sheet.cssRules, "");
  return out;
}

// External stylesheets (the template's design stylesheet …): read once, shared by every page.
const sheetCache = new Map<string, Promise<Omit<Decl, "order">[]>>();
function sheetDecls(url: string) {
  let hit = sheetCache.get(url);
  if (!hit) {
    hit = (async () => {
      try {
        const page = await fetchPage(url, "css");
        if (page.status >= 400) throw new Error(`HTTP ${page.status}`);
        const u = new URL(url);
        const src = /styles\.luxury(presence|coders)\.com$/.test(u.hostname) ? "Template design stylesheet" : `Stylesheet ${u.pathname.split("/").pop() || u.hostname}`;
        return caseDecls(page.body, src);
      } catch (err) {
        logError("Audit", "Stylesheet could not be read", `${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    })();
    sheetCache.set(url, hit);
  }
  return hit;
}

/** Typed in capitals: runs of words with capitals and no lowercase letters ("CONTACT US", "3BR", "REALTOR®"). */
function capsRuns(text: string): string[] {
  const runs: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.join("").replace(/[^\p{L}]/gu, "").length >= 2) runs.push(run.join(" "));
    run = [];
  };
  for (const w of text.match(/[\p{L}\p{N}'’&.®™-]+/gu) ?? []) {
    const letters = w.replace(/[^\p{L}]/gu, "");
    if (!letters) continue; // numbers only: neither break nor join a run
    if (/\p{Lu}/u.test(letters) && !/\p{Ll}/u.test(letters)) run.push(w);
    else flush();
  }
  flush();
  return runs;
}

/** Everything Text case reports for one page. Reads the page and its stylesheets again (they aren't kept). */
export async function collectCaseParts(url: string, elMap: ElementMap | null): Promise<CasePart[]> {
  try {
    const page = await fetchPage(url);
    const doc = parseHtml(page.body);
    if (!doc.body) return [];
    // Stylesheets in document order: later ones win ties, like in the browser.
    const raw: Omit<Decl, "order">[] = [];
    for (const node of doc.querySelectorAll('link[rel~="stylesheet"][href], style')) {
      if (node.tagName === "STYLE") {
        const src = SITE_STYLE_BLOCKS[node.id] ?? (node.id === "page-css" ? "Element styles (page CSS)" : "Page <style> block");
        raw.push(...caseDecls(node.textContent ?? "", src));
      } else {
        let sheetUrl: URL;
        try {
          sheetUrl = new URL(node.getAttribute("href") ?? "", page.url);
        } catch {
          continue;
        }
        if (!SKIP_HOSTS.test(sheetUrl.hostname)) raw.push(...(await sheetDecls(sheetUrl.href)));
      }
    }
    const decls: Decl[] = raw.map((d, order) => ({ ...d, order }));
    const byProp = new Map<string, Decl[]>();
    for (const d of decls) (byProp.get(d.prop) ?? byProp.set(d.prop, []).get(d.prop)!).push(d);

    const badSel = new Set<string>();
    const matches = (el: Element, sel: string) => {
      if (badSel.has(sel)) return false;
      try {
        return el.matches(sel);
      } catch {
        badSel.add(sel);
        return false;
      }
    };
    const inlineCache = new Map<Element, Map<string, Decl>>();
    const inline = (el: Element) => {
      let map = inlineCache.get(el);
      if (!map) {
        map = new Map();
        for (const d of (el.getAttribute("style") ?? "").split(/;(?![^(]*\))/)) {
          const i = d.indexOf(":");
          if (i < 0) continue;
          const prop = propKey(d.slice(0, i).trim());
          let value = d.slice(i + 1).trim();
          const imp = /!important\s*$/i.test(value);
          value = value.replace(/!important\s*$/i, "").trim();
          if (CASE_PROPS.test(prop) && value) map.set(prop, { src: "Inline style", sel: 'style=""', parts: [], prop, value, imp, media: "", inline: true, order: Infinity });
        }
        inlineCache.set(el, map);
      }
      return map;
    };

    // The declaration that wins on the element itself (not inherited) at this width.
    const ownMemo = new Map<Element, Map<string, Decl | null>>();
    const own = (el: Element, prop: string, w: Screen): Decl | null => {
      const key = `${prop}|${w}`;
      let memo = ownMemo.get(el);
      if (!memo) ownMemo.set(el, (memo = new Map()));
      if (memo.has(key)) return memo.get(key)!;
      // Browser order: !important first, then style="" over stylesheets, then specificity, then the later rule.
      let best: Decl | null = null;
      let bestRank: number[] | null = null;
      const beats = (a: number[], b: number[]) => {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
        return false;
      };
      const consider = (d: Decl, spec: number) => {
        const rank = [d.imp ? 1 : 0, d.inline ? 1 : 0, spec, d.order];
        if (!bestRank || beats(rank, bestRank)) {
          best = d;
          bestRank = rank;
        }
      };
      for (const d of byProp.get(prop) ?? []) {
        if (!mediaApplies(d.media, CASE_WIDTHS[w])) continue;
        let spec = -1;
        for (const p of d.parts) if (p.spec > spec && matches(el, p.sel)) spec = p.spec;
        if (spec >= 0) consider(d, spec);
      }
      const inl = inline(el).get(prop);
      if (inl) consider(inl, 1e9);
      memo.set(key, best);
      return best;
    };
    // Inherited value: the nearest element (itself or an ancestor) that sets it.
    const computed = (el: Element, prop: string, w: Screen) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const d = own(e, prop, w);
        if (d && !/^(inherit|unset)$/i.test(d.value)) return { d, el: e };
      }
      return null;
    };
    const resolve = (value: string, el: Element, w: Screen, depth = 0): string =>
      value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_m, name: string, fallback = "") => {
        if (depth > 6) return fallback.trim();
        const c = computed(el, name, w);
        return c ? resolve(c.d.value, c.el, w, depth + 1) : resolve(fallback.trim(), el, w, depth + 1);
      });
    const look = (el: Element, w: Screen): Look => {
      const t = computed(el, "text-transform", w);
      const tt = t ? resolve(t.d.value, t.el, w).toLowerCase() : "none";
      const c = computed(el, "font-variant-caps", w) ?? computed(el, "font-variant", w);
      const fv = c ? resolve(c.d.value, c.el, w).toLowerCase() : "";
      const smallCaps = /small-caps|all-small-caps|petite-caps|unicase|titling-caps/.test(fv) ? c : null;
      const why = (d: Decl | undefined) =>
        d ? `${d.prop}: ${d.value}${/var\(/.test(d.value) ? ` (= ${resolve(d.value, el, w)})` : ""} · ${d.src} · ${d.sel}${d.media ? ` · @media ${d.media}` : ""}` : "";
      return { tt: /^(none|initial|revert|normal|)$/.test(tt) ? "" : tt, why: why(t?.d), sc: smallCaps ? fv : "", scWhy: why(smallCaps?.d) };
    };

    const { componentOf, pathOf } = makeLabeler(doc, elMap);
    const isHidden = hiddenChecker(doc);
    const byParent = new Map<Element, string>();
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || !/\p{L}/u.test(n.nodeValue ?? "") || p.closest("script, style, noscript, template, svg, .slick-cloned, .splide__slide--clone, .swiper-slide-duplicate")) continue;
      byParent.set(p, `${byParent.get(p) ?? ""} ${n.nodeValue}`);
    }
    const out: CasePart[] = [];
    for (const [el, text0] of byParent) {
      const text = clean(text0);
      if (!text) continue;
      const d = look(el, "d");
      const m = look(el, "m");
      const typed = capsRuns(text);
      if (!d.tt && !m.tt && !d.sc && !m.sc && !typed.length) continue;
      out.push({ t: text.length > 200 ? `${text.slice(0, 197)}…` : text, typed, d, m, comp: componentOf(el), path: pathOf(el), h: isHidden(el) });
    }
    return out;
  } catch (err) {
    logError("Audit", "Text case scan failed", `${url}: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : "");
    return [];
  }
}

export type CaseMode = "uppercase" | "lowercase" | "capitalize" | "small-caps" | "any";
export const CASE_LABEL: Record<CaseMode, string> = {
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "Capitalized",
  "small-caps": "small caps",
  any: "changed case",
};

export type CaseReason = { kind: "styled"; label: string; why: string; css: React.CSSProperties } | { kind: "typed"; runs: string[] };

/** Why one text counts for the chosen mode at the chosen screen. */
export function caseReasons(u: CasePart, mode: CaseMode, screen: Screen, skipAcronyms: boolean): CaseReason[] {
  const v = u[screen];
  const out: CaseReason[] = [];
  if ((mode === "small-caps" || mode === "any") && v.sc) {
    out.push({ kind: "styled", label: v.sc, why: v.scWhy, css: { fontVariantCaps: v.sc as React.CSSProperties["fontVariantCaps"] } });
  }
  if (mode !== "small-caps" && v.tt && (mode === "any" || v.tt.split(/\s+/).includes(mode))) {
    out.push({ kind: "styled", label: v.tt, why: v.why, css: { textTransform: v.tt as React.CSSProperties["textTransform"] } });
  }
  if (mode === "uppercase" || mode === "any") {
    const runs = u.typed.filter((r) => !(skipAcronyms && !/\s/.test(r) && r.replace(/[^\p{L}]/gu, "").length <= 4));
    if (runs.length) out.push({ kind: "typed", runs });
  }
  return out;
}
