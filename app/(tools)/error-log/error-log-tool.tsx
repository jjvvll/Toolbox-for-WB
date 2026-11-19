"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LOG_EVENT, clearLog, lastSeen, logToText, markSeen, readLog, type LogEntry } from "@/lib/error-log";

// The log lives in localStorage; read it again whenever it changes (here or in another tab).
const subscribe = (fn: () => void) => {
  window.addEventListener(LOG_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(LOG_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
let cache: { raw: string | null; list: LogEntry[] } = { raw: null, list: [] };
const snapshot = () => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem("errorLog");
  } catch {
    // blocked
  }
  if (raw !== cache.raw) cache = { raw, list: readLog() };
  return cache.list;
};
const empty: LogEntry[] = [];

const stamp = (t: number) => new Date(t).toLocaleString();

export default function ErrorLogTool() {
  const log = useSyncExternalStore(subscribe, snapshot, () => empty);
  const [tool, setTool] = useState("all");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  // Errors newer than the last visit are marked new; opening the page marks everything seen.
  const [seenBefore, setSeenBefore] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenBefore(lastSeen());
    markSeen();
  }, []);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const tools = useMemo(() => [...new Set(log.map((e) => e.tool))].sort(), [log]);
  const shown = tool === "all" ? log : log.filter((e) => e.tool === tool);

  function download() {
    const blob = new Blob([logToText(shown)], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `error-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded-md border border-zinc-300 bg-background px-2 py-1.5 text-sm dark:border-zinc-700" aria-label="Tool">
          <option value="all">All tools ({log.length})</option>
          {tools.map((t) => (
            <option key={t} value={t}>
              {t} ({log.filter((e) => e.tool === t).length})
            </option>
          ))}
        </select>
        {/* The text is built on click: it includes the current time, which can't be read while the page pre-renders. */}
        <button
          type="button"
          disabled={!shown.length}
          onClick={() =>
            navigator.clipboard.writeText(logToText(shown)).then(
              () => setCopied("Copied!"),
              () => setCopied("Copy failed"),
            )
          }
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {copied ?? "Copy all"}
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!shown.length}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Download .txt
        </button>
        <button
          type="button"
          disabled={!log.length}
          onClick={() => {
            if (!armed) setArmed(true);
            else {
              clearLog();
              setArmed(false);
            }
          }}
          className={`ml-auto rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            armed ? "border-red-500 bg-red-600 text-white" : "border-zinc-300 text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/40"
          }`}
        >
          {armed ? "Click again to clear everything" : "Clear log"}
        </button>
      </div>

      {!shown.length ? (
        <p className="rounded-xl border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">✓ No errors logged.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((e, i) => {
            const isNew = e.last > seenBefore;
            const expanded = open.has(i);
            return (
              <li key={`${e.tool}${e.kind}${e.message}`} className={`rounded-xl border p-3 ${isNew ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {isNew && <span className="rounded-full bg-red-600 px-1.5 font-semibold text-white">new</span>}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium dark:bg-zinc-800">{e.tool}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{e.kind}</span>
                  {e.count > 1 && (
                    <span className="text-zinc-500" title={`First: ${stamp(e.first)}`}>
                      × {e.count} since {stamp(e.first)}
                    </span>
                  )}
                  <span className="ml-auto text-zinc-500">{stamp(e.last)}</span>
                </div>
                <p className="mt-1 break-words text-sm">{e.message}</p>
                {e.detail && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((s) => {
                          const next = new Set(s);
                          if (expanded) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                      className="mt-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {expanded ? "Hide details" : "Details"}
                    </button>
                    {expanded && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-900">{e.detail}</pre>}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-zinc-500">
        The newest 500 are kept. The browser&apos;s own console notices and errors from other websites and extensions can&apos;t be seen here.
      </p>
    </div>
  );
}
