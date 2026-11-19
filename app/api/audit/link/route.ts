import type { NextRequest } from "next/server";
import { PageError, safeFetch } from "@/lib/safe-fetch";

/** The answer for one checked link. `status` is 0 when no answer came. */
export type LinkCheck = {
  status: number;
  url: string;
  error?: "timeout" | "connect" | "blocked";
  /** Seconds to wait, when the site answered 429 Too Many Requests with a Retry-After header. */
  retryAfter?: number;
};

const TIMEOUT_MS = 15_000;

// Dead-link checks for the Audit tool: a HEAD request, then GET if the server
// refuses HEAD (many do). Always answers 200 with what happened, since a dead
// link is a result, not a failure of this route.
export async function GET(request: NextRequest) {
  let start: URL;
  try {
    start = new URL(request.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return Response.json({ error: "Bad link." }, { status: 400 });
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const answer = (body: LinkCheck) => Response.json(body, { headers: { "cache-control": "no-store" } });
  try {
    let { res, url } = await safeFetch(start, { method: "HEAD", accept: "*/*", signal, maxRedirects: 10, strictRedirects: false });
    if (res.status >= 400) {
      ({ res, url } = await safeFetch(start, { method: "GET", accept: "text/html,*/*;q=0.8", signal, maxRedirects: 10, strictRedirects: false }));
      await res.body?.cancel().catch(() => {});
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    return answer({ status: res.status, url: url.href, ...(res.status === 429 && retryAfter > 0 ? { retryAfter } : {}) });
  } catch (err) {
    if (err instanceof PageError) return answer({ status: 0, url: start.href, error: /public website|http and https/.test(err.message) ? "blocked" : "connect" });
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return answer({ status: 0, url: start.href, error: timedOut ? "timeout" : "connect" });
  }
}
