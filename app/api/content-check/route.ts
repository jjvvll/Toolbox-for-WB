import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

export type PageResponse = {
  /** Where the page ended up after redirects. */
  url: string;
  /** The page's HTML with scripts and styles removed. */
  html: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 25_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** An error whose message is safe and useful to show in the tool. */
class PageError extends Error {}

// Browsers can't read other sites' HTML, so the content checker fetches pages
// through here: `?url=<page>` returns that page's HTML for the client to parse.
export async function GET(request: NextRequest) {
  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return Response.json({ error: "Enter a full link, like https://example.com." }, { status: 400 });
  }

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let res: Response;
    // Redirects are followed by hand so every hop gets the same address check.
    for (let hop = 0; ; hop++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new PageError("The page redirects too many times.");
      url = new URL(location, url);
    }

    if (!res.ok) throw new PageError(`The page returned an error (${res.status}).`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) throw new PageError("That link isn't a web page.");

    const html = decode(await readCapped(res), type);
    const body: PageResponse = {
      url: url.href,
      // Scripts and styles are most of a page's weight and none of its text.
      html: html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof PageError) return Response.json({ error: err.message }, { status: 502 });
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json(
      { error: timedOut ? "The site took too long to respond." : "Couldn't reach that site." },
      { status: 502 },
    );
  }
}

/** Refuses anything but public http(s) hosts, so this can't be used to read internal services. */
async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PageError("Only http and https links can be checked.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new PageError("That site couldn't be found.");
    }
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new PageError("That address isn't a public website.");
  }
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  // Unspecified, loopback, unique-local, link-local, and other IPv4-mapped forms.
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("::ffff:");
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new PageError("That page is too large to check.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // unknown charset label
  }
}
