"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logError } from "@/lib/error-log";
import { TOOLS } from "@/lib/tools";

/** The tool a path belongs to, as named in the tabs. */
function toolFor(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const tool = TOOLS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  if (tool) return tool.name;
  if (pathname.startsWith("/login")) return "Login";
  return pathname;
}

const describe = (v: unknown) => {
  if (v instanceof Error) return v.message || v.name;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
const stackOf = (v: unknown) => (v instanceof Error && v.stack) || "";

// Statuses the tools expect and handle themselves: bad input, not signed in, rate limits.
const QUIET_STATUS = new Set([400, 401, 404, 429]);

/**
 * Catches failures anywhere in the app and adds them to the error log: script
 * errors, unhandled promise failures, console errors and warnings, blocked
 * resources, and failed requests to the app's own API. Mounted once in the root layout.
 */
export default function ErrorCapture() {
  const pathname = usePathname();
  const tool = useRef(toolFor(pathname));
  useEffect(() => {
    tool.current = toolFor(pathname);
  }, [pathname]);

  useEffect(() => {
    const add = (kind: string, message: unknown, detail: unknown = "") => logError(tool.current, kind, message, detail);

    const onError = (e: ErrorEvent) => {
      const at = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : "";
      add("Script error", e.message || describe(e.error), [at, stackOf(e.error)].filter(Boolean).join("\n"));
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof DOMException && e.reason.name === "AbortError") return; // a cancelled request
      add("Unhandled failure", describe(e.reason), stackOf(e.reason));
    };
    const onPolicy = (e: SecurityPolicyViolationEvent) =>
      add("Blocked by security policy", `${e.effectiveDirective || e.violatedDirective}: ${e.blockedURI || "inline"}`, e.sourceFile ? `From ${e.sourceFile}:${e.lineNumber}` : "");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("securitypolicyviolation", onPolicy);

    const originals = { error: console.error, warn: console.warn };
    console.error = (...args: unknown[]) => {
      originals.error.apply(console, args);
      add("Console error", args.map(describe).join(" "), args.map(stackOf).filter(Boolean).join("\n"));
    };
    console.warn = (...args: unknown[]) => {
      originals.warn.apply(console, args);
      add("Console warning", args.map(describe).join(" "), args.map(stackOf).filter(Boolean).join("\n"));
    };

    // Failed calls to the app's own API routes (/api/...), from any tool.
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let path = "";
      try {
        const u = new URL(url, location.href);
        // The database sync retries on its own and logs its problems once (app/(tools)/notes/lib/sync.ts).
        if (u.origin === location.origin && u.pathname.startsWith("/api/") && u.pathname !== "/api/sync") path = u.pathname;
      } catch {
        // not a URL we track
      }
      try {
        const res = await originalFetch(input, init);
        if (path && !res.ok && !QUIET_STATUS.has(res.status)) {
          res
            .clone()
            .json()
            .catch(() => null)
            .then((body: { error?: string } | null) => add("Request failed", `${path} (${res.status})${body?.error ? `: ${body.error}` : ""}`, url));
        }
        return res;
      } catch (err) {
        if (path && !(err instanceof DOMException && err.name === "AbortError")) add("Request failed", `${path}: ${describe(err)}`, url);
        throw err;
      }
    };

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("securitypolicyviolation", onPolicy);
      console.error = originals.error;
      console.warn = originals.warn;
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
