"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import Modal from "./modal";
import RichEditor from "./rich-editor";
import { db, newId, type Template } from "./lib/db";
import { useAutosave } from "./lib/use-autosave";

export default function TemplatesDialog({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (templateId: string) => void;
}) {
  const templates = useLiveQuery(() => db.templates.orderBy("name").toArray(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    templates?.find((t) => t.id === selectedId) ?? (selectedId === null ? templates?.[0] : undefined);

  async function create() {
    const input = window.prompt("Name the new template", "");
    if (input === null) return;
    const now = Date.now();
    const id = newId();
    const name = input.trim() || "Untitled template";
    await db.templates.add({ id, name, content: "", createdAt: now, updatedAt: now });
    setSelectedId(id);
  }

  async function remove(t: Template) {
    if (!window.confirm(`Delete the template “${t.name}”? Notes made from it are not affected.`)) return;
    await db.templates.delete(t.id);
    setSelectedId(null);
  }

  return (
    <Modal onClose={onClose} label="Templates" className="max-w-4xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-medium">Templates</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <aside className="flex shrink-0 flex-col gap-1 border-b border-zinc-200 p-2 sm:w-56 sm:border-b-0 sm:border-r dark:border-zinc-800">
          <button
            type="button"
            onClick={create}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New template
          </button>
          <ul className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-y-auto">
            {templates?.map((t) => (
              <li key={t.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full truncate rounded-md px-3 py-1.5 text-left text-sm ${
                    selected?.id === t.id
                      ? "bg-zinc-100 font-medium dark:bg-zinc-800"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  }`}
                >
                  {t.name || "Untitled template"}
                </button>
              </li>
            ))}
          </ul>
          {templates?.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              No templates yet. Create one for notes you write often.
            </p>
          )}
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <TemplateEditor
              key={selected.id}
              template={selected}
              onUse={() => onUse(selected.id)}
              onDelete={() => remove(selected)}
            />
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500">Select or create a template.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function TemplateEditor({
  template,
  onUse,
  onDelete,
}: {
  template: Template;
  onUse: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const { queue, flush } = useAutosave<Template>((patch) =>
    db.templates.update(template.id, { ...patch, updatedAt: Date.now() }),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Template name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              queue({ name: e.target.value.trim() || "Untitled template" });
            }}
            placeholder="e.g. Meeting notes, Daily log"
            className="w-full rounded-lg border border-zinc-300 bg-background px-3 py-1.5 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            await flush();
            onUse();
          }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New note from this
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/30"
        >
          Delete
        </button>
      </div>
      <RichEditor
        content={template.content}
        onChange={({ html }) => queue({ content: html })}
        placeholder="Write the template content…"
        minHeight="min-h-64"
      />
      <p className="text-xs text-zinc-500">Changes save automatically.</p>
    </div>
  );
}
