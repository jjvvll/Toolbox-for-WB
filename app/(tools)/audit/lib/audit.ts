// The SEO audit: which pages to read, and what's checked on each one. Ported from
// the SEO Audit extension; the difference is that pages are read through the
// app's server (/api/audit/page) and the "live page" is the fetched HTML of
// the link you paste.

import type { ElementMap } from "@/app/api/audit/elements/route";
import type { FetchedPage } from "@/app/api/audit/page/route";
import { logError } from "@/lib/error-log";
import { collectHrefs, collectLinkInventory, collectSearchParts, type HrefItem, type LinkInventory, type Part } from "./collect";
import { collectColorParts, designCssUrl, type ColorPart } from "./colors";

export const CONCURRENCY = 4;
export const TITLE_MIN = 45;
export const TITLE_MAX = 60;
export const DESC_MIN = 145;
export const DESC_MAX = 160;

export type Source = "Navbar" | "Menu" | "Footer" | "Default" | "Current" | "Neighborhood" | "Agent";

export type PageLink = {
  href: string;
  text: string;
  source: Source;
  /** The made-up address that tests the site's 404 page. */
  probe?: boolean;
  /** Name the page after its H1 (agent and neighborhood pages). */
  useH1?: boolean;
};

export type Row = {
  url: string;
  label: string;
  source: Source;
  probe: boolean;
  status: number | null;
  title: string;
  description: string;
  flags: string[];
  /** Neighborhood and agent detail pages this page links to. */
  detailLinks: string[];
  /** Everything searchable (Keywords with hidden text). */
  parts: Part[];
  /** Visible text only (Keywords, Spelling). */
  visibleParts: Part[];
  colorParts: ColorPart[];
  linkInv: LinkInventory;
  hrefs: HrefItem[];
  /** The template's design stylesheet, for Colors. */
  designCss: string;
};

export type HeaderIssue = { area: "Header" | "Footer"; kind: string; name: string; snippet: string };

export type StartPage = {
  origin: string;
  pageUrl: string;
  links: PageLink[];
  headerIssues: HeaderIssue[];
  areaCounts: Record<"Header" | "Footer", number>;
};

// ---------- reading pages ----------

export class FetchError extends Error {}

