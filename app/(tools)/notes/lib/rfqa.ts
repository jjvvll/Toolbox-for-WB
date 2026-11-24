// The "sending for RFQA" message for a note: its Front End and Client Folder links,
// the palette tool's current :root colors and the pages in the site's side menu.

import { fetchPage, parseHtml, pathKey, readStartPage } from "@/app/(tools)/audit/lib/audit";
import { PALETTE_STORAGE_KEY, savedRootColors } from "@/app/(tools)/color-palette/lib/saved-root";
import type { Note } from "./db";

export type RfqaParts = {
  frontEnd: string;
  clientFolder: string;
  colors: string[];
  pages: string[];
  /** Why the pages couldn't be read, if they couldn't. */
  pagesError: string;
};

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * The page names in the site's side menu, read the same way as the Audit tool reads
 * the start page (which already skips Home Search and the search portal).
 */
export async function sideMenuPages(frontEnd: string): Promise<string[]> {
  const page = await fetchPage(withScheme(frontEnd));
  const read = readStartPage(parseHtml(page.body), page.url);
  if ("error" in read) throw new Error(read.error);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const link of read.links) {
    if (link.source !== "Menu") continue;
    const key = pathKey(new URL(link.href).pathname);
    // The home page is always listed as "Home" (its menu link is often a logo, or has no text).
    const name = key === "/" ? "Home" : link.text || key;
    if (seen.has(key) || /^home search$/i.test(name)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** Reads everything the message needs; call it in the browser. */
export async function rfqaParts(note: Pick<Note, "links">): Promise<RfqaParts> {
  const frontEnd = note.links?.frontEnd?.trim() ?? "";
  const clientFolder = note.links?.clientFolder?.trim() ?? "";
  let colors: string[] = [];
  try {
    colors = savedRootColors(localStorage.getItem(PALETTE_STORAGE_KEY));
  } catch {
    // storage blocked
  }
  let pages: string[] = [];
  let pagesError = "";
  if (frontEnd) {
    try {
      pages = await sideMenuPages(frontEnd);
      if (!pages.length) pagesError = "No side menu links found on the Front End page.";
    } catch (e) {
      pagesError = `Couldn't read the Front End page: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { frontEnd, clientFolder, colors, pages, pagesError };
}
const linkLine = (p: RfqaParts) =>
  [p.frontEnd ? `Front End: ${p.frontEnd}` : "Front End", p.clientFolder ? `Client Folder: ${p.clientFolder}` : "Client Folder"].join(" | ");

export function rfqaText(p: RfqaParts): string {
  return [
    "Hi Team! Done implementing WD Build for this client, sending this for RFQA, please see notes below.",
    "",
    linkLine(p),
    "",
    "Color palette",
    ...p.colors.map((c) => `• ${c}`),
    "",
    "Pages Created",
    ...p.pages.map((page) => `• ${page}`),
    "",
    "Please let me know if there are any concerns. Thank you!",
    "cc:",
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const href = (url: string) => esc(withScheme(url));

/** The same message with "Front End" and "Client Folder" as links, for pasting into chat or email. */
export function rfqaHtml(p: RfqaParts): string {
  const link = (label: string, url: string) => (url ? `<a href="${href(url)}">${label}</a>` : label);
  const bullets = (list: string[]) => (list.length ? `<ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "");
  return [
    "<p>Hi Team! Done implementing WD Build for this client, sending this for RFQA, please see notes below.</p>",
    `<p>${link("Front End", p.frontEnd)} | ${link("Client Folder", p.clientFolder)}</p>`,
    `<p>Color palette</p>${bullets(p.colors)}`,
    `<p>Pages Created</p>${bullets(p.pages)}`,
    "<p>Please let me know if there are any concerns. Thank you!<br>cc:</p>",
  ].join("");
}
