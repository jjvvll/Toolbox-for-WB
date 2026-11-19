// Server-side fetching of other websites for the tools that read them (browsers
// can't read other sites' HTML). Every hop of a redirect is checked so these
// routes can't be used to reach internal or private addresses.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** An error whose message is safe and useful to show in the tool. */
export class PageError extends Error {}

type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  accept?: string;
  signal?: AbortSignal;
  maxRedirects?: number;
  /** When false, a redirect loop or too many hops throws; otherwise the last response is returned. */
  strictRedirects?: boolean;
};

/**
 * Fetches a public http(s) URL, following redirects by hand so every hop gets
 * the same address check. Returns the final response and where it ended up.
 */
export async function safeFetch(
  start: URL,
  { method = "GET", accept = "text/html,application/xhtml+xml", signal, maxRedirects = 5, strictRedirects = true }: SafeFetchOptions = {},
): Promise<{ res: Response; url: URL }> {
  let url = start;
  for (let hop = 0; ; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      method,
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: { "user-agent": USER_AGENT, accept, "cache-control": "no-cache", pragma: "no-cache" },
    });
    if (res.status < 300 || res.status >= 400) return { res, url };
    const location = res.headers.get("location");
    if (!location) return { res, url };
    if (hop >= maxRedirects) {
      if (strictRedirects) throw new PageError("The page redirects too many times.");
      return { res, url };
    }
    // Drain the redirect's body so the connection can be reused.
    await res.body?.cancel().catch(() => {});
    url = new URL(location, url);
  }
}

/** Refuses anything but public http(s) hosts, so this can't be used to read internal services. */
export async function assertPublic(url: URL): Promise<void> {
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

/** The response body as text, refusing anything over `maxBytes`. */
export async function readText(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PageError("That page is too large to check.");
    }
    chunks.push(value);
  }
  const type = res.headers.get("content-type") ?? "";
  const charset = type.match(/charset=["']?([\w-]+)/i)?.[1];
  const bytes = Buffer.concat(chunks);
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes); // unknown charset label
  }
}

/** A message for a failed fetch that's safe to show. */
export function fetchErrorMessage(err: unknown): string {
  if (err instanceof PageError) return err.message;
  if (err instanceof Error && err.name === "TimeoutError") return "The site took too long to respond.";
  return "Couldn't reach that site.";
}
