"use client";

import { memo, useRef, useState } from "react";
import CopyMenu from "./copy-menu";
import RfqaButton from "./rfqa-button";
import RichEditor from "./rich-editor";
import TagInput from "./tag-input";
import { noteFullHtml, noteSearchText } from "./lib/convert";
import {
  DESIGN_FIELDS,
  EMPTY_DESIGN,
  EMPTY_OPPORTUNITY,
  LINK_FIELDS,
  NOTE_SECTIONS,
  sectionsOf,
  updateNote,
  type DesignDetails,
  type Folder,
  type LinkKey,
  type Note,
  type Opportunity,
  type SectionKey,
} from "./lib/db";
import { useAllTags, useNoteSummary } from "./lib/note-index";
import { relativeTime } from "./lib/search";
import { noteEdited } from "./lib/sync";
import { useAutosave } from "./lib/use-autosave";

export const fieldInput =
  "min-w-0 flex-1 rounded-lg border border-zinc-300 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700";
export const iconButton =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900";
export const fieldLabel = "w-28 shrink-0 pt-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300";

export const isUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());
export const href = (s: string) => (/^www\./i.test(s.trim()) ? `https://${s.trim()}` : s.trim());

/** A labelled field for a link, with buttons to open and copy it. */
export function LinkRow({ label, title, value, onChange, placeholder = "Paste a link" }: { label: string; title: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <label className="flex items-start gap-2">
      <span className={fieldLabel} title={title}>
        {label}
      </span>
      <input className={fieldInput} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} aria-label={title} />
      <a
        href={isUrl(value) ? href(value) : undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!isUrl(value)}
        title={isUrl(value) ? `Open ${title}` : "Add a link to open it"}
        className={`${iconButton} ${isUrl(value) ? "" : "pointer-events-none opacity-30"}`}
      >
        ↗
      </a>
      <button
        type="button"
        disabled={!value.trim()}
        title={`Copy ${title}`}
        onClick={() =>
          navigator.clipboard.writeText(value.trim()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
        }
        className={iconButton}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </label>
  );
}

