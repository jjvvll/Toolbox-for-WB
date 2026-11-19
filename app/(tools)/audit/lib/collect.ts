// What the audit keeps from each page for the searches: its text pieces, its
// links and buttons, and every URL it links to. Collected once, while the page is
// read, so the searches are instant.

import type { ElementMap } from "@/app/api/audit/elements/route";
import { clean } from "./audit";
import { makeLabeler, type Comp } from "./labeler";

/** One searchable piece of a page. */
export type Part = { where: string; text: string; path: string; comp: Comp | null };

/** A link to check (dead links). */
export type LinkItem = { text: string; comp: Comp; path: string; href: string; ext: boolean };
/** A link or button that's broken without being checked: empty, malformed, a button that does nothing. */
export type DeadItem = { text: string; comp: Comp; path: string; href: string; why: string; maybe?: boolean };
export type LinkInventory = { links: LinkItem[]; dead: DeadItem[] };

/** Every link-like URL on the page, for Link search. */
export type HrefItem = { raw: string; abs: string; attr: string; tag: string; text: string; comp: Comp; path: string };

const TESTIMONIALS = '[class*="testimonial" i], [id*="testimonial" i]';
const CLONES = ".slick-cloned, .splide__slide--clone, .swiper-slide-duplicate";
// "Visible text" is text inside text elements, read from the HTML, so text in popups still counts.
const TEXT_TAGS = "h1, h2, h3, h4, h5, h6, p, span, li, ol, ul, a, button, label, blockquote, q, td, th, dt, dd, figcaption, strong, em, b, i, small, cite";

/**
 * Every searchable piece of a page. `visibleOnly` keeps text inside text
 * elements; otherwise alt text, title/aria attributes, link URLs, placeholders,
 * meta tags and loose text are included. Testimonials and slider clones are skipped.
 */
export function collectSearchParts(doc: Document, visibleOnly: boolean, elMap: ElementMap | null): Part[] {
  const body = doc.body;
  const parts: Part[] = [];
  if (!body) return parts;
  const { componentOf, pathOf } = makeLabeler(doc, elMap);

  const testi = [...doc.querySelectorAll(TESTIMONIALS)].filter(
    (n) => n !== body && n !== doc.documentElement && !n.querySelector("header, footer, nav, #global-navbar, #global-sidemenu"),
  );
  const inTesti = (el: Element) => !!el.closest(TESTIMONIALS) && testi.some((t) => t.contains(el));
  const add = (where: string, raw: string | null | undefined, el: Element | null, path?: string) => {
    const text = clean(raw);
    if (!text) return;
    if (el && (inTesti(el) || el.closest(CLONES) || (visibleOnly && !el.closest(TEXT_TAGS)))) return;
    parts.push({ where, text, path: path ?? (el ? pathOf(el) : ""), comp: el ? componentOf(el) : null });
  };

  if (!visibleOnly) {
    doc.querySelectorAll('meta[property^="og:" i], meta[name^="twitter:" i], meta[name="keywords" i]').forEach((m) => {
      const attr = m.hasAttribute("property") ? "property" : "name";
      add("meta tag", m.getAttribute("content"), null, `head › meta[${attr}="${m.getAttribute(attr)}"]`);
    });
    body.querySelectorAll("img[alt]").forEach((e) => add("alt", e.getAttribute("alt"), e));
    body.querySelectorAll("[title]").forEach((e) => add("title attribute", e.getAttribute("title"), e));
    body.querySelectorAll("[aria-label]").forEach((e) => add("aria-label", e.getAttribute("aria-label"), e));
    body.querySelectorAll("a[href]").forEach((e) => add("link URL", e.getAttribute("href"), e));
    body.querySelectorAll("[placeholder]").forEach((e) => add("placeholder", e.getAttribute("placeholder"), e));
  }
  body.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((e) => add(e.tagName, e.textContent, e));
  body.querySelectorAll("a").forEach((e) => add("link text", e.textContent, e));
  body.querySelectorAll("button").forEach((e) => add("button", e.textContent, e));

  // Plain text, grouped by the element that directly holds it (p, span, li, div …).
  const skip = "h1, h2, h3, h4, h5, h6, a, button, script, style, noscript, template";
  const byParent = new Map<Element, string>();
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const p = n.parentElement;
    if (!p || !n.nodeValue?.trim() || p.closest(skip)) continue;
    byParent.set(p, `${byParent.get(p) ?? ""} ${n.nodeValue}`);
  }
  byParent.forEach((t, p) => add("body text", t, p));
  return parts;
}

