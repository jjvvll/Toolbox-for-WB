// Copies notes (with their folders and templates) and the error log to the database
// (Supabase, through /api/sync). Everything is saved in the browser first; this sends
// what the database doesn't have yet and keeps retrying until it's stored, so nothing
// typed waits on the network. It also brings in changes made in another browser.

import { liveQuery } from "dexie";
import { useSyncExternalStore } from "react";
import type { PullResponse, PushBody } from "@/app/api/sync/route";
import { LOG_CLEARED_KEY, LOG_EVENT, LOG_SYNCED_KEY, logError, readLog } from "@/lib/error-log";
import { SYNCED_TABLES, db, syncKey, type SyncedTable } from "./db";

export type SyncStatus =
  /** Hasn't checked yet. */
  | "starting"
  /** The database has everything. */
  | "synced"
  /** Sending changes now. */
  | "saving"
  /** The last attempt failed; retrying at `retryAt`. */
  | "error"
  /** No internet connection; retrying when it comes back. */
  | "offline"
  /** Supabase isn't configured or the tables don't exist. */
  | "not-set-up"
  /** Not logged in to the app. */
  | "signed-out";

export type SyncState = {
  status: SyncStatus;
  /** Keys ("notes:<id>", …) of records the database doesn't have yet, deletes included. */
  pending: Set<string>;
  /** Error log entries not in the database yet. */
  pendingLog: number;
  message: string;
  retryAt: number;
  lastSyncedAt: number;
};

let state: SyncState = { status: "starting", pending: new Set(), pendingLog: 0, message: "", retryAt: 0, lastSyncedAt: 0 };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

export const useSyncState = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => state,
  );

// ---------- what the database doesn't have yet ----------

type Change = { table: SyncedTable; key: string; record: Record<string, unknown> & { id: string; updatedAt: number } };

async function localChanges() {
  const [marks, tombstones, ...tables] = await Promise.all([db.synced.toArray(), db.tombstones.toArray(), ...SYNCED_TABLES.map((t) => db[t].toArray())]);
  const rev = new Map(marks.map((m) => [m.key, m.rev]));
  const puts: Change[] = [];
  SYNCED_TABLES.forEach((table, i) => {
    for (const r of tables[i] as (Record<string, unknown> & { id: string; updatedAt?: number })[]) {
      const key = syncKey(table, r.id);
      const updatedAt = r.updatedAt ?? 0;
      if (rev.get(key) !== updatedAt) puts.push({ table, key, record: { ...r, updatedAt } });
    }
  });
  return { puts, tombstones };
}

/** An error log entry's database key: a short hash of tool, kind and message. */
function logKey(e: { tool: string; kind: string; message: string }) {
  // Two 32-bit FNV-1a hashes with different seeds, so different errors don't share a key.
  const text = `${e.tool}\u0001${e.kind}\u0001${e.message}`;
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x2f6e4b1d);
}

function readLogSynced(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LOG_SYNCED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function logChanges() {
  const synced = readLogSynced();
  const entries = readLog().map((e) => ({ ...e, key: logKey(e) }));
  let cleared: number | undefined;
  try {
    cleared = Number(localStorage.getItem(LOG_CLEARED_KEY)) || undefined;
  } catch {
    // storage blocked
  }
  return { entries: entries.filter((e) => synced[e.key] !== e.last), cleared };
}

// ---------- sending ----------

const CHUNK = 40;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;
let failures = 0;
/** The last problem written to the error log, so retries don't log the same thing again. */
let lastLogged = "";

/** Sends what the database doesn't have, soon (changes arriving together go in one request). */
export function syncSoon(delay = 1200) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void push(), delay);
}

/**
 * Marks a note as not saved yet the moment it's typed in, before the browser has even
 * stored it (that happens half a second later), so the indicator never says "saved" early.
 */
export function noteEdited(id: string) {
  const key = syncKey("notes", id);
  if (!state.pending.has(key)) set({ pending: new Set(state.pending).add(key) });
}

/** Tries again right away (the "Retry now" button). */
export function syncNow() {
  failures = 0;
  syncSoon(0);
}

async function post(body: PushBody) {
  const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw Object.assign(new Error(data?.error ?? `The database answered ${res.status}.`), { status: res.status, code: data?.code as string | undefined });
  }
}

