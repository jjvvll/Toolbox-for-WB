"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PageResponse } from "@/app/api/content-check/route";
import CopyButton from "@/components/copy-button";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import { extractPage, MENU_ID, pageKey } from "./lib/extract";
import {
  buildPageIndex,
  checkContent,
  contentLines,
  type Hit,
  type LineResult,
  type PageIndex,
  type Segment,
  type Span,
  type Status,
} from "./lib/match";

/** Upper bound on pages per scan, for sites whose menu is missing or enormous. */
const MAX_PAGES = 60;
const CONCURRENCY = 4;

type Page = {
  url: string;
  status: "loading" | "ok" | "error";
  error?: string;
  title?: string;
  index?: PageIndex;
};

type Scan = {
  site: string;
  content: string;
  pages: Page[];
  menuFound: boolean;
  /** Links left out because the site had more than MAX_PAGES. */
  skipped: number;
};

type Filter = "all" | Status;

const STATUS: Record<Status, { label: string; badge: string }> = {
  found: {
    label: "Found",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  partial: {
    label: "Partial",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  missing: {
    label: "Missing",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  },
};

// Words in your content that the site doesn't have, and words the site has that your content doesn't.
const missingMark = "rounded-sm bg-red-200/80 text-red-900 dark:bg-red-500/30 dark:text-red-100";
const extraMark = "rounded-sm bg-sky-200/80 text-sky-900 dark:bg-sky-500/30 dark:text-sky-100";

function normalizeSiteUrl(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

async function fetchPage(url: string, signal: AbortSignal) {
  const res = await fetch(`/api/content-check?url=${encodeURIComponent(url)}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  const page = body as PageResponse;
  const doc = new DOMParser().parseFromString(page.html, "text/html");
  return { url: page.url, ...extractPage(doc, page.url) };
}

function pathLabel(url: string): string {
  const { pathname, search } = new URL(url);
  const query = search.length > 24 ? `${search.slice(0, 24)}…` : search;
  return decodeURIComponent(pathname) + query;
}

function percent(score: number): string {
  // Anything short of an exact match never reads as 100%.
  return `${Math.min(99, Math.round(score * 100))}%`;
}

export default function ContentCheckTool() {
  const [link, setLink] = useState("");
  const [content, setContent] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const site = normalizeSiteUrl(link);
    if (!site) {
      setError("That doesn't look like a website link.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setError(null);
    setScan(null);
    setFilter("all");
    setScanning(true);

    const patchPage = (i: number, patch: Partial<Page>) =>
      setScan((s) => s && { ...s, pages: s.pages.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
    const loaded = (page: Awaited<ReturnType<typeof fetchPage>>): Partial<Page> => ({
      status: "ok",
      title: page.title,
      index: buildPageIndex(page.text, page.meta),
    });

    try {
      // The first page tells us which other pages the site has.
      const first = await fetchPage(site, signal);
      const others = first.links.filter((url) => pageKey(url) !== pageKey(first.url));
      const urls = others.slice(0, MAX_PAGES - 1);
      setScan({
        site: first.url,
        content,
        menuFound: first.menuFound,
        skipped: others.length - urls.length,
        pages: [
          { url: first.url, ...loaded(first) } as Page,
          ...urls.map((url): Page => ({ url, status: "loading" })),
        ],
      });

      let next = 0;
      const worker = async () => {
        while (next < urls.length) {
          const i = next++;
          try {
            patchPage(i + 1, loaded(await fetchPage(urls[i], signal)));
          } catch (err) {
            if (signal.aborted) return;
            patchPage(i + 1, {
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } catch (err) {
      if (!signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) setScanning(false);
    }
  }

  // Matching waits for the whole site, so a line is never reported missing early.
  const report = useMemo(() => {
    if (!scan || scanning) return null;
    const pages = scan.pages.filter((p) => p.index);
    const lines = checkContent(
      scan.content,
      pages.map((p) => p.index!),
    );
    const counts: Record<Status, number> = { found: 0, partial: 0, missing: 0 };
    for (const line of lines) counts[line.status]++;
    return { pages, lines, counts };
  }, [scan, scanning]);

  const done = scan ? scan.pages.filter((p) => p.status !== "loading").length : 0;
  const lineCount = useMemo(() => contentLines(content).length, [content]);
  const visible = report?.lines.filter((l) => filter === "all" || l.status === filter) ?? [];

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-4">
        <div>
          <label htmlFor="site-link" className="mb-1 block text-sm font-medium">
            Site link
          </label>
          <input
            id="site-link"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="site-content" className="mb-1 block text-sm font-medium">
            Content to look for
          </label>
          <textarea
            id="site-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="Paste the copy here. Each line (heading, paragraph, bullet) is looked up on its own."
            className={`${inputClass} resize-y`}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {lineCount
              ? `${lineCount} ${lineCount === 1 ? "line" : "lines"} to check.`
              : "One item per line."}{" "}
            Capitalization, punctuation and spacing are ignored.
          </p>
        </div>
        <div>
          <button
            type="submit"
            disabled={scanning || !link.trim() || !lineCount}
            className={primaryButtonClass}
          >
            {scanning ? "Checking…" : "Check content"}
          </button>
        </div>
      </form>

      {error && <p className={`${errorClass} max-w-3xl`}>{error}</p>}

      {scanning && (
        <div className="max-w-3xl" role="status">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {scan ? `Reading pages… ${done} of ${scan.pages.length}` : "Reading the site menu…"}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
              style={{ width: `${scan ? (done / scan.pages.length) * 100 : 3}%` }}
            />
          </div>
        </div>
      )}

      {scan && report && (
        <>
          {!report.pages.length ? (
            <p className={errorClass}>None of the site&apos;s pages could be read.</p>
          ) : (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "found", "partial", "missing"] as const).map((f) => {
                  const count = f === "all" ? report.lines.length : report.counts[f];
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                        filter === f
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
                      }`}
                    >
                      {f === "all" ? "All" : STATUS[f].label}{" "}
                      <span className="font-normal opacity-70">{count}</span>
                    </button>
                  );
                })}
                <CopyButton
                  text={reportText(scan.site, report)}
                  label="Copy report"
                  className="ml-auto"
                />
              </div>

              {report.counts.partial > 0 && (
                <p className="text-xs text-zinc-500">
                  In partial matches, <mark className={missingMark}>red</mark> is wording from your
                  content that isn&apos;t on the site and <mark className={extraMark}>blue</mark> is
                  wording the site has instead.
                </p>
              )}

              {visible.length ? (
                <ul className="flex flex-col gap-2">
                  {visible.map((line, i) => (
                    <LineRow key={i} line={line} pages={report.pages} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Nothing in this group.</p>
              )}
            </section>
          )}

          <PagesPanel scan={scan} />
        </>
      )}
    </div>
  );
}