// A JavaScript-driven control (menu, slider arrow, popup, read more …) isn't dead without a URL.
const WIRED_ATTRS = ["data-type", "data-toggle", "data-bs-toggle", "data-target", "data-bs-target", "onclick", "aria-controls", "aria-haspopup", "aria-expanded", "data-modal", "data-href", "data-url", "data-action", "data-dismiss", "data-bs-dismiss", "data-slide", "data-filter", "data-num"];
const WIRED_CLASS = /(^|[\s_-])(js|toggle|close|slick|splide|swiper|lp-arrow|arrow|read-more|btn-more|btn-expand|btn-collapse|load-more|pagination|paginationjs|tab|accordion|dropdown|sub-nav|menu|hamburger|play|filter|search|sort|consent|modal|prev|next)([\s_-]|$)/i;

const linkLabel = (el: Element) =>
  clean(el.textContent) || clean(el.getAttribute("aria-label")) || clean(el.getAttribute("title")) || clean(el.querySelector("img[alt]")?.getAttribute("alt"));

/** Every link and button on the page: links to check, and ones that are broken as they stand. */
export function collectLinkInventory(doc: Document, base: string, elMap: ElementMap | null): LinkInventory {
  const { componentOf, pathOf } = makeLabeler(doc, elMap);
  const origin = new URL(base).origin;
  const links: LinkItem[] = [];
  const dead: DeadItem[] = [];
  const isWired = (el: Element) =>
    WIRED_ATTRS.some((a) => el.hasAttribute(a)) ||
    [el, el.parentElement].some((e) => e && WIRED_CLASS.test(typeof e.className === "string" ? e.className : "")) ||
    [el, el.parentElement].some((e) => e && [...e.classList].some((c) => /^js[A-Z_-]/.test(c))) ||
    !!el.closest('form, [class*="pagination" i], [class*="logo" i], .slick-slider, .splide, .swiper');

  doc.querySelectorAll("a, button").forEach((el) => {
    if (el.closest("template, noscript")) return;
    const info = { text: (linkLabel(el) || "(no text)").slice(0, 80), comp: componentOf(el), path: pathOf(el) };
    if (el.tagName === "BUTTON") {
      const type = (el.getAttribute("type") ?? "").toLowerCase();
      if (type === "submit" || type === "reset" || isWired(el)) return;
      dead.push({ ...info, href: "", why: "Button with no link or action found", maybe: true });
      return;
    }
    if (!el.hasAttribute("href")) {
      if (!isWired(el)) dead.push({ ...info, href: "", why: "Link has no href", maybe: true });
      return;
    }
    const raw = (el.getAttribute("href") ?? "").trim();
    if (/^(mailto|tel|sms):/i.test(raw)) return; // checked by the phone / email check
    if (!raw || raw === "#" || /^javascript:\s*(void\(0\))?;?\s*$/i.test(raw)) {
      if (!isWired(el)) dead.push({ ...info, href: raw || "(empty)", why: "Empty link (goes nowhere)" });
      return;
    }
    if (raw.startsWith("#")) return; // a jump within the page
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      dead.push({ ...info, href: raw, why: "Malformed URL" });
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    u.hash = "";
    if (u.origin === origin && /^\/home-search(\/|$)/.test(u.pathname)) return; // LP's search app, behind bot protection
    links.push({ ...info, href: u.href, ext: u.origin !== origin });
  });
  return { links, dead };
}

/** Every link-like URL on the page, unfiltered (Home Search, mailto, tel … included). */
export function collectHrefs(doc: Document, base: string, elMap: ElementMap | null): HrefItem[] {
  const { componentOf, pathOf } = makeLabeler(doc, elMap);
  const out: HrefItem[] = [];
  doc.querySelectorAll("a[href], area[href], [data-href], [data-url], form[action], iframe[src]").forEach((el) => {
    if (el.closest("template, noscript")) return;
    const attr = ["href", "data-href", "data-url", "action", "src"].find((a) => el.hasAttribute(a));
    if (!attr) return;
    const raw = (el.getAttribute(attr) ?? "").trim();
    if (!raw || raw === "#") return;
    let abs = raw;
    try {
      abs = new URL(raw, base).href;
    } catch {
      // keep it as written
    }
    out.push({ raw, abs, attr, tag: el.tagName.toLowerCase(), text: (linkLabel(el) || "").slice(0, 80), comp: componentOf(el), path: pathOf(el) });
  });
  return out;
}