async function push() {
  timer = null;
  if (running) {
    again = true;
    return;
  }
  running = true;
  again = false;
  try {
    const { puts, tombstones } = await localChanges();
    const { entries, cleared } = logChanges();
    if (!puts.length && !tombstones.length && !entries.length && cleared === undefined) {
      failures = 0;
      set({ status: "synced", message: "", lastSyncedAt: state.lastSyncedAt || Date.now() });
      return;
    }
    set({ status: "saving", message: "" });
    // Deletes and the cleared log first, then records in small batches.
    if (tombstones.length || cleared !== undefined) {
      await post({ deletes: tombstones.map((t) => ({ table: t.table, id: t.id, at: t.at })), clearLogBefore: cleared });
      await db.tombstones.bulkDelete(tombstones.map((t) => t.key));
      try {
        if (cleared !== undefined && Number(localStorage.getItem(LOG_CLEARED_KEY)) === cleared) localStorage.removeItem(LOG_CLEARED_KEY);
      } catch {
        // storage blocked
      }
    }
    for (let i = 0; i < puts.length; i += CHUNK) {
      const batch = puts.slice(i, i + CHUNK);
      const body: PushBody = { puts: {} };
      for (const c of batch) (body.puts![c.table] ??= []).push(c.record);
      await post(body);
      // Marked saved at the version that was sent: an edit made meanwhile stays waiting.
      await db.synced.bulkPut(batch.map((c) => ({ key: c.key, rev: c.record.updatedAt })));
    }
    if (entries.length) {
      await post({ log: entries.map(({ key, tool, kind, message, detail, count, first, last }) => ({ key, tool, kind, message, detail, count, first, last })) });
      const synced = readLogSynced();
      entries.forEach((e) => (synced[e.key] = e.last));
      try {
        localStorage.setItem(LOG_SYNCED_KEY, JSON.stringify(synced));
      } catch {
        // storage blocked: sent again next time, which is harmless
      }
      refreshLogCount();
    }
    failures = 0;
    lastLogged = "";
    set({ status: "synced", message: "", lastSyncedAt: Date.now() });
  } catch (err) {
    failures++;
    const e = err as Error & { status?: number; code?: string };
    // Wait longer after each failure: 2s, 4s, 8s … up to a minute.
    const wait = Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5));
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const status: SyncStatus = offline ? "offline" : e.code === "not-set-up" ? "not-set-up" : e.status === 401 ? "signed-out" : "error";
    set({
      status,
      message: offline ? "No internet connection." : e.status === 401 ? "Log in to save to the database." : e.message || "Couldn't reach the database.",
      retryAt: Date.now() + wait,
    });
    // Logged once per problem (not every retry); being offline or logged out isn't an error.
    if (status === "error" || status === "not-set-up") {
      const message = e.message || "Couldn't reach the database.";
      if (message !== lastLogged) {
        lastLogged = message;
        logError("Database sync", "Couldn't save to the database", message);
      }
    }
    syncSoon(wait);
  } finally {
    running = false;
    if (again) syncSoon(300);
  }
}

// ---------- receiving ----------

/** Brings in records from the database that are newer than this browser's, and deletes made elsewhere. */
async function pull() {
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (!res.ok) return;
  const remote = (await res.json()) as PullResponse;
  await db.transaction("rw", [db.notes, db.folders, db.templates, db.synced, db.tombstones], async () => {
    const marks = new Map((await db.synced.toArray()).map((m) => [m.key, m.rev]));
    const tombstones = new Set((await db.tombstones.toArray()).map((t) => t.key));
    for (const table of SYNCED_TABLES) {
      const local = new Map(((await db[table].toArray()) as { id: string; updatedAt?: number }[]).map((r) => [r.id, r]));
      for (const row of remote[table] ?? []) {
        const key = syncKey(table, row.id);
        if (tombstones.has(key)) continue; // deleted here; that delete is on its way
        const mine = local.get(row.id);
        // A change made here that the database doesn't have yet wins; it's on its way.
        const myPending = mine && marks.get(key) !== (mine.updatedAt ?? 0);
        if (myPending) continue;
        if (row.deleted) {
          if (mine) await db[table].delete(row.id); // not a tracked delete: the database already has it
          await db.synced.delete(key);
        } else if (!mine || row.updated_at > (mine.updatedAt ?? 0)) {
          await (db[table] as typeof db.notes).put(row.data as never);
          await db.synced.put({ key, rev: row.updated_at });
        } else if (row.updated_at === (mine.updatedAt ?? 0)) {
          await db.synced.put({ key, rev: row.updated_at });
        }
      }
    }
  });
}

// ---------- starting ----------

let started = false;
function refreshLogCount() {
  set({ pendingLog: logChanges().entries.length });
}

/** Starts syncing in the background (once per page load). */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Keep the list of waiting changes current, and send them shortly after each change.
  liveQuery(localChanges).subscribe({
    next: ({ puts, tombstones }) => {
      set({ pending: new Set([...puts.map((p) => p.key), ...tombstones.map((t) => t.key)]) });
      syncSoon();
    },
    error: () => {},
  });
  refreshLogCount();
  window.addEventListener(LOG_EVENT, () => {
    refreshLogCount();
    syncSoon(5000);
  });
  window.addEventListener("online", syncNow);

  // Bring in changes from other browsers now and then, and whenever the tab comes back.
  const pullQuietly = () => pull().catch(() => {});
  void pullQuietly().finally(() => syncSoon(0));
  setInterval(pullQuietly, 120_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void pullQuietly());

  // Leaving the page with notes the database doesn't have yet asks first.
  window.addEventListener("beforeunload", (e) => {
    if ([...state.pending].some((k) => k.startsWith("notes:"))) e.preventDefault();
  });
}
