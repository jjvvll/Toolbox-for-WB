"use client";

import { askConfirm } from "@/components/ask-dialog";
import { useEffect, useState } from "react";
import { inputClass } from "@/components/ui";

// Notes added after "Copy selected": several saved notes, one picked at a time.
// Saved in this browser.

export type Note = { id: string; name: string; text: string };

const NOTES_KEY = "siteAudit:notes";
const ACTIVE_KEY = "siteAudit:activeNote";

export const DEFAULT_NOTE =
  "Analyze these seo titles and description, find the pattern on how they were formed,. the charater reqirement is 46-60 in title and 146-160 in description. And then after analyzing, build me seo title and description for these pages: ";

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load(): { notes: Note[]; active: string } {
  try {
    const notes = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "null");
    if (Array.isArray(notes) && notes.length) return { notes, active: localStorage.getItem(ACTIVE_KEY) ?? notes[0].id };
  } catch {
    // unreadable: start over
  }
  const first = { id: newId(), name: "SEO analysis prompt", text: DEFAULT_NOTE };
  return { notes: [first], active: first.id };
}

function save(notes: Note[], active: string) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    localStorage.setItem(ACTIVE_KEY, active);
  } catch {
    // storage blocked: notes last until the page closes
  }
}

/** The saved notes and the one Copy selected adds ("" for none). */
export function useNotes() {
  const [state, setState] = useState<{ notes: Note[]; active: string } | null>(null);
  // Read after mounting: localStorage doesn't exist while the page is rendered on the server.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setState(load()), []);
  const update = (notes: Note[], active: string) => {
    setState({ notes, active });
    save(notes, active);
  };
  return {
    notes: state?.notes ?? [],
    active: state?.active ?? "",
    activeText: state?.notes.find((n) => n.id === state.active)?.text ?? "",
    update,
  };
}

export function NotePicker({ notes }: { notes: ReturnType<typeof useNotes> }) {
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState("");
  const current = notes.notes.find((n) => n.id === editId) ?? notes.notes.find((n) => n.id === notes.active) ?? notes.notes[0];

  const change = (patch: Partial<Note>) =>
    current && notes.update(notes.notes.map((n) => (n.id === current.id ? { ...n, ...patch } : n)), notes.active);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          Add note
          <select
            value={notes.notes.some((n) => n.id === notes.active) ? notes.active : ""}
            onChange={(e) => notes.update(notes.notes, e.target.value)}
            className="rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm dark:border-zinc-700"
          >
            <option value="">No note</option>
            {notes.notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name || "Untitled note"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            setEditId(notes.active);
          }}
          title="Edit notes"
          aria-pressed={editing}
          className={`rounded-md border px-2 py-1 text-sm ${editing ? "border-blue-500 text-blue-600" : "border-zinc-300 dark:border-zinc-700"}`}
        >
          ✎
        </button>
      </div>
      {editing && (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={current?.id ?? ""}
              onChange={(e) => setEditId(e.target.value)}
              className="rounded-md border border-zinc-300 bg-background px-2 py-1 text-sm dark:border-zinc-700"
            >
              {notes.notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name || "Untitled note"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
              onClick={() => {
                const n = { id: newId(), name: `Note ${notes.notes.length + 1}`, text: "" };
                notes.update([...notes.notes, n], notes.active);
                setEditId(n.id);
              }}
            >
              + New note
            </button>
            <button
              type="button"
              disabled={!current}
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-red-600 disabled:opacity-50 dark:border-zinc-700"
              onClick={async () => {
                if (!current || !(await askConfirm({ title: `Delete the note “${current.name || "Untitled note"}”?`, confirmLabel: "Delete", danger: true }))) return;
                const rest = notes.notes.filter((n) => n.id !== current.id);
                notes.update(rest, notes.active === current.id ? "" : notes.active);
                setEditId(rest[0]?.id ?? "");
              }}
            >
              Delete
            </button>
            {current && current.id === notes.notes[0]?.id && (
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
                onClick={() => change({ text: DEFAULT_NOTE })}
              >
                Reset to the original prompt
              </button>
            )}
          </div>
          {current && (
            <>
              <input className={inputClass} value={current.name} onChange={(e) => change({ name: e.target.value })} placeholder="Note name" />
              <textarea
                className={`${inputClass} min-h-28`}
                value={current.text}
                onChange={(e) => change({ text: e.target.value })}
                placeholder="Text added after Copy selected"
              />
              <p className="text-xs text-zinc-500">Saved in this browser as you type.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