/** Reads any URL through the app's server. Error pages come back with their status. */
export async function fetchPage(url: string, kind: "html" | "xml" | "css" = "html", signal?: AbortSignal): Promise<FetchedPage> {
  const res = await fetch(`/api/audit/page?kind=${kind}&url=${encodeURIComponent(url)}`, { signal, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new FetchError(body?.error ?? `Request failed (${res.status}).`);
  return body as FetchedPage;
}

export const clean = (s: string | null | undefined) =>
  (s ?? "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

/**
 * Parses fetched HTML. A DOMParser document never runs scripts or loads images,
 * and the server already removed <script> blocks.
 */
export function parseHtml(html: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  decodeCfEmails(doc);
  return doc;
}

// LP sites are served through Cloudflare, which replaces every email in the HTML
// with "[email protected]" and decodes it with JavaScript in the browser.
function cfDecode(hex: string): string {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 2, j = 0; i < hex.length; i += 2, j++) bytes[j] = parseInt(hex.slice(i, i + 2), 16) ^ key;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return "";
  }
}

function decodeCfEmails(doc: Document) {
  doc.querySelectorAll("[data-cfemail]").forEach((el) => {
    const email = cfDecode(el.getAttribute("data-cfemail") ?? "");
    if (email) el.replaceWith(doc.createTextNode(email));
  });
  doc.querySelectorAll('a[href*="/cdn-cgi/l/email-protection"]').forEach((a) => {
    const email = cfDecode(a.getAttribute("href")?.split("#")[1] ?? "");
    if (email) a.setAttribute("href", `mailto:${email}`);
  });
}

export const pathKey = (p: string) => (p.replace(/\/+$/, "") || "/").toLowerCase();

// ---------- the start page: navigation and header/footer links ----------

/** The site's menu links, and empty links in its header and footer, read from the pasted page. */
export function readStartPage(doc: Document, pageUrl: string): StartPage | { error: string } {
  const origin = new URL(pageUrl).origin;
  const sources: [Source, string][] = [
    ["Navbar", "#global-navbar a[href]"],
    ["Menu", "#global-sidemenu a[href]"],
    ["Footer", ".footer-navigation a[href], .footer-navigation-row a[href]"],
  ];
  const links: PageLink[] = [];
  let found = false;
  for (const [source, selector] of sources) {
    const els = doc.querySelectorAll(selector);
    if (els.length) found = true;
    els.forEach((a) => {
      const raw = (a.getAttribute("href") ?? "").trim();
      if (!raw || raw.startsWith("#") || /^(tel|mailto|sms|javascript):/i.test(raw)) return;
      let u: URL;
      try {
        u = new URL(raw, pageUrl);
      } catch {
        return;
      }
      if (u.origin !== origin) return;
      const text = clean(a.textContent);
      // Home Search and My Search Portal are LP's search app, behind bot protection.
      if (/search portal|^home search$/i.test(text) || /^\/home-search(\/|$)/.test(u.pathname)) return;
      links.push({ href: u.href, text, source });
    });
  }

  // Header and footer: empty links (no href / "#" / javascript:) and links with no text or label.
  const areas: ["Header" | "Footer", string][] = [
    ["Header", "#global-navbar a, header a"],
    ["Footer", 'footer a, [id*="footer" i] a, [class*="footer" i] a'],
  ];
  const areaOf = new Map<Element, "Header" | "Footer">();
  const areaCounts = { Header: 0, Footer: 0 };
  for (const [area, selector] of areas) {
    doc.querySelectorAll(selector).forEach((a) => {
      if (areaOf.has(a)) return;
      areaOf.set(a, area);
      areaCounts[area]++;
    });
  }
  const headerIssues: HeaderIssue[] = [];
  for (const [a, area] of areaOf) {
    const href = (a.getAttribute("href") ?? "").trim();
    const text = clean(a.textContent);
    const label = clean(
      a.getAttribute("aria-label") ||
        a.getAttribute("title") ||
        a.querySelector("img[alt]")?.getAttribute("alt") ||
        a.querySelector("svg title")?.textContent,
    );
    const li = a.closest("li");
    const sub = li?.querySelector("ul, .sub-nav, .dropdown-menu");
    const isTrigger =
      (sub && !sub.contains(a)) ||
      ["data-type", "data-toggle", "data-bs-toggle", "data-target", "onclick", "aria-haspopup", "aria-controls", "aria-expanded"].some(
        (n) => a.hasAttribute(n),
      ) ||
      a.getAttribute("role") === "button" ||
      a.classList.contains("toggle");
    const emptyHref = !href || href === "#" || /^javascript:\s*(void\(0\))?;?\s*$/i.test(href);
    const snippet = a.outerHTML.replace(/\s+/g, " ").slice(0, 130);
    // Left alone: cookie / privacy consent triggers and logo links.
    if (/consent/i.test(a.className) || /^your privacy choices$/i.test(text)) continue;
    if (/logo/i.test(a.className) || a.closest('[class*="logo" i]') || (/^\/?$/.test(href) && a.querySelector("img, svg"))) continue;
    if (emptyHref && !isTrigger) headerIssues.push({ area, kind: `Empty link (href="${href}")`, name: text || label || "(no text)", snippet });
    else if (!text && !label && !a.querySelector("img, svg"))
      headerIssues.push({ area, kind: "Empty link: no text, label or icon", name: "(no text)", snippet });
    else if (!text && !label) headerIssues.push({ area, kind: "Link has no text or aria-label (icon only)", name: "(icon only)", snippet });
  }

  if (!found && !areaOf.size) {
    return { error: "No #global-navbar, #global-sidemenu, header or footer navigation found on this page. Is it a Luxury Presence site?" };
  }
  return { origin, pageUrl, links, headerIssues, areaCounts };
}

/** Home, the pasted page, the menu links and the default pages, each once. */
export function buildList(start: StartPage): PageLink[] {
  const seen = new Set<string>();
  return [
    { href: `${start.origin}/`, text: "Home", source: "Default" as const },
    { href: start.pageUrl, text: "Current page", source: "Current" as const },
    ...start.links,
    { href: `${start.origin}/terms-and-conditions`, text: "Terms & Conditions", source: "Default" as const },
  ]
    .map((l) => {
      const u = new URL(l.href);
      u.search = "";
      u.hash = "";
      return { ...l, href: u.href };
    })
    .filter((l) => {
      const key = pathKey(new URL(l.href).pathname);
      if (seen.has(key)) return false; // links repeated in the menu and footer are checked once
      seen.add(key);
      return true;
    });
}

export const probeLink = (origin: string): PageLink => ({
  href: `${origin}/seo-audit-404-check-${Date.now()}`,
  text: "404 Page",
  source: "Default",
  probe: true,
});

// ---------- checks ----------

/** tel:/sms:/mailto: links whose shown number or email doesn't match the link, and invalid ones. */
export function checkContactLinks(items: { href: string; text: string }[]): string[] {
  const flags = new Set<string>();
  const digits = (s: string) => {
    let d = s.replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1); // drop the US country code
    return d;
  };
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  for (const it of items) {
    const href = (it.href || "").trim();
    const m = href.match(/^(mailto|tel|sms):(.*)$/i);
    if (!m) continue;
    const scheme = m[1].toLowerCase();
    const target = decode(m[2]).split("?")[0].split(";")[0].trim();
    const text = clean(it.text);
    if (scheme === "mailto") {
      const targets = target
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      // "Share by email" links (mailto:?subject=…) have no recipient on purpose.
      if (!targets.length && /[?&](subject|body|cc|bcc)=/i.test(href)) continue;
      if (!targets.length || !targets.every((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))) flags.add(`Invalid mailto: href is "${href}"`);
      const shown = (text.match(/[^\s<>()"',;:]+@[^\s<>()"',;]+\.[^\s<>()"',;]+/g) ?? []).map((s) => s.replace(/[.]+$/, ""));
      if (shown.length && !shown.some((s) => targets.includes(s.toLowerCase())))
        flags.add(`Email mismatch: shows ${shown[0]} but href is mailto:${target}`);
    } else {
      if (!digits(target)) flags.add(`Invalid ${scheme}: href is "${href}"`);
      const shown = text.match(/\+?[\d(][\d\s().-]{6,}\d/);
      if (shown && digits(shown[0]) !== digits(target))
        flags.add(`${scheme === "tel" ? "Phone" : "SMS"} mismatch: shows ${shown[0].trim()} but href is ${scheme}:${target}`);
    }
  }
  return [...flags];
}

/** Title 45–60 characters, meta description 145–160. */
export function seoProblems(row: Pick<Row, "title" | "description">): string[] {
  const problems: string[] = [];
  const check = (name: string, len: number, min: number, max: number) => {
    if (!len) problems.push(`${name} MISSING`);
    else if (len < min) problems.push(`${name} too short: ${len} chars (needs ${min}–${max})`);
    else if (len > max) problems.push(`${name} too long: ${len} chars (needs ${min}–${max})`);
  };
  check("Title", row.title.length, TITLE_MIN, TITLE_MAX);
  check("Description", row.description.length, DESC_MIN, DESC_MAX);
  return problems;
}

export const isBroken = (row: Row) => !row.probe && row.flags.some((f) => /404|HTTP|failed/i.test(f));
export const hasContactIssue = (row: Row) => row.flags.some((f) => /mismatch|invalid/i.test(f));

// ---------- neighborhood and agent detail pages ----------

export const DETAIL_PATH = /^\/(neighborhoods|agents?)\/[^/{}?#]+\/?$/i;
export const GROUP_PATH: Record<"Neighborhood" | "Agent", (p: string) => boolean> = {
  Neighborhood: (p) => /^\/neighborhoods\//.test(p),
  Agent: (p) => /^\/agents?\//.test(p),
};
export const slugTitle = (p: string) =>
  decodeURIComponent(pathKey(p).split("/").pop() ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function detailLinksIn(doc: Document, base: string): string[] {
  const origin = new URL(base).origin;
  const out = new Set<string>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    try {
      const u = new URL(a.getAttribute("href") ?? "", base);
      if (u.origin === origin && DETAIL_PATH.test(u.pathname)) out.add(pathKey(u.pathname));
    } catch {
      // bad href
    }
  });
  return [...out];
}

/** Neighborhood and agent pages listed in the site's sitemaps. */
export async function sitemapDetailPaths(origin: string): Promise<string[]> {
  const getXml = async (url: string) => new DOMParser().parseFromString((await fetchPage(url, "xml")).body, "text/xml");
  const locs = (d: Document) => [...d.getElementsByTagName("loc")].map((l) => (l.textContent ?? "").trim());
  const toPath = (u: string) => {
    try {
      return new URL(u).pathname;
    } catch {
      return null;
    }
  };
  try {
    const top = locs(await getXml(`${origin}/sitemap.xml`));
    const paths = top.map(toPath).filter((p): p is string => !!p && DETAIL_PATH.test(p)); // a plain sitemap (no index)
    for (const sub of top.filter((u) => /sitemap-(neighborhoods?|agents?)-dpages/i.test(u))) {
      const subPath = toPath(sub);
      if (!subPath) continue;
      // Read from the site being audited: preview hosts may list the production domain.
      locs(await getXml(origin + subPath))
        .map(toPath)
        .forEach((p) => {
          if (p && DETAIL_PATH.test(p)) paths.push(p);
        });
    }
    return paths.map(pathKey);
  } catch {
    return [];
  }
}

// ---------- one page ----------

/**
 * Reads one page and checks it. `probeTitle` is the 404 page's title, for spotting
 * pages that answer "200 OK" with the 404 page.
 */
export async function auditPage(link: PageLink, probeTitle: string | undefined, elMap: ElementMap | null): Promise<Row> {
  const row: Row = {
    url: link.href,
    label: link.text,
    source: link.source,
    probe: !!link.probe,
    status: null,
    title: "",
    description: "",
    flags: [],
    detailLinks: [],
    parts: [],
    visibleParts: [],
    colorParts: [],
    linkInv: { links: [], dead: [] },
    hrefs: [],
    designCss: "",
  };
  try {
    const page = await fetchPage(link.href);
    row.status = page.status;
    const doc = parseHtml(/html/i.test(page.contentType) ? page.body : "");
    row.title = clean(doc.querySelector("title")?.textContent);
    row.description = clean(doc.querySelector('meta[name="description" i]')?.getAttribute("content"));
    row.detailLinks = detailLinksIn(doc, link.href);
    // Colors first: they live in the <style> blocks removed for the text search below.
    row.colorParts = collectColorParts(doc, elMap);
    row.linkInv = collectLinkInventory(doc, link.href, elMap);
    row.hrefs = collectHrefs(doc, link.href, elMap);
    row.designCss = designCssUrl(doc, link.href);
    if (link.useH1) row.label = clean(doc.querySelector("h1")?.textContent).slice(0, 60) || row.label;
    const contacts = [...doc.querySelectorAll('a[href^="mailto:" i], a[href^="tel:" i], a[href^="sms:" i]')].map((a) => ({
      href: a.getAttribute("href") ?? "",
      text: a.textContent ?? "",
    }));
    row.flags.push(...checkContactLinks(contacts));
    doc.querySelectorAll("script, style, noscript, template").forEach((n) => n.remove());
    // Testimonials are left out of the text search. Wrappers that also hold the header, footer
    // or nav are kept, so a class like "testimonials-page" can't wipe out the whole page.
    doc.querySelectorAll('[class*="testimonial" i], [id*="testimonial" i]').forEach((n) => {
      if (n === doc.body || n === doc.documentElement || n.querySelector("header, footer, nav, #global-navbar, #global-sidemenu")) return;
      n.remove();
    });
    row.parts = collectSearchParts(doc, false, elMap);
    row.visibleParts = collectSearchParts(doc, true, elMap);

    const wantPath = new URL(link.href).pathname.replace(/\/$/, "");
    const gotPath = new URL(page.url).pathname.replace(/\/$/, "");
    if (row.probe) {
      if (page.status !== 404) row.flags.push(`No real 404: server returned ${page.status}`);
    } else {
      if (page.status === 404 || page.status === 410) row.flags.push("404 NOT FOUND");
      else if (page.status >= 400) row.flags.push(`HTTP ${page.status}`);
      else if (probeTitle && page.status === 200 && row.title === probeTitle) row.flags.push("Soft 404 (same title as 404 page)");
      if (wantPath !== gotPath) row.flags.push(`Redirects to ${gotPath || "/"}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    row.flags.push(`Request failed: ${message}`);
    logError("Audit", "Page could not be read", `${link.href}: ${message}`, err instanceof Error ? err.stack : "");
  }
  return row;
}

/** Runs `work` over `items`, a few at a time, keeping the original order. */
export async function pool<T, R>(items: T[], work: (item: T, index: number) => Promise<R>, onDone?: (done: number) => void, isCancelled?: () => boolean): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length && !isCancelled?.()) {
        const i = next++;
        out[i] = await work(items[i], i);
        onDone?.(++done);
      }
    }),
  );
  return out;
}
