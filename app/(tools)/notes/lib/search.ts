import type { Note } from "./db";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Every word of the query must appear in the title, body, or tags. */
export function noteMatcher(query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return (note: Note) => {
    const haystack = normalize(`${note.title}\n${note.text}\n${note.tags.map((t) => `#${t}`).join(" ")}`);
    return words.every((w) => haystack.includes(w.replace(/^#/, "")));
  };
}

/** A short excerpt of the body, centred on the first query word when there is one. */
export function snippet(note: Note, query = "", length = 120): string {
  const text = note.text.replace(/\s+/g, " ").trim();
  const first = normalize(query).split(/\s+/).find(Boolean);
  const at = first ? normalize(text).indexOf(first) : -1;
  const start = at > 40 ? at - 40 : 0;
  const out = text.slice(start, start + length);
  return `${start > 0 ? "…" : ""}${out}${start + length < text.length ? "…" : ""}`;
}

export const displayTitle = (note: Pick<Note, "title">) => note.title.trim() || "Untitled";

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
