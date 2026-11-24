"use client";

import { memo, useEffect, useRef, useState, type RefObject } from "react";
import CopyMenu from "./copy-menu";
import RfqaButton from "./rfqa-button";
import RichEditor from "./rich-editor";
import TagInput from "./tag-input";
import { htmlToPlainText, noteFullHtml, noteSearchText } from "./lib/convert";
import {
  DESIGN_FIELDS,
  EMPTY_DESIGN,
  EMPTY_OPPORTUNITY,
  LINK_FIELDS,
  NOTE_SECTIONS,
  askNewFolder,
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

export const isUrl = (s: string) => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());
export const href = (s: string) => (/^www\./i.test(s.trim()) ? `https://${s.trim()}` : s.trim());
const shortUrl = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

export const smallIcon = "flex h-7 w-7 shrink-0 items-center justify-center text-sm text-zinc-500 hover:bg-zinc-200 hover:text-[var(--ink)]";

/** Copies text; shows a tick for a moment. */
export function CopyButton({ text, title }: { text: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() =>
        navigator.clipboard.writeText(text.trim()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        })
      }
      className={smallIcon}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}

/** An empty optional field, waiting to be filled in: a quiet "+ Link" chip. */
function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="note-add">
      + {label}
    </button>
  );
}

/** The row of "+ …" chips under a part; takes no space when there are none. */
const Chips = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5 empty:hidden">{children}</div>;

/**
 * A link (or a short text): shown as text you can open, with copy and edit buttons; an input
 * while it's being edited. Nothing while it's empty: the form shows a chip to add it instead.
 */
function LinkField({
  label,
  title,
  value,
  editing,
  onEditing,
  onChange,
  placeholder = "Paste a link",
}: {
  label: string;
  title: string;
  value: string;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const url = isUrl(value);
  if (!editing && !value.trim()) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-bold text-zinc-500" title={title}>
        {label}
      </span>
      {editing ? (
        <input
          autoFocus
          className="note-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
          }}
          placeholder={placeholder}
          spellCheck={false}
          aria-label={title}
        />
      ) : (
        <>
          {url ? (
            <a href={href(value)} target="_blank" rel="noopener noreferrer" title={`Open ${value.trim()}`} className="min-w-0 truncate text-sm text-blue-600 hover:underline">
              {shortUrl(value)} ↗
            </a>
          ) : (
            <button type="button" onClick={() => onEditing(true)} title="Edit" className="min-w-0 break-words text-left text-sm">
              {value}
            </button>
          )}
          <span className="ml-auto flex shrink-0">
            <CopyButton text={value} title={`Copy ${title}`} />
            <button type="button" onClick={() => onEditing(true)} title={`Edit ${title}`} aria-label={`Edit ${title}`} className={smallIcon}>
              ✎
            </button>
          </span>
        </>
      )}
    </div>
  );
}

/** A notes field (rich text with the highlighter), with a small label above it unless it's the section's main one. */
function NotesField({
  label,
  id,
  fieldLabel,
  content,
  placeholder,
  onChange,
  minHeight = "min-h-10",
  autoFocus = false,
}: {
  label?: string;
  id: string;
  /** How the highlights checklist names this field, e.g. "Design · Typography". */
  fieldLabel: string;
  content: string;
  placeholder?: string;
  onChange: (html: string) => void;
  minHeight?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-bold text-zinc-500">{label}</span>}
      <RichEditor key={id} fieldId={id} fieldLabel={fieldLabel} content={content} minHeight={minHeight} placeholder={placeholder} autoFocus={autoFocus} onChange={({ html }) => onChange(html)} />
    </div>
  );
}

