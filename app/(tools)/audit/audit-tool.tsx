"use client";

import { useState, useSyncExternalStore } from "react";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import { hasContactIssue, isBroken, seoProblems } from "./lib/audit";
import { AuditStore, GROUP_KEYS, GROUP_LABEL, type GroupKey } from "./lib/store";
import { ColorsView, KeywordsView, SpellingView, TextCaseView } from "./content-view";
import { DeadLinksView, LinkSearchView, deadLinkCount } from "./links-view";
import { SeoView, cardId } from "./seo-view";
import { Pill, badBadge, okBadge, softBadge } from "./ui";

type Section = "audit" | "links" | "content";
type View = "seo" | GroupKey | "links" | "lsearch" | "keywords" | "colors" | "tcase" | "spell";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "audit", label: "SEO audit" },
  { id: "links", label: "Links" },
  { id: "content", label: "Content" },
];
const SECTION_VIEWS: Record<Section, { id: View; label: string }[]> = {
  audit: [{ id: "seo", label: "Main pages" }, ...GROUP_KEYS.map((k) => ({ id: k as View, label: GROUP_LABEL[k] }))],
  links: [
    { id: "links", label: "Dead links" },
    { id: "lsearch", label: "Link search" },
  ],
  content: [
    { id: "keywords", label: "Keywords" },
    { id: "colors", label: "Colors" },
    { id: "tcase", label: "Text case" },
    { id: "spell", label: "Spelling" },
  ],
};
const sectionOf = (v: View): Section => (Object.keys(SECTION_VIEWS) as Section[]).find((s) => SECTION_VIEWS[s].some((x) => x.id === v)) ?? "audit";

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

export default function AuditTool() {
  const [store] = useState(() => new AuditStore());
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [view, setView] = useState<View>("seo");
  // Each section reopens on the view used last.
  const [lastView, setLastView] = useState<Record<Section, View>>({ audit: "seo", links: "links", content: "keywords" });

  const show = (v: View) => {
    setView(v);
    setLastView((all) => ({ ...all, [sectionOf(v)]: v }));
  };
  const section = sectionOf(view);
  const groupView = GROUP_KEYS.includes(view as GroupKey) ? (view as GroupKey) : null;
  // A group tab that's switched off falls back to the main pages.
  const activeView: View = groupView && !state.groups[groupView].on ? "seo" : view;

  function run() {
    const url = normalizeUrl(input);
    if (!url) {
      setInputError("Enter a site link, like https://example.com.");
      return;
    }
    setInputError("");
    void store.audit(url);
  }

  /** Clicking a page name in a search result jumps to its SEO card. */
  function jumpTo(url: string) {
    const target = state.rows.some((r) => r.url === url) ? "seo" : GROUP_KEYS.find((k) => state.groups[k].rows.some((r) => r.url === url));
    if (!target) return;
    show(target);
    requestAnimationFrame(() => {
      const el = document.getElementById(cardId(url));
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.animate([{ boxShadow: "0 0 0 3px rgb(59 130 246)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1600 });
    });
  }

  const hasResults = !!state.start && (state.rows.length > 0 || state.busy);
  const dead = deadLinkCount(store, state);
  const groupRows = activeView === "seo" || !groupView ? state.rows : state.groups[groupView].rows;
  const pages = (section === "audit" ? groupRows : store.allRows()).filter((r) => !r.probe);
  const stat = (n: number, one: string, many: string) => (
    <span key={one} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${n ? badBadge : okBadge}`}>
      {n ? "" : "✓ "}
      {n} {n === 1 ? one : many}
    </span>
  );

  return (
    <div className="mt-6 flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input className={inputClass} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Any page of the site, like https://example.com/about" aria-label="Site link" />
        <button type="submit" disabled={state.busy} className={`${primaryButtonClass} shrink-0`}>
          {state.busy ? "Auditing…" : state.rows.length ? "Re-run all" : "Audit site"}
        </button>
      </form>

      {(inputError || state.error) && <p className={errorClass}>{inputError || state.error}</p>}

      {state.progress && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Auditing {state.progress.done}/{state.progress.total}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(state.progress.done / state.progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {state.busy && !state.progress && <p className="text-sm text-zinc-600 dark:text-zinc-400">Reading page…</p>}

      {hasResults && state.start && (
        <>
          {/* Summary of the open view's pages. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium">{new URL(state.start.origin).host}</span>
            {!state.busy && (
              <>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${softBadge}`}>{pages.length + (section === "audit" && activeView === "seo" ? 1 : 0)} pages</span>
                {stat(pages.filter(isBroken).length, "broken page", "broken pages")}
                {stat(pages.filter((r) => seoProblems(r).length).length, "page failing SEO", "pages failing SEO")}
                {stat(pages.filter(hasContactIssue).length, "phone/email issue", "phone/email issues")}
                {activeView === "seo" && stat(state.start.headerIssues.length, "empty header/footer link", "empty header/footer links")}
                {stat(dead, "dead link (404)", "dead links (404)")}
                {state.linkJob && <span className="text-xs text-zinc-500">Checking links {state.linkJob.done}/{state.linkJob.total}…</span>}
                {state.spellJob && <span className="text-xs text-zinc-500">Checking spelling…</span>}
              </>
            )}
          </div>

          {/* Sections, then the open section's views. */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => show(lastView[s.id])}
                  aria-pressed={section === s.id}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                    section === s.id ? "border-blue-600 text-foreground" : "border-transparent text-zinc-500 hover:text-foreground"
                  }`}
                >
                  {s.label}
                  {s.id === "links" && dead > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{dead}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {SECTION_VIEWS[section]
                .filter((v) => !GROUP_KEYS.includes(v.id as GroupKey) || state.groups[v.id as GroupKey].on)
                .map((v) => {
                  const g = GROUP_KEYS.includes(v.id as GroupKey) ? state.groups[v.id as GroupKey] : null;
                  return (
                    <Pill key={v.id} active={activeView === v.id} onClick={() => show(v.id)}>
                      {v.label}
                      {g && g.status === null ? ` (${g.rows.length})` : ""}
                    </Pill>
                  );
                })}
              {section === "audit" && (
                <>
                  <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" aria-hidden />
                  {GROUP_KEYS.map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={state.groups[k].on}
                        disabled={state.busy}
                        onChange={(e) => {
                          store.toggleGroup(k, e.target.checked);
                          if (e.target.checked) show(k);
                        }}
                      />
                      {GROUP_LABEL[k]}
                    </label>
                  ))}
                </>
              )}
            </div>
          </div>

          {(activeView === "seo" || groupView) && section === "audit" && <SeoView store={store} state={state} view={groupView && state.groups[groupView].on ? groupView : "seo"} />}
          {!state.busy && (
            <>
              {activeView === "links" && <DeadLinksView store={store} state={state} onJump={jumpTo} />}
              {activeView === "lsearch" && <LinkSearchView store={store} state={state} onJump={jumpTo} />}
              {activeView === "keywords" && <KeywordsView store={store} state={state} onJump={jumpTo} />}
              {activeView === "colors" && <ColorsView store={store} state={state} onJump={jumpTo} />}
              {activeView === "tcase" && <TextCaseView store={store} state={state} onJump={jumpTo} />}
              {activeView === "spell" && <SpellingView store={store} state={state} onJump={jumpTo} />}
            </>
          )}
          {state.busy && section !== "audit" && <p className="text-sm text-zinc-500">Waiting for the audit to finish…</p>}
        </>
      )}
    </div>
  );
}
