"use client";

import { useEffect, useState } from "react";
import { syncKey } from "./lib/db";
import { syncNow, useSyncState, type SyncState } from "./lib/sync";

// Whether notes are saved to the database (Supabase), shown in the note window, on the
// Notes page and on each card. Everything is always saved in this browser first.

function useSecondsUntil(at: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at, now]);
  return Math.max(0, Math.ceil((at - now) / 1000));
}

type Look = { tone: "ok" | "busy" | "warn" | "bad"; text: string; detail?: string };

const TONE = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
  busy: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-950/40 dark:text-amber-300",
  bad: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300",
};

/** How the sync looks for one note (or for everything when `waiting` counts all changes). */
function lookFor(s: SyncState, waiting: boolean, retryIn: number): Look {
  if (s.status === "not-set-up") return { tone: "bad", text: "Not saved to database", detail: s.message };
  if (!waiting) return s.status === "starting" ? { tone: "busy", text: "Checking database…" } : { tone: "ok", text: "Saved to database" };
  if (s.status === "saving" || s.status === "starting" || s.status === "synced") return { tone: "busy", text: "Saving to database…" };
  if (s.status === "offline") return { tone: "warn", text: "Saved in this browser only", detail: "No internet connection: it saves to the database when you're back online." };
  if (s.status === "signed-out") return { tone: "warn", text: "Saved in this browser only", detail: s.message };
  return { tone: "warn", text: `Not saved to database yet${retryIn ? ` · retrying in ${retryIn}s` : " · retrying"}`, detail: s.message };
}

/** For the note window: is this note in the database? */
export function NoteSyncBadge({ noteId }: { noteId: string }) {
  const s = useSyncState();
  const retryIn = useSecondsUntil(s.retryAt);
  const look = lookFor(s, s.pending.has(syncKey("notes", noteId)), retryIn);
  return (
    <span className="flex items-center gap-1.5">
      {/* Plain text while all is well; a colored badge only when something needs attention. */}
      <span
        title={look.detail ?? look.text}
        className={`flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium ${
          look.tone === "warn" || look.tone === "bad" ? `rounded-full px-2 py-0.5 ring-1 ${TONE[look.tone]}` : "text-white/70"
        }`}
      >
        <Dot tone={look.tone} />
        {look.text}
      </span>
      {(look.tone === "warn" || look.tone === "bad") && (
        <button type="button" onClick={syncNow} className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">
          Retry
        </button>
      )}
    </span>
  );
}

/** For the Notes page: everything waiting, with the reason and a retry button. */
export function SyncBanner() {
  const s = useSyncState();
  const retryIn = useSecondsUntil(s.retryAt);
  const notes = [...s.pending].filter((k) => k.startsWith("notes:")).length;
  const others = s.pending.size - notes;
  const look = lookFor(s, s.pending.size > 0 || s.pendingLog > 0, retryIn);
  const parts = [notes && `${notes} note${notes === 1 ? "" : "s"}`, others && `${others} folder/template change${others === 1 ? "" : "s"}`, s.pendingLog && `${s.pendingLog} error log entr${s.pendingLog === 1 ? "y" : "ies"}`].filter(Boolean);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm ring-1 ${TONE[look.tone]}`}>
      <span className="flex items-center gap-2 font-medium">
        <Dot tone={look.tone} />
        {look.tone === "ok" ? "Everything is saved to the database" : look.text}
      </span>
      {parts.length > 0 && <span className="text-xs opacity-80">Waiting: {parts.join(", ")}</span>}
      {look.detail && <span className="text-xs opacity-80">{look.detail}</span>}
      {look.tone === "ok" && <span className="text-xs opacity-70">Safe to close this page.</span>}
      {(look.tone === "warn" || look.tone === "bad") && (
        <button type="button" onClick={syncNow} className="ml-auto rounded-md border border-current/30 px-2 py-0.5 text-xs font-medium hover:bg-white/50 dark:hover:bg-black/20">
          Retry now
        </button>
      )}
    </div>
  );
}

/** For a card in the grid: a small mark while the note isn't in the database. */
export function CardSyncMark({ noteId }: { noteId: string }) {
  const s = useSyncState();
  if (!s.pending.has(syncKey("notes", noteId)) && s.status !== "not-set-up") return null;
  return (
    <span title="Not saved to the database yet (saved in this browser)" className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <Dot tone="warn" /> not in database yet
    </span>
  );
}

function Dot({ tone }: { tone: Look["tone"] }) {
  const color = { ok: "bg-emerald-500", busy: "bg-blue-500 animate-pulse", warn: "bg-amber-500", bad: "bg-red-500" }[tone];
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}
