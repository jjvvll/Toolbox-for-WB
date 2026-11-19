"use client";

import { useEffect, useMemo, useState } from "react";
import { inputClass } from "@/components/ui";
import type { Row } from "./lib/audit";
import type { DeadItem, HrefItem, LinkItem } from "./lib/collect";
import { compText, type Comp } from "./lib/labeler";
import { GROUP_KEYS, type AuditState, type AuditStore, type LinkState } from "./lib/store";
import { CompLabel, Code, Loader, useNow, ReportButton, ResultCard, Summary, Tag, badBadge, okBadge, pagePath, plural, selectClass, smallButton, softBadge, warnBadge } from "./ui";

// ================= Dead links =================

type Filter = "dead" | "problems" | "all";
type Shown = { text: string; comp: Comp; path: string; href: string; ext?: boolean; state: LinkState["state"]; why: string; pages?: string[] };

/** One page's links and buttons with their check results: page-specific ones, or only the site-wide ones. */
function itemsFor(r: Row, status: Map<string, LinkState>, wantGlobal: boolean, includeOk: boolean) {
  const items: Shown[] = [];
  let checked = 0;
  let pending = 0;
  for (const d of r.linkInv.dead as DeadItem[]) {
    // Empty or malformed links and buttons with no action never answer 404, so they are to check by hand.
    if (!!d.comp.global === wantGlobal) items.push({ ...d, state: "warn" });
  }
  for (const l of r.linkInv.links as LinkItem[]) {
    if (!!l.comp.global !== wantGlobal) continue;
    const st = status.get(l.href);
    if (!st || st.state === "pending") {
      pending++;
      if (includeOk) items.push({ ...l, state: "pending", why: "checking…" });
      continue;
    }
    checked++;
    if (st.state !== "ok") items.push({ ...l, state: st.state, why: `${st.code ? `HTTP ${st.code} · ` : ""}${st.note ?? ""}` });
    else if (includeOk) items.push({ ...l, state: "ok", why: `HTTP ${st.code}` });
  }
  const rank = { dead: 0, warn: 1, pending: 2, ok: 3 };
  items.sort((a, b) => rank[a.state] - rank[b.state]);
  return { items, checked, pending };
}

const ICON = { dead: "✗", warn: "⚠", ok: "✓", pending: "…" };
const ICON_CLASS = { dead: "text-red-600 dark:text-red-400", warn: "text-amber-600 dark:text-amber-400", ok: "text-emerald-600 dark:text-emerald-400", pending: "text-zinc-400" };

function LinkLine({ d }: { d: Shown }) {
  return (
    <div>
      <span className={`mr-1 font-medium ${ICON_CLASS[d.state]}`}>{ICON[d.state]}</span>
      <CompLabel comp={d.comp} />
      <b>{d.text}</b>
      {d.href && (
        <>
          {" → "}
          <a href={/^https?:/.test(d.href) ? d.href : undefined} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline dark:text-blue-400" title={d.href}>
            {d.href.length > 80 ? `${d.href.slice(0, 77)}…` : d.href}
          </a>
        </>
      )}
      {d.ext && <Tag className={`${softBadge} ml-1`}>external</Tag>}
      <span className="ml-1 text-xs text-zinc-500">{d.why}</span>
      {d.pages && (
        <span className="ml-1 text-xs text-zinc-500" title={d.pages.join("\n")}>
          on {plural(d.pages.length, "page")}
        </span>
      )}
      {d.path && (
        <div className="mt-0.5">
          <Code>{d.path}</Code>
        </div>
      )}
    </div>
  );
}

/** Different dead links across the audit, for the red count on the Links section. */
export function deadLinkCount(store: AuditStore, state: AuditState): number {
  const hrefs = new Set(store.allRows().flatMap((r) => r.linkInv.links.map((l) => l.href)));
  return [...hrefs].filter((u) => state.linkStatus.get(u)?.state === "dead").length;
}

