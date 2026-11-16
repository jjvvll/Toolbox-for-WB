// Pulls the readable text and the menu links out of a parsed page.

export type ExtractedPage = {
  title: string;
  /** Visible text of the body, single-spaced. */
  text: string;
  /** Page title and meta description — on the page, but not visible in it. */
  meta: string;
  /** Absolute same-site links from the side menu (or the whole page if there's no menu). */
  links: string[];
  menuFound: boolean;
};

/** The element that lists a site's pages. */
export const MENU_ID = "global-sidemenu";

const SKIPPED = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "IFRAME",
  "CANVAS",
  "OBJECT",
]);

// Formatting tags sit inside a sentence ("<b>Bold</b>ly"), so they add no word
// break. Every other element does: sites lean on CSS, not whitespace, to keep
// neighbours like <span>Title</span><span>Subtitle</span> apart.
const FORMATTING = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "SUP",
  "SUB",
  "MARK",
  "SMALL",
  "ABBR",
  "FONT",
  "CODE",
  "Q",
  "CITE",
  "INS",
  "DEL",
  "WBR",
]);

const FILE_LINK = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mov|mp3)$/i;
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;
// The home-search section is a listings app with no site copy; it's left out of every scan.
const EXEMPT_PATH = /^\/home-search(\/|$)/i;

export function extractPage(doc: Document, pageUrl: string): ExtractedPage {
  const out: string[] = [];
  if (doc.body) collectText(doc.body, out);
  const title = clean(doc.title ?? "");
  const description = clean(
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
  );
  const menu = doc.getElementById(MENU_ID);
  return {
    title,
    text: clean(out.join("")),
    meta: [title, description].filter(Boolean).join(" \n "),
    links: siteLinks(menu ?? doc.body, pageUrl),
    menuFound: !!menu,
  };
}

/** Identifies a page regardless of fragment or trailing slash. */
export function pageKey(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/\/+$/, "") + u.search;
}

function clean(text: string): string {
  return text.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function collectText(parent: Node, out: string[]): void {
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 3) {
      out.push(node.nodeValue ?? "");
    } else if (node.nodeType === 1) {
      const el = node as Element;
      const tag = el.tagName.toUpperCase();
      if (SKIPPED.has(tag)) continue;
      // Cloudflare swaps email addresses for a placeholder plus an encoded attribute.
      const encoded = el.getAttribute("data-cfemail");
      if (encoded) {
        out.push(` ${decodeCfEmail(encoded)} `);
        continue;
      }
      const inline = FORMATTING.has(tag) || isDropCap(el);
      if (!inline) out.push(" ");
      collectText(el, out);
      if (!inline) out.push(" ");
    }
  }
}

/** A span around a single letter is a styled initial, still part of its word. */
function isDropCap(el: Element): boolean {
  const only = el.firstChild;
  return (
    el.tagName.toUpperCase() === "SPAN" &&
    !!only &&
    !only.nextSibling &&
    only.nodeType === 3 &&
    /^\p{L}$/u.test(only.nodeValue ?? "")
  );
}

function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let email = "";
  for (let i = 2; i + 1 < hex.length; i += 2) {
    email += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  }
  return email;
}

function siteLinks(root: Element | null, pageUrl: string): string[] {
  if (!root) return [];
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  const links: string[] = [];
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") ?? "", pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue; // also drops tel:, mailto: and other sites
    if (url.pathname.startsWith("/cdn-cgi/") || FILE_LINK.test(url.pathname)) continue;
    if (EXEMPT_PATH.test(url.pathname)) continue;
    url.hash = "";
    const key = pageKey(url.href);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(url.href);
  }
  return links;
}
