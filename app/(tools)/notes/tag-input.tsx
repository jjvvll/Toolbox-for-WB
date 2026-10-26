"use client";

import { useId, useState } from "react";
import { normalizeTag } from "./lib/db";

export default function TagInput({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const next = raw.split(",").map(normalizeTag).filter((t) => t && !tags.includes(t));
    if (next.length) onChange([...tags, ...new Set(next)]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2.5 pr-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full px-1 text-zinc-500 hover:bg-zinc-200 hover:text-foreground dark:hover:bg-zinc-700"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        list={listId}
        onChange={(e) => {
          // A comma (or Enter / leaving the field) commits the tag.
          if (e.target.value.endsWith(",")) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? "Add tag" : "Add tags…"}
        aria-label="Add tag"
        className="min-w-20 flex-1 bg-transparent py-0.5 text-xs outline-none placeholder:text-zinc-400"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
