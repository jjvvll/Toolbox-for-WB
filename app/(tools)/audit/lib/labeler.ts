// Names the part of a page an element belongs to: the official LP element name
// (from data-el-id) when known, otherwise a guess from the class names. Shared by
// every search, so results say "Hero Banner › H2" instead of a bare selector.

import type { ElementMap } from "@/app/api/audit/elements/route";
import { clean } from "./audit";

export type Comp = {
  name: string;
  template?: string;
  elId?: string;
  id?: string;
  cls?: string;
  heading?: string;
  /** Header, side menu, footer, popups: the same on every page, so results list them once. */
  global?: boolean;
};

const GENERIC = /^(section|redesign|parallax|hidable|modal|collection|lp-[\w-]*|js-[\w-]*|is-[\w-]*|video-wrapper|overlay-component|height-class-[\w-]*)$/i;
const ABBR: Record<string, string> = { hv: "home valuation", ig: "Instagram", cta: "CTA" };
const humanize = (c: string) =>
  c
    .split(/[-_]+/)
    .map((w) => ABBR[w.toLowerCase()] ?? w)
    .join(" ")
    .replace(/^\w/, (ch) => ch.toUpperCase());

export type Labeler = { componentOf: (el: Element) => Comp; pathOf: (el: Element) => string };

export function makeLabeler(doc: Document, elMap: ElementMap | null): Labeler {
  const body = doc.body;
  const cache = new Map<Element, Comp>();

  const componentOf = (el: Element): Comp => {
    // 1) The official LP element name, from data-el-id on the section or global element.
    const host = elMap ? el.closest("[data-el-id]") : null;
    const known = host && elMap?.[host.getAttribute("data-el-id") ?? ""];
    if (host && known) {
      const hit = cache.get(host);
      if (hit) return hit;
      const isSection = host.matches("section");
      const info: Comp = {
        name: known[0] || "Element",
        template: known[1] || "",
        elId: host.getAttribute("data-el-id") ?? "",
        id: host.id,
        heading: isSection ? clean(host.querySelector("h1, h2, h3")?.textContent).slice(0, 40) : "",
        global: !isSection,
      };
      cache.set(host, info);
      return info;
    }
    // 2) A guess from the class names.
    const sec = el.closest('section[id^="section-"]');
    if (!sec) {
      if (el.closest("#global-navbar, header")) return { name: "Header / navbar", global: true };
      if (el.closest("#global-sidemenu")) return { name: "Side menu", global: true };
      if (el.closest('#lp-consent-banner, [class*="consent" i]')) return { name: "Cookie banner", global: true };
      if (el.closest("#global-footer, footer")) return { name: "Footer", global: true };
      // The outermost popup or widget, so inner ids still name the whole popup. Checked before the
      // loose footer match: popups contain classes like "contact-form__footer".
      let holder: Element | null = null;
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (e.matches('[id^="global-"], [id*="modal" i], [class*="floating-contact" i]')) holder = e;
      }
      if (holder) {
        const raw = holder.id || [...holder.classList].find((c) => /floating-contact/i.test(c)) || "";
        const isPopup = /modal|pop-?up/i.test(raw);
        const name = humanize(raw.replace(/^(modal-)?(global-)?/i, "").replace(/-?modal$/i, ""));
        return { name: name + (isPopup ? " (popup)" : ""), id: holder.id, global: true };
      }
      if (el.closest('[class*="footer" i]')) return { name: "Footer", global: true };
      return { name: "Page (outside sections)" };
    }
    const hit = cache.get(sec);
    if (hit) return hit;
    let cls: string | undefined;
    for (const child of sec.children) {
      if (/^(SCRIPT|LINK|STYLE|TEMPLATE|NOSCRIPT)$/.test(child.tagName)) continue;
      cls = [...child.classList].find((c) => !GENERIC.test(c) && !c.includes("__") && !c.includes("--"));
      if (cls) break;
    }
    const info: Comp = {
      name: cls ? humanize(cls) : "Section",
      cls: cls ?? "",
      heading: clean(sec.querySelector("h1, h2, h3")?.textContent).slice(0, 40),
      id: sec.id,
    };
    cache.set(sec, info);
    return info;
  };

  // The element's path inside its section, up to 4 levels.
  const desc = (el: Element) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].filter((c) => !/^(js-|is-|slick-|splide)/.test(c)).slice(0, 2);
    if (cls.length) s += `.${cls.join(".")}`;
    return s;
  };
  const pathOf = (el: Element) => {
    const out: string[] = [];
    for (let e: Element | null = el; e && e !== body && out.length < 4; e = e.parentElement) {
      if (e.matches('section[id^="section-"]')) break;
      out.unshift(desc(e));
    }
    return out.join(" › ");
  };

  return { componentOf, pathOf };
}

/** A one-line description of a component, for copied reports. */
export const compText = (c: Comp | null | undefined) => (c ? `${c.name}${c.template ? ` [${c.template}]` : ""} › ` : "");