/** A section that folds away when its heading is clicked. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="note-section">
      <summary>{title}</summary>
      <div className="flex flex-col gap-3 pb-1 pt-2">{children}</div>
    </details>
  );
}

const NEW_FOLDER = "__new";

/** The folder picker, kept current from the note index (saving doesn't redraw the form for it). */
function FolderSelect({ noteId, initial, folders }: { noteId: string; initial: string | null; folders: Folder[] }) {
  const summary = useNoteSummary(noteId);
  const folderId = summary ? summary.folderId : initial;
  return (
    <select
      value={folderId && folders.some((f) => f.id === folderId) ? folderId : ""}
      onChange={async (e) => {
        const picked = e.target.value === NEW_FOLDER ? await askNewFolder() : e.target.value || null;
        if (e.target.value === NEW_FOLDER && !picked) return;
        await updateNote(noteId, { folderId: picked });
      }}
      aria-label="Folder"
      className="note-select"
    >
      <option value="">No folder</option>
      {folders.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      <option value={NEW_FOLDER}>+ New folder…</option>
    </select>
  );
}

function EditedAt({ noteId, initial }: { noteId: string; initial: number }) {
  const summary = useNoteSummary(noteId);
  return <span className="whitespace-nowrap text-xs text-zinc-400">Edited {relativeTime(summary?.updatedAt ?? initial)}</span>;
}

function NoteTags({ noteId, initial }: { noteId: string; initial: string[] }) {
  const summary = useNoteSummary(noteId);
  const allTags = useAllTags();
  return <TagInput tags={summary?.tags ?? initial} suggestions={allTags} onChange={(tags) => updateNote(noteId, { tags })} />;
}

const hasText = (html: string | undefined) => !!html && !!htmlToPlainText(html);

/** The parts that start out showing: the ones with something in them. Keys as used in NoteForm. */
function filledParts(note: Note): Set<string> {
  const sections = sectionsOf(note);
  const o = { ...EMPTY_OPPORTUNITY, ...note.opportunity };
  const d = { ...EMPTY_DESIGN, ...note.design };
  const out = new Set<string>();
  if (hasText(o.notes) || o.reference.trim() || hasText(o.reason)) out.add("opportunity");
  if (hasText(o.reason)) out.add("reason");
  for (const s of NOTE_SECTIONS) if (hasText(sections[s.key]) || note.sectionLinks?.[s.key]?.trim()) out.add(s.key);
  for (const f of DESIGN_FIELDS) if (hasText(d[f.key])) out.add("design").add(f.key);
  if (d.moodboard.trim()) out.add("design");
  return out;
}

/** Saves a change from outside the form (the title, which is in the window's title bar). */
export type SaveNote = (patch: Partial<Note>) => void;

/**
 * The whole note, in order: links, Main ticket, Opportunity, then each section. Saves as you type.
 * Only what has something in it is shown; the rest waits as "+ …" chips, so a note reads top to
 * bottom without empty fields in between.
 * Memoized: `note` is the note as it was when it opened, so the form only redraws for its own
 * typing; the folder, tags and date update themselves.
 */
const NoteForm = memo(function NoteForm({ note, folders, onDelete, saveRef }: { note: Note; folders: Folder[]; onDelete: () => void; saveRef: RefObject<SaveNote | null> }) {
  const [links, setLinks] = useState<Partial<Record<LinkKey, string>>>(note.links ?? {});
  const [opportunity, setOpportunity] = useState<Opportunity>({ ...EMPTY_OPPORTUNITY, ...note.opportunity });
  const [sections] = useState(() => sectionsOf(note));
  const [sectionLinks, setSectionLinks] = useState<Partial<Record<SectionKey, string>>>(note.sectionLinks ?? {});
  const [design, setDesign] = useState<DesignDetails>({ ...EMPTY_DESIGN, ...note.design });
  // Which sections and optional fields are showing (added ones stay until the note is opened again).
  const [shown, setShown] = useState(() => filledParts(note));
  // The field just added gets the cursor.
  const [added, setAdded] = useState<string | null>(null);
  // Link inputs being edited.
  const [editing, setEditing] = useState<Set<string>>(() => new Set());
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
  useEffect(() => {
    saveRef.current = save;
  });
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

  const add = (part: string) => {
    setShown((s) => new Set(s).add(part));
    setAdded(part);
  };
  const setEdit = (id: string, on: boolean) =>
    setEditing((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  /** Whether a link field shows as a "+" chip: empty, and not being filled in. */
  const isChip = (id: string, value: string) => !value.trim() && !editing.has(id);
  const hiddenSections = [{ key: "opportunity", label: "Opportunity" }, ...NOTE_SECTIONS].filter((s) => !shown.has(s.key));

  return (
    <div className="flex flex-col gap-4">
      {/* Where it's filed, and what can be done with it */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FolderSelect noteId={note.id} initial={note.folderId} folders={folders} />
        <div className="min-w-40 flex-1">
          <NoteTags noteId={note.id} initial={note.tags} />
        </div>
        <EditedAt noteId={note.id} initial={note.updatedAt} />
        <span className="flex items-center gap-1.5">
          <RfqaButton compact getNote={() => latest.current} />
          <CopyMenu compact getNote={() => ({ title: latest.current.title, content: noteFullHtml(latest.current) })} />
          <button type="button" onClick={onDelete} className="px-2 py-1 text-xs font-bold text-red-600 hover:underline">
            Delete
          </button>
        </span>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-1.5">
        {LINK_FIELDS.map((f) => (
          <LinkField
            key={f.key}
            label={f.label}
            title={f.title}
            value={links[f.key] ?? ""}
            editing={editing.has(f.key)}
            onEditing={(on) => setEdit(f.key, on)}
            onChange={(v) => setLink(f.key, v)}
          />
        ))}
        <Chips>
          {LINK_FIELDS.filter((f) => isChip(f.key, links[f.key] ?? "")).map((f) => (
            <AddChip key={f.key} label={f.label} onClick={() => setEdit(f.key, true)} />
          ))}
        </Chips>
      </div>

      <Section title="Main ticket">
        <NotesField fieldLabel="Main ticket" id={`${note.id}-main`} content={note.content} minHeight="min-h-28" placeholder="What the ticket asks for…" onChange={(html) => save({ content: html })} />
      </Section>

      {shown.has("opportunity") && (
        <Section title="Opportunity">
          <NotesField
            fieldLabel="Opportunity · Notes"
            id={`${note.id}-opp-notes`}
            content={opportunity.notes}
            placeholder="What the client said…"
            autoFocus={added === "opportunity"}
            onChange={(html) => setOpp({ notes: html })}
          />
          <LinkField
            label="Reference"
            title="Reference"
            value={opportunity.reference}
            editing={editing.has("reference")}
            onEditing={(on) => setEdit("reference", on)}
            onChange={(v) => setOpp({ reference: v })}
            placeholder="The reference the client picked (a link or a short description)"
          />
          {shown.has("reason") && (
            <NotesField
              label="Reason"
              fieldLabel="Opportunity · Reason"
              id={`${note.id}-opp-reason`}
              content={opportunity.reason}
              placeholder="Why the client picked the reference…"
              autoFocus={added === "reason"}
              onChange={(html) => setOpp({ reason: html })}
            />
          )}
          <Chips>
            {isChip("reference", opportunity.reference) && <AddChip label="Reference" onClick={() => setEdit("reference", true)} />}
            {!shown.has("reason") && <AddChip label="Reason" onClick={() => add("reason")} />}
          </Chips>
        </Section>
      )}

      {NOTE_SECTIONS.filter((s) => shown.has(s.key)).map((s) => {
        const linkId = `link-${s.key}`;
        const sectionLink = sectionLinks[s.key] ?? "";
        const isDesign = s.key === "design";
        return (
          <Section key={s.key} title={s.label}>
            <LinkField label="Link" title={`${s.label} link`} value={sectionLink} editing={editing.has(linkId)} onEditing={(on) => setEdit(linkId, on)} onChange={(v) => setSectionLink(s.key, v)} />
            {isDesign && (
              <LinkField
                label="Moodboard"
                title="Moodboard"
                value={design.moodboard}
                editing={editing.has("moodboard")}
                onEditing={(on) => setEdit("moodboard", on)}
                onChange={(v) => setDesignField({ moodboard: v })}
                placeholder="Link to the moodboard"
              />
            )}
            <NotesField
              fieldLabel={s.label}
              id={`${note.id}-${s.key}`}
              content={sections[s.key] ?? ""}
              placeholder={`${s.label} notes…`}
              autoFocus={added === s.key}
              onChange={(html) => setSection(s.key, html)}
            />
            {isDesign &&
              DESIGN_FIELDS.filter((d) => shown.has(d.key)).map((d) => (
                <NotesField
                  key={d.key}
                  label={d.label}
                  fieldLabel={`Design · ${d.label}`}
                  id={`${note.id}-design-${d.key}`}
                  content={design[d.key]}
                  autoFocus={added === d.key}
                  placeholder={`${d.label}…`}
                  onChange={(html) => setDesignField({ [d.key]: html })}
                />
              ))}
            <Chips>
              {isChip(linkId, sectionLink) && <AddChip label="Link" onClick={() => setEdit(linkId, true)} />}
              {isDesign && isChip("moodboard", design.moodboard) && <AddChip label="Moodboard" onClick={() => setEdit("moodboard", true)} />}
              {isDesign && DESIGN_FIELDS.filter((d) => !shown.has(d.key)).map((d) => <AddChip key={d.key} label={d.label} onClick={() => add(d.key)} />)}
            </Chips>
          </Section>
        );
      })}

      {hiddenSections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--color-zinc-200)] pt-4">
          <span className="mr-1 text-xs font-bold text-zinc-500">Add a section</span>
          {hiddenSections.map((s) => (
            <AddChip key={s.key} label={s.label} onClick={() => add(s.key)} />
          ))}
        </div>
      )}
    </div>
  );
});
export default NoteForm;
