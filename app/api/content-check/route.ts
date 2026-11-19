import type { NextRequest } from "next/server";
import { PageError, fetchErrorMessage, readText, safeFetch } from "@/lib/safe-fetch";

export type PageResponse = {
  /** Where the page ended up after redirects. */
  url: string;
  /** The page's HTML with scripts and styles removed. */
  html: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

// Browsers can't read other sites' HTML, so the content checker fetches pages
// through here: `?url=<page>` returns that page's HTML for the client to parse.
export async function GET(request: NextRequest) {
  let start: URL;
  try {
    start = new URL(request.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return Response.json({ error: "Enter a full link, like https://example.com." }, { status: 400 });
  }

  try {
    const { res, url } = await safeFetch(start, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new PageError(`The page returned an error (${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) throw new PageError("That link isn't a web page.");

    const html = await readText(res, MAX_BYTES);
    const body: PageResponse = {
      url: url.href,
      // Scripts and styles are most of a page's weight and none of its text.
      html: html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return Response.json({ error: fetchErrorMessage(err) }, { status: 502 });
  }
}