export function DeadLinksView({ store, state, onJump }: { store: AuditStore; state: AuditState; onJump: (url: string) => void }) {
  const [filter, setFilter] = useState<Filter>("problems");
  const showAll = filter === "all";
  // "404 only" hides the links left to check by hand.
  const keep = (d: Shown) => filter !== "dead" || d.state === "dead";
  const job = state.linkJob;

  const result = useMemo(() => {
    const status = state.linkStatus;
    const rows = store.allRows();
    const line = (d: Shown) => `  - [${d.state === "dead" ? "404" : d.state === "warn" ? "CHECK BY HAND" : d.state.toUpperCase()}] ${compText(d.comp)}"${d.text}"${d.href ? ` → ${d.href}` : ""} — ${d.why}`;
    let dead = 0;
    let warn = 0;
    let checked = 0;
    let pending = 0;
    let pagesWithProblems = 0;
    const report: string[] = [];

    // Header, side menu, footer and popups: the same on every page, listed once.
    const shared = new Map<string, Shown & { pages: string[] }>();
    for (const r of rows) {
      for (const it of itemsFor(r, status, true, showAll).items.filter(keep)) {
        const k = [it.comp.name, it.text, it.href, it.why].join("\u0001");
        const e = shared.get(k) ?? { ...it, pages: [] };
        e.pages.push(pagePath(r.url));
        shared.set(k, e);
      }
    }
    const sharedItems = [...shared.values()];
    const sharedLinks = new Set(rows.flatMap((r) => r.linkInv.links.filter((l) => l.comp.global).map((l) => l.href)));
    const sc = { checked: 0, pending: 0 };
    sharedLinks.forEach((u) => {
      const st = status.get(u);
      if (!st || st.state === "pending") sc.pending++;
      else sc.checked++;
    });
    const sharedProblems = sharedItems.filter((d) => d.state === "dead" || d.state === "warn");
    dead += sharedProblems.filter((d) => d.state === "dead").length;
    warn += sharedProblems.filter((d) => d.state === "warn").length;
    checked += sc.checked;
    pending += sc.pending;
    if (sharedProblems.length) report.push("Site-wide (header, side menu, footer, popups)", ...sharedProblems.map(line));

    const groups: [string, Row[]][] = [["", state.rows.filter((r) => !r.probe)], ...GROUP_KEYS.filter((k) => state.groups[k].on).map((k) => [k, state.groups[k].rows] as [string, Row[]])];
    const pages: { group: string; row: Row; items: Shown[]; checked: number; pending: number; dead: number }[] = [];
    for (const [group, list] of groups) {
      for (const r of list) {
        const d = itemsFor(r, status, false, showAll);
        checked += d.checked;
        pending += d.pending;
        const items = d.items.filter(keep);
        const problems = items.filter((x) => x.state === "dead" || x.state === "warn");
        const pageDead = problems.filter((x) => x.state === "dead").length;
        dead += pageDead;
        warn += problems.filter((x) => x.state === "warn").length;
        if (!items.length) continue;
        if (pageDead) pagesWithProblems++;
        pages.push({ group, row: r, items, checked: d.checked, pending: d.pending, dead: pageDead });
        if (problems.length) report.push(`\n${r.label} (${r.url})`, ...problems.map(line));
      }
    }
    return {
      sharedItems,
      sc,
      sharedProblems: sharedProblems.length,
      sharedDead: sharedProblems.filter((d) => d.state === "dead").length,
      pages,
      dead,
      warn,
      checked,
      pending,
      pagesWithProblems,
      report: report.length ? `Links — ${dead} dead (404), ${warn} to check by hand\n${report.join("\n")}` : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep only reads filter
  }, [store, state.linkStatus, state.rows, state.groups, showAll, filter]);

  const unchecked = store.uncheckedLinks().length;
  const now = useNow(!!job);
  const notes = job
    ? [
        now - job.lastAnswer > 10_000 ? `no answer for ${Math.round((now - job.lastAnswer) / 1000)}s (a slow site; each link gives up after 15s)` : "",
        job.working.length ? `waiting on ${job.working.slice(0, 2).map((u) => u.replace(/^https?:\/\/(www\.)?/, "")).join(", ")}${job.working.length > 2 ? ` +${job.working.length - 2}` : ""}` : "",
      ]
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={smallButton}
          disabled={!!job || !state.rows.length}
          onClick={() => store.runLinkCheck(!unchecked)}
          title={unchecked ? "Check the links that haven't been checked yet" : "Check every link again, live"}
        >
          {job ? "Checking…" : unchecked ? "Check the rest" : "Re-check links"}
        </button>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={selectClass} aria-label="Which links to show">
          <option value="dead">404 only</option>
          <option value="problems">404 + check by hand</option>
          <option value="all">All links</option>
        </select>
        <span className="ml-auto">
          <ReportButton text={result.report} />
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Links are checked automatically after each audit (a HEAD request, then GET; each gives up after 15 seconds). Only a 404 counts as dead.
        Every other answer (server errors, sites refusing automatic checks, timeouts) and empty or malformed links and buttons with no action are marked “check by hand”,
        since they can&apos;t be confirmed automatically.
      </p>

      {job && (
        <Loader
          message={`Checking ${plural(job.total, "different link")}: ${job.done} done…`}
          done={job.done}
          total={job.total}
          started={job.started}
          notes={notes}
          slow={now - job.lastAnswer > 10_000}
          onCancel={() => store.stopLinkCheck()}
        />
      )}

      <Summary>
        {state.linksStopped && result.pending ? `Link check stopped: ${result.pending} not checked. Press Check the rest to finish it. · ` : ""}
        {job && result.pending ? `Checking… ${result.checked} done, ${result.pending} to go · ` : ""}
        {result.dead || result.warn ? (
          <>
            <b>{result.dead}</b> dead (404) on {plural(result.pagesWithProblems, "page")}
            {result.sharedDead ? " + site-wide" : ""}
            {filter !== "dead" && (
              <>
                {" "}
                · <b>{result.warn}</b> to check by hand
              </>
            )}{" "}
            · {result.checked} links checked
          </>
        ) : result.pending ? (
          ""
        ) : (
          `✓ No dead links (404) · ${result.checked} links checked`
        )}
      </Summary>

      {(result.sharedItems.length > 0 || showAll) && (
        <ResultCard
          title="Site-wide links"
          sub="header · side menu · footer · popups"
          tone={result.sharedDead ? "bad" : "shared"}
          limit={12}
          noun="links"
          tags={<CheckTags items={result.sharedItems} counts={result.sc} />}
          items={result.sharedItems.map((d, i) => <LinkLine key={i} d={d} />)}
        />
      )}
      {result.pages.map((p, i) => (
        <div key={p.row.url} className="flex flex-col gap-2">
          {p.group && p.group !== result.pages[i - 1]?.group && <h3 className="mt-2 text-sm font-semibold">{p.group} pages</h3>}
          <ResultCard
            title={p.row.label}
            sub={pagePath(p.row.url)}
            url={p.row.url}
            onJump={onJump}
            tone={p.dead ? "bad" : "normal"}
            limit={12}
            noun="links"
            tags={<CheckTags items={p.items} counts={p} />}
            items={p.items.map((d, k) => <LinkLine key={k} d={d} />)}
          />
        </div>
      ))}
      {!result.pages.length && !result.sharedItems.length && !result.pending && state.rows.length > 0 && (
        <p className="text-sm text-zinc-500">Nothing to show. Choose “All links” to list every link that was checked.</p>
      )}
    </div>
  );
}

