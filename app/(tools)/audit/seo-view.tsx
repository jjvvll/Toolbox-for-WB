"use client";

import { useState } from "react";
import CopyButton from "@/components/copy-button";
import { DESC_MAX, DESC_MIN, TITLE_MAX, TITLE_MIN, seoProblems, type Row, type StartPage } from "./lib/audit";
import type { AuditStore, AuditState, GroupKey } from "./lib/store";
import { NotePicker, useNotes } from "./notes";
import { badBadge, okBadge, selectClass, smallButton, warnBadge } from "./ui";

type Format = "both" | "title" | "desc";

function formatRows(list: Row[], mode: Format): string {
  return list
    .map((r) => {
      const lines = [`${r.url}${r.flags.length ? `  [${r.flags.join("; ")}]` : ""}`];
      if (mode !== "desc") lines.push(`Title: ${r.title || "(missing)"}`);
      if (mode !== "title") lines.push(`Description: ${r.description || "(missing)"}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** The id of a page's card, so other views can scroll to it. */
export const cardId = (url: string) => `page-${encodeURIComponent(url)}`;

export function SeoView({ store, state, view }: { store: AuditStore; state: AuditState; view: "seo" | GroupKey }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<Format>("both");
  const [rerunning, setRerunning] = useState<Set<string>>(new Set());
  const notes = useNotes();
  const group = view === "seo" ? null : state.groups[view];
  const rows = group ? group.rows : state.rows;
  const selectedRows = rows.filter((r) => selected.has(r.url));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggle = (urls: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      urls.forEach((u) => (on ? next.add(u) : next.delete(u)));
      return next;
    });
  const seoText = formatRows(selectedRows, format);
  const copySelected = notes.activeText.trim() ? `${seoText}\n\n${notes.activeText}` : seoText;

  async function rerun(row: Row) {
    setRerunning((s) => new Set(s).add(row.url));
    await store.rerunOne(row);
    setRerunning((s) => {
      const next = new Set(s);
      next.delete(row.url);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={(e) => toggle(rows.map((r) => r.url), e.target.checked)} />
            Select all
          </label>
          <CopyButton text={formatRows(rows, format)} label="Copy all" className={rows.length ? "" : "pointer-events-none opacity-50"} />
          <CopyButton text={copySelected} label={`Copy selected (${selectedRows.length})`} className={selectedRows.length ? "" : "pointer-events-none opacity-50"} />
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className={selectClass} aria-label="Fields to copy">
            <option value="both">Title + description</option>
            <option value="title">Titles only</option>
            <option value="desc">Descriptions only</option>
          </select>
          <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            {group ? group.stamp : state.stamp}
            <button
              type="button"
              disabled={state.busy || (!!group && group.status !== null)}
              onClick={() => (view === "seo" ? state.start && store.audit(state.start.pageUrl, false) : store.refreshGroup(view))}
              className={smallButton}
            >
              ↻ Refresh
            </button>
          </span>
        </div>
        <NotePicker notes={notes} />
      </div>

      {view === "seo" && state.start && rows.length > 0 && <HeaderCard start={state.start} />}
      {group?.status && <p className="text-sm text-zinc-600 dark:text-zinc-400">{group.status}</p>}
      {rows.map((row) => (
        <PageCard
          key={row.url}
          row={row}
          selected={selected.has(row.url)}
          onSelect={(on) => toggle([row.url], on)}
          onRerun={() => rerun(row)}
          rerunning={rerunning.has(row.url)}
        />
      ))}
    </div>
  );
}

function HeaderCard({ start }: { start: StartPage }) {
  const issues = start.headerIssues;
  return (
    <div className={`rounded-2xl border p-4 ${issues.length ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-center gap-2">
        <span className="font-medium">Header &amp; footer links</span>
        <span className="text-xs text-zinc-500">Pasted page</span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        {(["Header", "Footer"] as const).map((area) => {
          const n = start.areaCounts[area];
          const mine = issues.filter((i) => i.area === area);
          if (!n) return <p key={area} className="text-zinc-500">No {area.toLowerCase()} found on this page.</p>;
          if (!mine.length)
            return (
              <p key={area} className="text-emerald-700 dark:text-emerald-400">
                ✓ {area}: no empty links ({n} links checked)
              </p>
            );
          return mine.map((i, k) => (
            <div key={`${area}${k}`}>
              <p className="text-red-700 dark:text-red-400">
                ⚠ {area}: {i.kind}: {i.name}
              </p>
              <code className="block truncate text-xs text-zinc-500">{i.snippet}</code>
            </div>
          ));
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Read from the page&apos;s HTML, so links added later by the site&apos;s scripts aren&apos;t included.</p>
    </div>
  );
}

function Field({ name, value, min, max }: { name: string; value: string; min: number; max: number }) {
  const len = value.length;
  const bad = len < min || len > max;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <span className="flex w-32 shrink-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {name}
        {value && <CopyButton text={value} className="!px-2 !py-0.5 normal-case tracking-normal" />}
      </span>
      <span className={`flex-1 text-sm ${value ? "" : "font-medium text-red-600 dark:text-red-400"}`}>{value || "MISSING"}</span>
      <span className={`shrink-0 text-xs font-medium ${bad ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {bad ? "✗" : "✓"} {len}
      </span>
    </div>
  );
}

function PageCard({ row, selected, onSelect, onRerun, rerunning }: { row: Row; selected: boolean; onSelect: (on: boolean) => void; onRerun: () => void; rerunning: boolean }) {
  const seo = seoProblems(row);
  const broken = row.flags.length > 0 || seo.length > 0;
  const statusOk = row.probe ? row.status === 404 : row.status === 200;
  return (
    <div
      id={cardId(row.url)}
      className={`flex scroll-mt-20 flex-col gap-2 rounded-2xl border p-4 transition-shadow ${broken ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"} ${
        selected ? "bg-blue-50/60 dark:bg-blue-950/30" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} title="Select for Copy selected" />
        <span className="font-medium">{row.label}</span>
        <span className="text-xs text-zinc-500">{row.source}</span>
        <span className="ml-auto" />
        <span title={seo.join("\n") || "Title and description meet the criteria"} className={`rounded-full px-2 py-0.5 text-xs font-medium ${seo.length ? badBadge : okBadge}`}>
          {seo.length ? `SEO ✗ ${seo.length}` : "SEO ✓"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusOk ? okBadge : badBadge}`}>{row.status ?? "ERR"}</span>
        <button type="button" onClick={onRerun} disabled={rerunning} title="Re-run this page" className="rounded-md border border-zinc-300 px-2 py-0.5 text-sm disabled:opacity-50 dark:border-zinc-700">
          <span className={rerunning ? "inline-block animate-spin" : ""}>↻</span>
        </button>
      </div>
      <a href={row.url} target="_blank" rel="noreferrer" className="truncate text-xs text-blue-600 hover:underline dark:text-blue-400">
        {row.url}
      </a>
      {(seo.length > 0 || row.flags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {seo.map((f) => (
            <span key={f} className={`rounded-md px-2 py-0.5 text-xs ${badBadge}`}>
              ✗ {f}
            </span>
          ))}
          {row.flags.map((f) => (
            <span key={f} className={`rounded-md px-2 py-0.5 text-xs ${warnBadge}`}>
              ⚠ {f}
            </span>
          ))}
        </div>
      )}
      <Field name="Title" value={row.title} min={TITLE_MIN} max={TITLE_MAX} />
      <Field name="Description" value={row.description} min={DESC_MIN} max={DESC_MAX} />
    </div>
  );
}
