// A lightweight list of every note (title, preview, tags, dates…) for the grid, search and
// the note window's header. It's read from the database once, then kept current from the
// change feed: saving a note updates just that note's entry, instead of reloading every
// note in full (several MB with long notes) after each save.

import { useMemo, useSyncExternalStore } from "react";
import { htmlToPlainText } from "./convert";
import { LINK_FIELDS, NOTE_SECTIONS, db, onRecordsChanged, sectionsOf, type LinkKey, type Note } from "./db";

export type NoteSummary = {
  id: string;
  title: string;
  /** Plain text of every field, for search and snippets. */
  text: string;
  /** The start of Main ticket, as plain text. */
  preview: string;
  /** The top links that are filled in. */
  links: Partial<Record<LinkKey, string>>;
  /** Which parts after Main ticket have something in them. */
  filled: string[];
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

const PREVIEW_LENGTH = 400;

export function summarize(note: Note): NoteSummary {
  const o = note.opportunity;
  const sections = sectionsOf(note);
  const filled = [
    ...(o && (htmlToPlainText(o.notes) || o.reference.trim() || htmlToPlainText(o.reason)) ? ["Opportunity"] : []),
    ...NOTE_SECTIONS.filter(
      (x) =>
        htmlToPlainText(sections[x.key] ?? "") ||
        note.sectionLinks?.[x.key]?.trim() ||
        (x.key === "design" && note.design && (note.design.moodboard.trim() || htmlToPlainText(note.design.typography + note.design.summary + note.design.more))),
    ).map((x) => x.label),
  ];
  const links: Partial<Record<LinkKey, string>> = {};
  for (const f of LINK_FIELDS) {
    const v = note.links?.[f.key]?.trim();
    if (v) links[f.key] = v;
  }
  return {
    id: note.id,
    title: note.title ?? "",
    text: note.text ?? "",
    preview: htmlToPlainText(note.content ?? "").slice(0, PREVIEW_LENGTH * 2).replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH),
    links,
    filled,
    folderId: note.folderId ?? null,
    tags: note.tags ?? [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

// ---------- the store ----------

const byId = new Map<string, NoteSummary>();
/** Newest first; a new array whenever anything changes, with unchanged entries kept as they were. */
let list: NoteSummary[] | undefined;
const listeners = new Set<() => void>();
let started = false;

function publish() {
  list = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  listeners.forEach((fn) => fn());
}

async function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Changes that arrive while the first read is running are applied after it.
  const early: (() => Promise<void> | void)[] = [];
  let loaded = false;
  onRecordsChanged((c) => {
    if (c.table !== "notes") return;
    const apply = async () => {
      for (const id of c.deletes) byId.delete(id);
      // Another tab's change: read just those notes.
      const missing = [...c.puts].filter(([, v]) => !v).map(([id]) => id);
      const read = missing.length ? await db.notes.bulkGet(missing) : [];
      const fromOtherTab = new Map(missing.map((id, i) => [id, read[i]]));
      for (const [id, value] of c.puts) {
        const note = (value as Note | null) ?? fromOtherTab.get(id);
        if (note) byId.set(id, summarize(note));
        else byId.delete(id);
      }
      publish();
    };
    if (loaded) void apply();
    else early.push(apply);
  });
  try {
    // The one full read, when the page opens.
    await db.notes.each((n) => void byId.set(n.id, summarize(n)));
  } catch {
    // An unreadable database shows as an empty list rather than "Loading…" forever.
  }
  loaded = true;
  for (const fn of early) await fn();
  publish();
}

const subscribe = (fn: () => void) => {
  void start();
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Every note, newest first; undefined until it's loaded. */
export const useNoteIndex = () => useSyncExternalStore(subscribe, () => list, () => undefined);

/** One note's entry: changes only when that note does. Undefined while loading, null when there's no such note. */
export function useNoteSummary(id: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => (list === undefined ? undefined : id ? (byId.get(id) ?? null) : null),
    () => undefined,
  );
}

/** Every tag in use, sorted; a new array only when the set of tags changes. */
export function useAllTags() {
  const notes = useNoteIndex();
  const key = useMemo(() => [...new Set((notes ?? []).flatMap((n) => n.tags))].sort().join("\u0000"), [notes]);
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}