/** A labelled notes editor (rich text with the highlighter). */
function NotesRow({
  label,
  id,
  fieldLabel,
  content,
  placeholder,
  onChange,
  tall = false,
}: {
  label: string;
  id: string;
  /** How the highlights checklist names this field, e.g. "Design · Typography". */
  fieldLabel: string;
  content: string;
  placeholder?: string;
  onChange: (html: string) => void;
  tall?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={fieldLabel}>{label}</span>
      <div className="min-w-0 flex-1">
        <RichEditor key={id} fieldId={id} fieldLabel={fieldLabel} compact content={content} minHeight={tall ? "min-h-32" : "min-h-16"} placeholder={placeholder} onChange={({ html }) => onChange(html)} />
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** The folder picker, kept current from the note index (saving doesn't redraw the form for it). */
function FolderSelect({ noteId, initial, folders }: { noteId: string; initial: string | null; folders: Folder[] }) {
  const summary = useNoteSummary(noteId);
  return (
    <select
      value={(summary ? summary.folderId : initial) ?? ""}
      onChange={(e) => updateNote(noteId, { folderId: e.target.value || null })}
      aria-label="Folder"
      className="min-w-0 max-w-44 rounded-md border border-zinc-300 bg-background px-2 py-1 text-xs dark:border-zinc-700"
    >
      <option value="">No folder</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

function EditedAt({ noteId, initial }: { noteId: string; initial: number }) {
  const summary = useNoteSummary(noteId);
  return <span className="mr-auto text-xs text-zinc-400">Edited {relativeTime(summary?.updatedAt ?? initial)}</span>;
}

function NoteTags({ noteId, initial }: { noteId: string; initial: string[] }) {
  const summary = useNoteSummary(noteId);
  const allTags = useAllTags();
  return <TagInput tags={summary?.tags ?? initial} suggestions={allTags} onChange={(tags) => updateNote(noteId, { tags })} />;
}

/**
 * The whole note, in order: links, Main ticket, Opportunity, then each section. Saves as you type.
 * Memoized: `note` is the note as it was when it opened, so the form only redraws for its own
 * typing; the folder, tags and date update themselves.
 */
const NoteForm = memo(function NoteForm({ note, folders, onDelete }: { note: Note; folders: Folder[]; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [links, setLinks] = useState<Partial<Record<LinkKey, string>>>(note.links ?? {});
  const [opportunity, setOpportunity] = useState<Opportunity>({ ...EMPTY_OPPORTUNITY, ...note.opportunity });
  const [sections] = useState(() => sectionsOf(note));
  const [sectionLinks, setSectionLinks] = useState<Partial<Record<SectionKey, string>>>(note.sectionLinks ?? {});
  const [design, setDesign] = useState<DesignDetails>({ ...EMPTY_DESIGN, ...note.design });
  // Latest values, including edits not saved yet, for copying and the search text.
  const latest = useRef({
    title: note.title,
    content: note.content,
    links: note.links ?? {},
    opportunity: { ...EMPTY_OPPORTUNITY, ...note.opportunity },
    sections: sectionsOf(note),
    sectionLinks: note.sectionLinks ?? {},
    design: { ...EMPTY_DESIGN, ...note.design },
  });
  // The search text (every field as plain text) is rebuilt once per save, not on every keystroke.
  const { queue } = useAutosave<Note>((patch) => updateNote(note.id, { ...patch, text: noteSearchText(latest.current) }));

  const save = (patch: Partial<Note>) => {
    noteEdited(note.id);
    Object.assign(latest.current, patch);
    queue(patch);
  };
  const setLink = (key: LinkKey, value: string) => {
    const next = { ...latest.current.links, [key]: value };
    setLinks(next);
    save({ links: next });
  };
  const setOpp = (patch: Partial<Opportunity>) => {
    const next = { ...latest.current.opportunity, ...patch };
    setOpportunity(next);
    save({ opportunity: next });
  };
  const setSection = (key: SectionKey, html: string) => save({ sections: { ...latest.current.sections, [key]: html } });
  const setSectionLink = (key: SectionKey, value: string) => {
    const next = { ...latest.current.sectionLinks, [key]: value };
    setSectionLinks(next);
    save({ sectionLinks: next });
  };
  const setDesignField = (patch: Partial<DesignDetails>) => {
    const next = { ...latest.current.design, ...patch };
    setDesign(next);
    save({ design: next });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Title and details */}
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save({ title: e.target.value });
          }}
          autoFocus={!note.title && !note.text}
          placeholder="Title (client or ticket name)"
          aria-label="Note title"
          className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FolderSelect noteId={note.id} initial={note.folderId} folders={folders} />
          <EditedAt noteId={note.id} initial={note.updatedAt} />
          <RfqaButton getNote={() => latest.current} />
          <CopyMenu getNote={() => ({ title: latest.current.title, content: noteFullHtml(latest.current) })} />
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/30"
          >
            Delete
          </button>
        </div>
        <NoteTags noteId={note.id} initial={note.tags} />
      </div>

      {/* Links */}
      <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        {LINK_FIELDS.map((f) => (
          <LinkRow key={f.key} label={f.label} title={f.title} value={links[f.key] ?? ""} onChange={(v) => setLink(f.key, v)} />
        ))}
      </section>

      <Section title="Main ticket">
        <NotesRow label="Notes:" fieldLabel="Main ticket" id={`${note.id}-main`} content={note.content} tall placeholder="What the ticket asks for…" onChange={(html) => save({ content: html })} />
      </Section>

      <Section title="Opportunity">
        <NotesRow label="Notes:" fieldLabel="Opportunity · Notes" id={`${note.id}-opp-notes`} content={opportunity.notes} placeholder="What the client said…" onChange={(html) => setOpp({ notes: html })} />
        <LinkRow label="Reference:" title="Reference" value={opportunity.reference} onChange={(v) => setOpp({ reference: v })} placeholder="The reference the client picked (a link or a short description)" />
        <NotesRow label="Reason:" fieldLabel="Opportunity · Reason" id={`${note.id}-opp-reason`} content={opportunity.reason} placeholder="Why the client picked the reference…" onChange={(html) => setOpp({ reason: html })} />
      </Section>

      {NOTE_SECTIONS.map((s) => (
        <Section key={s.key} title={s.label}>
          <LinkRow label="Link:" title={`${s.label} link`} value={sectionLinks[s.key] ?? ""} onChange={(v) => setSectionLink(s.key, v)} />
          <NotesRow label="Notes:" fieldLabel={s.label} id={`${note.id}-${s.key}`} content={sections[s.key] ?? ""} onChange={(html) => setSection(s.key, html)} />
          {s.key === "design" && (
            <>
              <LinkRow label="Moodboard:" title="Moodboard" value={design.moodboard} onChange={(v) => setDesignField({ moodboard: v })} placeholder="Link to the moodboard" />
              {DESIGN_FIELDS.map((d) => (
                <NotesRow
                  key={d.key}
                  label={`${d.label}:`}
                  fieldLabel={`Design · ${d.label}`}
                  id={`${note.id}-design-${d.key}`}
                  content={design[d.key]}
                  onChange={(html) => setDesignField({ [d.key]: html })}
                />
              ))}
            </>
          )}
        </Section>
      ))}

      <p className="text-[11px] text-zinc-400">
        Changes save automatically. Select words and pick a color to highlight them; select text and paste a URL to make it a link.
      </p>
    </div>
  );
});
export default NoteForm;