function LineRow({ line, pages }: { line: LineResult; pages: Page[] }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-background p-3 dark:border-zinc-800">
      <span
        className={`mt-0.5 w-16 shrink-0 rounded-full py-0.5 text-center text-xs font-medium ${STATUS[line.status].badge}`}
      >
        {STATUS[line.status].label}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {line.parts ? (
          <>
            <p className="text-xs text-zinc-500">
              {line.status === "found"
                ? "Every sentence is on the site, but not together as one passage."
                : `${line.parts.filter((p) => p.status === "found").length} of ${line.parts.length} sentences found word for word.`}
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {line.parts.map((part, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    title={STATUS[part.status].label}
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      { found: "bg-emerald-500", partial: "bg-amber-500", missing: "bg-red-500" }[
                        part.status
                      ]
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <SegmentBody segment={part} pages={pages} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <SegmentBody segment={line} pages={pages} />
        )}
      </div>
    </li>
  );
}

function SegmentBody({ segment, pages }: { segment: Segment; pages: Page[] }) {
  const note = "mt-1 text-xs text-zinc-500";
  return (
    <>
      <p className="wrap-break-word">
        {segment.yours ? <Spans spans={segment.yours} mark={missingMark} /> : segment.text}
      </p>
      {segment.status === "found" && (
        <p className={note}>
          On <PageLinks hits={segment.hits} pages={pages} />
        </p>
      )}
      {segment.status === "partial" && segment.site && (
        <p className={`${note} wrap-break-word`}>
          {percent(segment.score)} match on <PageLinks hits={[segment.site]} pages={pages} />:{" "}
          <span className="text-zinc-700 dark:text-zinc-300">
            <Spans spans={segment.site.spans} mark={extraMark} />
          </span>
        </p>
      )}
      {segment.status === "missing" && <p className={note}>Not on any page that was read.</p>}
    </>
  );
}

function Spans({ spans, mark }: { spans: Span[]; mark: string }) {
  return spans.map((span, i) =>
    span.hit ? (
      span.text
    ) : (
      <mark key={i} className={mark}>
        {span.text}
      </mark>
    ),
  );
}

function PageLinks({ hits, pages }: { hits: Hit[]; pages: Page[] }) {
  if (hits.length > 3 && hits.length === pages.length) return <>all {pages.length} pages</>;
  const shown = hits.slice(0, 3);
  const rest = hits.slice(3);
  return (
    <>
      {shown.map((hit, i) => (
        <span key={hit.page}>
          {i > 0 && ", "}
          <a
            href={pages[hit.page].url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {pathLabel(pages[hit.page].url)}
          </a>
          {hit.meta && " (page title / description only)"}
        </span>
      ))}
      {rest.length > 0 && (
        <span title={rest.map((h) => pathLabel(pages[h.page].url)).join("\n")}>
          {" "}
          and {rest.length} more
        </span>
      )}
    </>
  );
}

function PagesPanel({ scan }: { scan: Scan }) {
  const failed = scan.pages.filter((p) => p.status === "error").length;
  return (
    <details className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer font-medium">
        {scan.pages.length - failed} {scan.pages.length - failed === 1 ? "page" : "pages"} read
        {failed > 0 && (
          <span className="font-normal text-amber-700 dark:text-amber-400">
            {" "}
            · {failed} couldn&apos;t be read
          </span>
        )}
      </summary>
      {!scan.menuFound && (
        <p className="mt-2 text-xs text-zinc-500">
          This page has no <code>#{MENU_ID}</code> menu, so every internal link on it was read
          instead.
        </p>
      )}
      {scan.skipped > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          {scan.skipped} more {scan.skipped === 1 ? "link was" : "links were"} left out to stay
          within {MAX_PAGES} pages.
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-1">
        {scan.pages.map((page) => (
          <li key={page.url} className="flex flex-wrap items-baseline gap-x-2">
            <a
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {pathLabel(page.url)}
            </a>
            {page.status === "error" ? (
              <span className="text-xs text-amber-700 dark:text-amber-400">{page.error}</span>
            ) : (
              <span className="text-xs text-zinc-500">{page.title}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Plain-text summary for pasting into a ticket or chat. */
function reportText(
  site: string,
  report: { pages: Page[]; lines: LineResult[]; counts: Record<Status, number> },
): string {
  const { lines, counts, pages } = report;
  const out = [
    `Content check: ${site}`,
    `${counts.found} found, ${counts.partial} partial, ${counts.missing} missing (${pages.length} pages read)`,
  ];
  const section = (status: Status, describe: (line: LineResult) => string) => {
    const group = lines.filter((l) => l.status === status);
    if (!group.length) return;
    out.push("", `${STATUS[status].label.toUpperCase()} (${group.length})`);
    for (const line of group) out.push(`- ${line.text}${describe(line)}`);
  };
  section("missing", () => "");
  section("partial", (line) => {
    const where = line.site ? ` on ${pathLabel(pages[line.site.page].url)}` : "";
    return ` [${percent(line.score)} match${where}]`;
  });
  section("found", (line) =>
    line.hits.length ? ` [${pathLabel(pages[line.hits[0].page].url)}]` : "",
  );
  return out.join("\n");
}
