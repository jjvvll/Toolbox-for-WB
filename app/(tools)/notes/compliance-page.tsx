"use client";

import { memo, useRef, useState } from "react";
import { CopyButton, Section, href, isUrl, smallIcon } from "./note-form";
import RichEditor from "./rich-editor";
import {
  COMPLIANCE_PARTS,
  EMPTY_COMPLIANCE_PART,
  complianceEntries,
  complianceOf,
  updateNote,
  type Compliance,
  type ComplianceEntry,
  type ComplianceKey,
  type Note,
} from "./lib/db";
import { noteEdited } from "./lib/sync";
import { useAutosave } from "./lib/use-autosave";

/**
 * Page 2 of the note window: compliance guidelines in three parts (state, MLS, brokerage).
 * Each part lists its states / MLSs / brokerages (usually one), each with a name and its own
 * link, then a big editor to paste the guidelines into. Highlight the parts that matter and
 * they show up in the checklist beside the window, grouped by part.
 */
const CompliancePage = memo(function CompliancePage({ note }: { note: Note }) {
  // The editors read their text once, when they mount.
  const [initial] = useState(() => complianceOf(note));
  // Names and links, shown in inputs (the guidelines live in the editors).
  const [parts, setParts] = useState(initial);
  // Latest values, including edits not saved yet: each save sends all three parts.
  const latest = useRef<Compliance>(initial);
  const { queue } = useAutosave<Note>((patch) => updateNote(note.id, patch));

  const save = (next: Compliance) => {
    latest.current = next;
    noteEdited(note.id);
    queue({ compliance: next });
  };
  // Saving entries drops the older one-link / titles fields: entries replace them.
  const setEntries = (key: ComplianceKey, entries: ComplianceEntry[]) => {
    const next = { ...latest.current, [key]: { notes: latest.current[key]?.notes ?? "", entries } };
    save(next);
    setParts(next);
  };
  const setNotes = (key: ComplianceKey, notes: string) =>
    save({ ...latest.current, [key]: { ...EMPTY_COMPLIANCE_PART, ...latest.current[key], notes } });

  return (
    <div className="flex flex-col gap-4">
      {COMPLIANCE_PARTS.map((p) => (
        <Section key={p.key} title={p.label}>
          <EntryRows item={p.item} entries={complianceEntries(parts[p.key])} onChange={(entries) => setEntries(p.key, entries)} />
          <RichEditor
            key={`${note.id}-compliance-${p.key}`}
            fieldId={`${note.id}-compliance-${p.key}`}
            fieldLabel={p.label}
            content={initial[p.key]?.notes ?? ""}
            minHeight="min-h-28"
            placeholder={`Paste the ${p.label.toLowerCase()} guidelines here, then highlight what you need to implement…`}
            onChange={({ html }) => setNotes(p.key, html)}
          />
        </Section>
      ))}
    </div>
  );
});
export default CompliancePage;

const BLANK: ComplianceEntry = { title: "", link: "" };

/**
 * A part's states / MLSs / brokerages: one row to start with (the usual case), and
 * "+ Add …" for more. Extra rows can be removed; the first one always stays.
 */
function EntryRows({ item, entries, onChange }: { item: string; entries: ComplianceEntry[]; onChange: (entries: ComplianceEntry[]) => void }) {
  const rows = entries.length ? entries : [BLANK];
  // The row just added gets the cursor.
  const [added, setAdded] = useState<number | null>(null);
  const setRow = (i: number, patch: Partial<ComplianceEntry>) => onChange(rows.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((entry, i) => (
        <EntryRow
          key={i}
          item={item}
          entry={entry}
          number={rows.length > 1 ? i + 1 : null}
          focus={i === added}
          onChange={(patch) => setRow(i, patch)}
          onRemove={
            rows.length > 1
              ? () => {
                  setAdded(null);
                  onChange(rows.filter((_, j) => j !== i));
                }
              : undefined
          }
        />
      ))}
      <button
        type="button"
        onClick={() => {
          setAdded(rows.length);
          onChange([...rows, BLANK]);
        }}
        className="note-add self-start"
      >
        + Add {item}
      </button>
    </div>
  );
}

/** One state / MLS / brokerage: its name, its link, and buttons to open or copy the link. */
function EntryRow({
  item,
  entry,
  number,
  focus,
  onChange,
  onRemove,
}: {
  item: string;
  entry: ComplianceEntry;
  /** Shown in the labels when there's more than one. */
  number: number | null;
  focus: boolean;
  onChange: (patch: Partial<ComplianceEntry>) => void;
  onRemove?: () => void;
}) {
  const name = number ? `${item} ${number}` : item;
  const link = entry.link;
  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <input
        className="note-input basis-full font-bold sm:basis-48 sm:flex-none"
        value={entry.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder={`${item[0].toUpperCase()}${item.slice(1)} name`}
        aria-label={`${name} name`}
        autoFocus={focus}
      />
      <input
        className="note-input"
        value={link}
        onChange={(e) => onChange({ link: e.target.value })}
        placeholder="Link to its guidelines"
        spellCheck={false}
        aria-label={`${name} link`}
      />
      {isUrl(link) && (
        <a href={href(link)} target="_blank" rel="noopener noreferrer" title={`Open the ${name} link`} aria-label={`Open the ${name} link`} className={smallIcon}>
          ↗
        </a>
      )}
      {link.trim() && <CopyButton text={link} title={`Copy the ${name} link`} />}
      {onRemove && (
        <button type="button" onClick={onRemove} className={smallIcon} title={`Remove ${name}`} aria-label={`Remove ${name}`}>
          ✕
        </button>
      )}
    </div>
  );
}
