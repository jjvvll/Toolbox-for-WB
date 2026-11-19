"use client";

import { useRef, useState } from "react";
import { LinkRow, Section } from "./note-form";
import RichEditor from "./rich-editor";
import { COMPLIANCE_PARTS, EMPTY_COMPLIANCE_PART, complianceOf, updateNote, type Compliance, type ComplianceKey, type Note } from "./lib/db";
import { noteEdited } from "./lib/sync";
import { useAutosave } from "./lib/use-autosave";

/**
 * Page 2 of the note window: compliance guidelines in three parts (state, MLS, brokerage),
 * each with a link and a big editor to paste the guidelines into. Highlight the parts that
 * matter and they show up in the checklist beside the window, grouped by part.
 */
export default function CompliancePage({ note }: { note: Note }) {
  // The editors read their text once, when they mount.
  const [initial] = useState(() => complianceOf(note));
  const [links, setLinks] = useState(initial);
  // Latest values, including edits not saved yet: each save sends all three parts.
  const latest = useRef<Compliance>(initial);
  const { queue } = useAutosave<Note>((patch) => updateNote(note.id, patch));

  const setPart = (key: ComplianceKey, patch: Partial<typeof EMPTY_COMPLIANCE_PART>) => {
    const next = { ...latest.current, [key]: { ...EMPTY_COMPLIANCE_PART, ...latest.current[key], ...patch } };
    latest.current = next;
    noteEdited(note.id);
    queue({ compliance: next });
    if ("link" in patch) setLinks(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {COMPLIANCE_PARTS.map((p, i) => (
        <div key={p.key} className={i === 0 ? "[&>section]:border-t-0 [&>section]:pt-0" : undefined}>
          <Section title={p.label}>
            <LinkRow label="Link:" title={`${p.label} link`} value={links[p.key]?.link ?? ""} onChange={(v) => setPart(p.key, { link: v })} placeholder="Link to the guidelines" />
            <RichEditor
              key={`${note.id}-compliance-${p.key}`}
              fieldId={`${note.id}-compliance-${p.key}`}
              fieldLabel={p.label}
              content={initial[p.key]?.notes ?? ""}
              minHeight="min-h-[30vh]"
              placeholder={`Paste the ${p.label.toLowerCase()} guidelines here, then highlight what you need to implement…`}
              onChange={({ html }) => setPart(p.key, { notes: html })}
            />
          </Section>
        </div>
      ))}
      <p className="text-[11px] text-zinc-400">
        Changes save automatically. Highlight the parts you need to implement; they show up in the checklist, where you can tick them off.
      </p>
    </div>
  );
}
