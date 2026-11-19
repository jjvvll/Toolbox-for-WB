import type { NextRequest } from "next/server";
import { fetchErrorMessage, readText, safeFetch } from "@/lib/safe-fetch";

export type FetchedPage = {
  /** HTTP status of the final response (after redirects). */
  status: number;
  /** Where the request ended up after redirects. */
  url: string;
  contentType: string;
  /** The body as text, with <script> blocks removed from HTML. Empty for non-text responses. */
  body: string;
};

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

const ACCEPT: Record<string, string> = {
  html: "text/html,application/xhtml+xml",
  xml: "application/xml,text/xml,*/*;q=0.5",
  css: "text/css,*/*;q=0.1",
};

// The Audit tool reads pages, sitemaps and stylesheets through here. Unlike
// the content checker's route, error pages come back too (with their status),
// since a 404 or a redirect is exactly what the audit reports.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let start: URL;
  try {
    start = new URL(params.get("url") ?? "");
  } catch {
    return Response.json({ error: "Enter a full link, like https://example.com." }, { status: 400 });
  }

  try {
    const { res, url } = await safeFetch(start, {
      accept: ACCEPT[params.get("kind") ?? "html"] ?? ACCEPT.html,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = res.headers.get("content-type") ?? "";
    const isText = !contentType || /text|html|xml|css|json/i.test(contentType);
    let body = isText ? await readText(res, MAX_BYTES) : "";
    if (!isText) await res.body?.cancel().catch(() => {});
    // Scripts are most of a page's weight and nothing the audit reads.
    if (/html/i.test(contentType)) body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
    const page: FetchedPage = { status: res.status, url: url.href, contentType, body };
    return Response.json(page, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return Response.json({ error: fetchErrorMessage(err) }, { status: 502 });
  }
}
