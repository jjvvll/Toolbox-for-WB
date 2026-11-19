"use client";

import { useEffect, useState, type ReactNode } from "react";
import CopyButton from "@/components/copy-button";
import type { Comp } from "./lib/labeler";

export const badBadge = "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400";
export const okBadge = "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
export const warnBadge = "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
export const softBadge = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
export const selectClass = "rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm dark:border-zinc-700";
export const smallButton =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

export function Tag({ className = softBadge, title, children }: { className?: string; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-sm ${
        active ? "bg-foreground text-background" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

/** The LP element a result belongs to: "Hero Banner [The Producer] “Heading” ›". */
export function CompLabel({ comp }: { comp: Comp | null | undefined }) {
  if (!comp) return null;
  const title = [comp.template && `Template: ${comp.template}`, comp.elId && `Element ID: ${comp.elId}`, comp.id && `#${comp.id}`, comp.cls && `div.${comp.cls}`].filter(Boolean).join("\n") || comp.name;
  return (
    <span className="text-xs">
      <span title={title} className="font-medium text-violet-700 dark:text-violet-300">
        {comp.name}
      </span>
      {comp.template && <span className="ml-1 rounded bg-zinc-100 px-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{comp.template}</span>}
      {comp.heading && <span className="ml-1 italic text-zinc-500">“{comp.heading}”</span>}
      <span className="mx-1 text-zinc-400">›</span>
    </span>
  );
}

export function Code({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code title={title} className="break-all rounded bg-zinc-100 px-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </code>
  );
}

/** Text with the first part matching `re` highlighted, cut to ~50 characters around it. */
export function Snippet({ text, re }: { text: string; re: RegExp }) {
  const once = new RegExp(re.source, re.flags.replace("g", ""));
  const m = once.exec(text);
  if (!m) return <>{text.slice(0, 120)}</>;
  const a = Math.max(0, m.index - 50);
  const b = Math.min(text.length, m.index + m[0].length + 50);
  return (
    <>
      {a ? "…" : ""}
      {text.slice(a, m.index)}
      <mark className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">{m[0]}</mark>
      {text.slice(m.index + m[0].length, b)}
      {b < text.length ? "…" : ""}
    </>
  );
}

/**
 * One result card: a page (or the site-wide card), its tags, and its items. The first
 * `limit` items show, the rest behind "Show all". Clicking the page name jumps to its SEO card.
 */
export function ResultCard({
  title,
  sub,
  url,
  tags,
  items,
  limit = 6,
  tone = "normal",
  onJump,
  noun = "elements",
}: {
  title: string;
  sub: string;
  url?: string;
  tags?: ReactNode;
  items: ReactNode[];
  limit?: number;
  tone?: "normal" | "shared" | "bad";
  onJump?: (url: string) => void;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const border =
    tone === "bad" ? "border-red-300 dark:border-red-900" : tone === "shared" ? "border-violet-300 dark:border-violet-900" : "border-zinc-200 dark:border-zinc-800";
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-4 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        {url && onJump ? (
          <button type="button" onClick={() => onJump(url)} className="font-medium hover:underline" title="Show this page's SEO card">
            {title}
          </button>
        ) : (
          <span className="font-medium">{title}</span>
        )}
        <span className="text-xs text-zinc-500">{sub}</span>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400" title="Open the page">
            ↗
          </a>
        )}
        {tags}
      </div>
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {(open ? items : items.slice(0, limit)).map((item, i) => (
          <div key={i} className="py-1.5 text-sm">
            {item}
          </div>
        ))}
      </div>
      {items.length > limit && (
        <button type="button" onClick={() => setOpen(!open)} className="self-start text-xs text-blue-600 hover:underline dark:text-blue-400">
          {open ? "Show fewer" : `Show all ${items.length} ${noun} (+${items.length - limit} more)`}
        </button>
      )}
    </div>
  );
}

const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A ticking clock for loading boxes. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Loading box: message, progress bar, elapsed time and notes, and a Cancel button. */
export function Loader({
  message,
  done,
  total,
  started,
  notes = [],
  slow = false,
  cancelLabel = "Cancel",
  onCancel,
}: {
  message: string;
  done?: number;
  total?: number;
  started: number;
  notes?: string[];
  slow?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
}) {
  const now = useNow(true);
  const pct = total ? Math.round(((done ?? 0) / total) * 100) : null;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${slow ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
        <span className="text-sm">{message}</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`ml-auto ${smallButton}`}>
            {cancelLabel}
          </button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {pct === null ? (
          <div className="h-full w-1/3 animate-pulse bg-blue-600/60" />
        ) : (
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        )}
      </div>
      <p className="text-xs text-zinc-500">{[`Elapsed ${fmtSecs((now - started) / 1000)}`, ...notes].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

/** "Copy report" for a search's results. */
export function ReportButton({ text }: { text: string }) {
  return <CopyButton text={text} label="Copy report" className={text ? "" : "pointer-events-none opacity-50"} />;
}

export function Summary({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-700 dark:text-zinc-300">{children}</p>;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const pagePath = (url: string) => new URL(url).pathname || "/";