function CheckTags({ items, counts }: { items: Shown[]; counts: { checked: number; pending: number } }) {
  const dead = items.filter((d) => d.state === "dead").length;
  const warn = items.filter((d) => d.state === "warn").length;
  return (
    <>
      {dead > 0 && <Tag className={badBadge}>{dead} dead (404)</Tag>}
      {warn > 0 && <Tag className={warnBadge}>{warn} to check by hand</Tag>}
      <Tag className={dead || warn ? softBadge : okBadge}>
        {counts.checked} checked{counts.pending ? ` · ${counts.pending} pending` : ""}
      </Tag>
    </>
  );
}

// ================= Link search =================

const decodeSafe = (s: string) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};
const dropSlash = (s: string) => s.replace(/\/(?=[?#]|$)/, ""); // https://x.com/a/?b → https://x.com/a?b

function MarkFirst({ s, q }: { s: string; q: string }) {
  const i = s.toLowerCase().indexOf(q);
  if (i < 0 || !q) return <>{s}</>;
  return (
    <>
      {s.slice(0, i)}
      <mark className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">{s.slice(i, i + q.length)}</mark>
      {s.slice(i + q.length)}
    </>
  );
}

function HrefLine({ h, q }: { h: HrefItem & { pages?: string[] }; q: string }) {
  const shown = decodeSafe(h.raw);
  return (
    <div>
      <CompLabel comp={h.comp} />
      <b>{h.text || "(no text)"}</b>
      {" → "}
      <a href={h.abs} target="_blank" rel="noreferrer" title={h.abs} className="break-all text-blue-600 hover:underline dark:text-blue-400">
        <MarkFirst s={shown.length > 160 ? `${shown.slice(0, 157)}…` : shown} q={q} />
      </a>
      {h.attr !== "href" && (
        <Tag className={`${softBadge} ml-1`}>
          {h.tag} {h.attr}
        </Tag>
      )}
      {h.pages && (
        <span className="ml-1 text-xs text-zinc-500" title={h.pages.join("\n")}>
          on {plural(h.pages.length, "page")}
        </span>
      )}
      {h.path && (
        <div className="mt-0.5">
          <Code>{h.path}</Code>
        </div>
      )}
    </div>
  );
}

export function LinkSearchView({ store, state, onJump }: { store: AuditStore; state: AuditState; onJump: (url: string) => void }) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"contains" | "exact">("contains");
  const [withDetail, setWithDetail] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const includeDetail = withDetail && !skipped;
  const needDetail = includeDetail && !!input.trim() && state.detail.state !== "done";
  useEffect(() => {
    if (needDetail && state.detail.state === "idle" && state.start) void store.loadDetail();
  }, [needDetail, state.detail.state, state.start, store]);

  const result = useMemo(() => {
    const typed = input.trim();
    if (!typed) return null;
    const q = decodeSafe(typed).toLowerCase();
    let target: string | null = null; // "Exact link": made absolute, so /about and https://site.com/about/ match
    if (mode === "exact") {
      try {
        target = dropSlash(decodeSafe(new URL(typed, state.start?.origin).href)).toLowerCase();
      } catch {
        // the typed text isn't a link
      }
    }
    const isHit = target !== null ? (h: HrefItem) => dropSlash(decodeSafe(h.abs)).toLowerCase() === target : (h: HrefItem) => [h.raw, h.abs].some((s) => decodeSafe(s).toLowerCase().includes(q));
    const groups: [string, Row[]][] = [["", state.rows.filter((r) => !r.probe)], ...GROUP_KEYS.map((k) => [k, store.groupRows(k, includeDetail)] as [string, Row[]])];
    const shared = new Map<string, HrefItem & { pages: string[] }>();
    const pages: { group: string; row: Row; items: HrefItem[] }[] = [];
    const report: string[] = [];
    let searched = 0;
    let pageLinks = 0;
    for (const [group, list] of groups) {
      for (const r of list) {
        searched++;
        const page = pagePath(r.url);
        const mine: HrefItem[] = [];
        for (const h of r.hrefs) {
          if (!isHit(h)) continue;
          if (h.comp.global) {
            const k = [h.comp.name, h.text, h.raw, h.path].join("\u0001");
            const e = shared.get(k) ?? { ...h, pages: [] };
            if (!e.pages.includes(page)) e.pages.push(page);
            shared.set(k, e);
          } else mine.push(h);
        }
        if (!mine.length) continue;
        pageLinks += mine.length;
        pages.push({ group, row: r, items: mine });
        report.push(`\n${r.label} (${r.url})`, ...mine.map((h) => `  - ${compText(h.comp)}"${h.text || "(no text)"}" → ${h.raw}`));
      }
    }
    const sharedItems = [...shared.values()];
    if (sharedItems.length) report.unshift("Site-wide (header, side menu, footer, popups)", ...sharedItems.map((h) => `  - ${compText(h.comp)}"${h.text || "(no text)"}" → ${h.raw}  (on ${h.pages.length} page(s))`));
    const total = sharedItems.length + pageLinks;
    return {
      q,
      exact: target !== null,
      sharedItems,
      pages,
      searched,
      total,
      report: total ? `Links ${target !== null ? "equal to" : "containing"} "${typed}" — ${total} found on ${searched} pages searched\n${report.join("\n")}` : "",
    };
    // The store's helpers read state.groups and state.detail, so results update when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, mode, includeDetail, state.rows, state.groups, state.detail, state.start, store]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} sm:max-w-md`} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Part of a link, e.g. /home-search/listings?priceMin=250000" aria-label="Link to find" />
        <select value={mode} onChange={(e) => setMode(e.target.value as "contains" | "exact")} className={selectClass}>
          <option value="contains">Link contains</option>
          <option value="exact">Exact link</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={withDetail}
            onChange={(e) => {
              setWithDetail(e.target.checked);
              setSkipped(false);
            }}
          />
          Neighborhood &amp; agent pages
        </label>
        <span className="ml-auto">
          <ReportButton text={result?.report ?? ""} />
        </span>
      </div>
      {needDetail && <DetailLoader state={state} onSkip={() => setSkipped(true)} />}
      <Summary>
        {!result ? (
          "Type part of a link to find every place it's used: links, buttons, image maps, forms and embeds, Home Search links included."
        ) : result.total ? (
          <>
            <b>{result.total}</b> {result.total === 1 ? "link" : "links"} found: {plural(result.pages.length, "page")}
            {result.sharedItems.length ? ` + ${result.sharedItems.length} site-wide` : ""} · {result.searched} pages searched
          </>
        ) : (
          `No links ${result.exact ? "equal" : "contain"} “${input.trim()}” on the ${result.searched} pages searched.`
        )}
      </Summary>
      {result && result.sharedItems.length > 0 && (
        <ResultCard
          title="Site-wide links"
          sub="header · side menu · footer · popups"
          tone="shared"
          limit={12}
          noun="links"
          tags={<Tag>{plural(result.sharedItems.length, "link")}</Tag>}
          items={result.sharedItems.map((h, i) => <HrefLine key={i} h={h} q={result.q} />)}
        />
      )}
      {result?.pages.map((p, i) => (
        <div key={p.row.url} className="flex flex-col gap-2">
          {p.group && p.group !== result.pages[i - 1]?.group && <h3 className="mt-2 text-sm font-semibold">{p.group} pages</h3>}
          <ResultCard
            title={p.row.label}
            sub={pagePath(p.row.url)}
            url={p.row.url}
            onJump={onJump}
            limit={12}
            noun="links"
            tags={<Tag>{plural(p.items.length, "link")}</Tag>}
            items={p.items.map((h, k) => <HrefLine key={k} h={h} q={result.q} />)}
          />
        </div>
      ))}
    </div>
  );
}

/** Progress of the background read of neighborhood & agent pages, with Skip. */
export function DetailLoader({ state, onSkip }: { state: AuditState; onSkip: () => void }) {
  const [started] = useState(() => Date.now());
  const d = state.detail;
  return (
    <Loader
      message={d.total ? `Reading neighborhood & agent pages ${d.done} of ${d.total}…` : "Looking for neighborhood & agent pages…"}
      done={d.done}
      total={d.total || undefined}
      started={started}
      notes={["read once, then searches are instant"]}
      cancelLabel="Skip these pages"
      onCancel={onSkip}
    />
  );
}
