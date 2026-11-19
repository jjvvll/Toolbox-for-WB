"use client";

import { useEffect, useMemo, useState } from "react";
import { inputClass } from "@/components/ui";
import type { Row } from "./lib/audit";
import { designCssParts, parseColorInput, rgbHex, type ColorPart, type Rgba } from "./lib/colors";
import type { Part } from "./lib/collect";
import { compText, type Comp } from "./lib/labeler";
import { GROUP_KEYS, spellKey, type AuditState, type AuditStore, type GroupKey, type SpellHit, type SpellLang } from "./lib/store";
import { CASE_LABEL, caseReasons, type CaseMode, type CasePart, type CaseReason, type Screen } from "./lib/text-case";
import { DetailLoader } from "./links-view";
import { CompLabel, Code, Loader, ReportButton, ResultCard, Snippet, Summary, Tag, badBadge, pagePath, plural, selectClass, smallButton, softBadge, useNow, warnBadge } from "./ui";

type JumpProps = { store: AuditStore; state: AuditState; onJump: (url: string) => void };

/** Reads neighborhood/agent pages in the background when a search includes them. */
function useDetail(store: AuditStore, state: AuditState, want: boolean) {
  const [skipped, setSkipped] = useState(false);
  const include = want && !skipped;
  const loading = include && state.detail.state !== "done" && !!state.start;
  useEffect(() => {
    if (loading && state.detail.state === "idle") void store.loadDetail();
  }, [loading, state.detail.state, store]);
  return { include, loading, skip: () => setSkipped(true), reset: () => setSkipped(false) };
}

// ================= Keywords =================

const SEO_WHERE = new Set(["title", "description", "meta tag"]);
// Text fragments (#:~:text=) only scroll to text that's visible on the page.
const VISIBLE_WHERE = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "link text", "button", "body text"]);

type Hit = Part & { n: number; isSeo: boolean; url: string; pages?: string[] };

function buildRegex(q: string, matchCase: boolean, wholeWord: boolean): RegExp | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  let src = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  if (wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  return new RegExp(src, `gu${matchCase ? "" : "i"}`);
}

function HitLine({ h, re }: { h: Hit; re: RegExp }) {
  const once = new RegExp(re.source, re.flags.replace("g", ""));
  const found = VISIBLE_WHERE.has(h.where) ? once.exec(h.text)?.[0] : null;
  return (
    <div>
      <CompLabel comp={h.comp} />
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{h.where}</span>
      {h.path && (
        <>
          {" in "}
          <Code title={h.path}>{h.path}</Code>
        </>
      )}
      {h.n > 1 && <span className="ml-1 text-xs text-zinc-500">×{h.n}</span>}
      {h.pages && (
        <span className="ml-1 text-xs text-zinc-500" title={h.pages.join("\n")}>
          · same on {plural(h.pages.length, "page")}
        </span>
      )}
      {found && (
        <a href={`${h.url}#:~:text=${encodeURIComponent(found)}`} target="_blank" rel="noreferrer" className="ml-1 text-blue-600 dark:text-blue-400" title="Open the page scrolled to this text">
          ↗
        </a>
      )}
      <div className="mt-0.5 text-zinc-700 dark:text-zinc-300">
        <Snippet text={h.text} re={re} />
      </div>
    </div>
  );
}

function WhereTags({ hits }: { hits: Hit[] }) {
  const byWhere = new Map<string, number>();
  hits.forEach((h) => byWhere.set(h.where, (byWhere.get(h.where) ?? 0) + h.n));
  return (
    <>
      {[...byWhere].map(([w, n]) => (
        <Tag key={w} className={SEO_WHERE.has(w) ? warnBadge : softBadge}>
          {SEO_WHERE.has(w) ? "seo · " : ""}
          {w} ×{n}
        </Tag>
      ))}
    </>
  );
}

export function KeywordsView({ store, state, onJump }: JumpProps) {
  const [q, setQ] = useState("");
  const [everything, setEverything] = useState(false);
  const [scope, setScope] = useState<"all" | "body" | "seo">("all");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const re = useMemo(() => buildRegex(q, matchCase, wholeWord), [q, matchCase, wholeWord]);
  const result = useMemo(() => {
    if (!re) return null;
    const list = store.allRows();
    const count = (s: string) => (s ? (s.match(re) ?? []).length : 0);
    const shared = new Map<string, Hit & { pages: string[] }>();
    const cards: { row: Row; hits: Hit[] }[] = [];
    let total = 0;
    for (const r of list) {
      const pieces: Part[] = [
        { where: "title", text: r.title, path: "head › title", comp: null },
        { where: "description", text: r.description, path: 'head › meta[name="description"]', comp: null },
        ...(everything ? r.parts : r.visibleParts),
      ];
      const hits: Hit[] = [];
      for (const p of pieces) {
        const isSeo = SEO_WHERE.has(p.where);
        if ((scope === "seo" && !isSeo) || (scope === "body" && isSeo)) continue;
        const n = count(p.text);
        if (!n) continue;
        if (p.comp?.global) {
          const key = [p.comp.name, p.where, p.path, p.text].join("\u0001");
          const s = shared.get(key) ?? { ...p, n, isSeo, url: r.url, pages: [] };
          s.pages.push(pagePath(r.url));
          shared.set(key, s);
          continue;
        }
        hits.push({ ...p, n, isSeo, url: r.url });
      }
      if (!hits.length) continue;
      hits.sort((a, b) => Number(b.isSeo) - Number(a.isSeo)); // SEO places first
      total += hits.reduce((s, h) => s + h.n, 0);
      cards.push({ row: r, hits });
    }
    const sharedHits = [...shared.values()];
    const sharedN = sharedHits.reduce((s, h) => s + h.n, 0);
    const line = (h: Hit) => `  - ${compText(h.comp)}${h.where}: ${h.text.slice(0, 160)}`;
    const report = [
      ...(sharedHits.length ? ["Site-wide (header, side menu, footer, popups)", ...sharedHits.map(line)] : []),
      ...cards.flatMap((c) => [`\n${c.row.label} (${c.row.url})`, ...c.hits.map(line)]),
    ];
    return { list, cards, sharedHits, sharedN, total, report: report.length ? `"${q.trim()}" — ${total + sharedN} match(es)\n${report.join("\n")}` : "" };
    // The store's helpers read state.rows and state.groups, so results update when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [re, everything, scope, store, q, state.rows, state.groups]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} sm:max-w-sm`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a word or phrase on every page" aria-label="Keyword" />
        <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "body" | "seo")} className={selectClass}>
          <option value="all">Everywhere</option>
          <option value="body">Page content only</option>
          <option value="seo">SEO only (title, description, meta)</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole word
        </label>
        <label className="flex items-center gap-1.5 text-sm" title="Alt text, title/aria-label, placeholders, link addresses, meta tags and loose text">
          <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} /> Include hidden text
        </label>
        <span className="ml-auto">
          <ReportButton text={result?.report ?? ""} />
        </span>
      </div>
      <Summary>
        {!result ? (
          "Type a word to find it on every audited page (neighborhood and agent pages too, when those tabs are on). Testimonials and duplicated slider slides are skipped."
        ) : result.cards.length || result.sharedHits.length ? (
          <>
            <b>{result.cards.length}</b> of {result.list.length} pages contain it ({plural(result.total, "match", "matches")})
            {result.sharedHits.length ? ` + ${result.sharedN} in the header / side menu / footer` : ""} ·{" "}
            {everything ? "searching everything (alt text, attributes, link URLs, meta tags, loose text)" : "visible text only"}
          </>
        ) : (
          `Not found on any of the ${result.list.length} audited pages.`
        )}
      </Summary>
      {result && re && result.sharedHits.length > 0 && (
        <ResultCard
          title="Site-wide (same on every page)"
          sub={[...new Set(result.sharedHits.map((h) => h.comp?.name))].join(" · ")}
          tone="shared"
          tags={<WhereTags hits={result.sharedHits} />}
          items={result.sharedHits.map((h, i) => <HitLine key={i} h={h} re={re} />)}
        />
      )}
      {result &&
        re &&
        result.cards.map((c) => (
          <ResultCard
            key={c.row.url}
            title={c.row.label}
            sub={pagePath(c.row.url)}
            url={c.row.url}
            onJump={onJump}
            tags={<WhereTags hits={c.hits} />}
            items={c.hits.map((h, i) => <HitLine key={i} h={h} re={re} />)}
          />
        ))}
    </div>
  );
}

// ================= Colors =================

type ColorItem = { p: ColorPart; note?: string };

function ColorValue({ p, isMatch }: { p: ColorPart; isMatch: (c: Rgba) => boolean }) {
  // Highlight the matching tokens, with a swatch for each color in the value.
  const tokens = p.c.toSorted((a, b) => b.t.length - a.t.length);
  const re = new RegExp(tokens.map((k) => k.t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of p.v.matchAll(re)) {
    const tok = tokens.find((k) => k.t.toLowerCase() === m[0].toLowerCase());
    out.push(p.v.slice(last, m.index));
    out.push(
      <span key={m.index}>
        <span className="mr-0.5 inline-block h-3 w-3 rounded-sm border border-zinc-300 align-middle dark:border-zinc-600" style={{ background: m[0] }} />
        {tok && isMatch(tok.c) ? <mark className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">{m[0]}</mark> : m[0]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(p.v.slice(last));
  return <span className="break-all font-mono text-xs">{out}</span>;
}

function ColorLine({ x, isMatch }: { x: ColorItem; isMatch: (c: Rgba) => boolean }) {
  const { p } = x;
  const same = p.comp?.name === p.s; // site settings: the source already is the label
  return (
    <div>
      {!same && <CompLabel comp={p.comp} />}
      <span className={same ? "text-xs font-medium text-violet-700 dark:text-violet-300" : "text-xs font-medium text-zinc-600 dark:text-zinc-400"}>{p.s}</span> <Code>{p.p}</Code>
      {" in "}
      <Code title={p.w}>{p.w.length > 90 ? `${p.w.slice(0, 87)}…` : p.w}</Code>
      {p.m && <Tag className={`${softBadge} ml-1`}>@{p.m}</Tag>}
      {p.h && (
        <Tag className={`${warnBadge} ml-1`} title="This element is hidden on the page (hidden attribute, display:none, or switched off in the page CSS)">
          hidden
        </Tag>
      )}
      {x.note && <span className="ml-1 text-xs text-zinc-500">{x.note}</span>}
      <div className="mt-0.5">
        <ColorValue p={p} isMatch={isMatch} />
      </div>
    </div>
  );
}

const TOLERANCES = [
  { v: 0, label: "Exact" },
  { v: 2, label: "±2" },
  { v: 8, label: "±8" },
  { v: 20, label: "±20" },
];

export function ColorsView({ store, state, onJump }: JumpProps) {
  const [q, setQ] = useState("");
  const [tol, setTol] = useState(0);
  const [withDesign, setWithDesign] = useState(false);
  const [withDetail, setWithDetail] = useState(true);
  const [design, setDesign] = useState<{ url: string; parts: ColorPart[] | null; error?: string; started: number } | null>(null);
  const detail = useDetail(store, state, withDetail && !!q.trim());
  const target = useMemo(() => parseColorInput(q), [q]);
  const designUrl = state.rows.find((r) => r.designCss)?.designCss ?? "";

  useEffect(() => {
    if (!withDesign || !designUrl || design?.url === designUrl) return;
    let live = true;
    const started = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesign({ url: designUrl, parts: null, started });
    designCssParts(designUrl).then(
      (parts) => live && setDesign({ url: designUrl, parts, started }),
      () => live && setDesign({ url: designUrl, parts: [], error: "The template stylesheet couldn't be read.", started }),
    );
    return () => {
      live = false;
    };
  }, [withDesign, designUrl, design?.url]);

  const result = useMemo(() => {
    if (!target) return null;
    const isMatch = (c: Rgba) => Math.max(Math.abs(c[0] - target[0]), Math.abs(c[1] - target[1]), Math.abs(c[2] - target[2])) <= tol;
    const hits = (p: ColorPart) => p.c.some((k) => isMatch(k.c));
    const shared = new Map<string, { p: ColorPart; pages: Set<string> }>();
    const addShared = (p: ColorPart, page: string) => {
      const key = [p.s, p.comp?.name, p.w, p.p, p.v].join("\u0001");
      const e = shared.get(key) ?? { p, pages: new Set<string>() };
      e.pages.add(page);
      shared.set(key, e);
    };
    if (withDesign && design?.parts) design.parts.filter(hits).forEach((p) => addShared(p, "template"));

    const line = (p: ColorPart, extra = "") => `  - ${compText(p.comp)}${p.s}: ${p.p} in ${p.w} = ${p.v}${p.h ? "  (hidden)" : ""}${extra}`;
    const report: string[] = [];
    const pageCards: { row: Row; items: ColorItem[] }[] = [];
    for (const r of state.rows.filter((r) => !r.probe)) {
      const mine: ColorItem[] = [];
      for (const p of r.colorParts) {
        if (!hits(p)) continue;
        if (p.site || p.comp?.global) addShared(p, pagePath(r.url));
        else mine.push({ p });
      }
      if (!mine.length) continue;
      pageCards.push({ row: r, items: mine });
      report.push(`\n${r.label} (${r.url})`, ...mine.map((x) => line(x.p)));
    }

    // Neighborhood / agent pages share one page template, but an element can be shown on one
    // page and hidden or missing on another: one card per group, each place says where it applies.
    const groupCards: { key: GroupKey; count: number; items: ColorItem[] }[] = [];
    let groupPages = 0;
    for (const key of GROUP_KEYS) {
      const gl = store.groupRows(key, detail.include);
      groupPages += gl.length;
      if (!gl.length) continue;
      const agg = new Map<string, { p: ColorPart; shown: string[]; hidden: string[] }>();
      for (const r of gl) {
        for (const p of r.colorParts) {
          if (!hits(p)) continue;
          if (p.site || p.comp?.global) {
            addShared(p, pagePath(r.url));
            continue;
          }
          if (p.absent) continue; // CSS for an element this page doesn't have: counted as "not on" below
          const k = [p.comp?.name, p.comp?.template, p.s, p.p, p.w.replace(/section-[0-9a-f-]{36}/gi, "section"), p.v].join("\u0001");
          const e = agg.get(k) ?? { p, shown: [], hidden: [] };
          (p.h ? e.hidden : e.shown).push(r.label);
          agg.set(k, e);
        }
      }
      if (!agg.size) continue;
      const items = [...agg.values()].map((e) => {
        const absent = gl.length - e.shown.length - e.hidden.length;
        const note = `shown on ${e.shown.length}/${gl.length}${e.hidden.length ? ` · hidden on ${e.hidden.length}` : ""}${absent ? ` · not on ${absent}` : ""}`;
        return { p: { ...e.p, h: false }, note };
      });
      groupCards.push({ key, count: gl.length, items });
      report.push(`\n${key} pages (${gl.length})`, ...items.map((x) => line(x.p, `  — ${x.note}`)));
    }

    const sharedItems: ColorItem[] = [...shared.values()]
      .map((e) => ({ p: e.p, note: e.pages.has("template") ? "" : `same on ${plural(e.pages.size, "page")}` }))
      .sort((a, b) => Number(b.p.site) - Number(a.p.site));
    if (sharedItems.length) report.unshift("Site-wide settings & shared elements", ...sharedItems.map((x) => line(x.p)));
    const total = sharedItems.length + pageCards.reduce((n, c) => n + c.items.length, 0) + groupCards.reduce((n, c) => n + c.items.length, 0);
    const hex = rgbHex(target).toUpperCase();
    return {
      isMatch,
      hex,
      sharedItems,
      pageCards,
      groupCards,
      total,
      searched: state.rows.filter((r) => !r.probe).length + groupPages,
      report: total ? `Color ${hex}${tol ? ` (±${tol})` : ""} — ${total} place(s)\n${report.join("\n")}` : "",
    };
    // The store's helpers read state.groups and state.detail, so results update when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tol, withDesign, design, state.rows, state.groups, state.detail, detail.include, store]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block h-8 w-8 shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700" style={{ background: target ? `rgba(${target.join(",")})` : "transparent" }} />
        <input className={`${inputClass} sm:max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="#002349, 002349, rgb(…), hsl(…) or a name" aria-label="Color to find" />
        <input type="color" value={target ? rgbHex(target) : "#000000"} onChange={(e) => setQ(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700" title="Pick a color" />
        <select value={tol} onChange={(e) => setTol(Number(e.target.value))} className={selectClass} aria-label="How close">
          {TOLERANCES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm" title="The LP design stylesheet the template is built on">
          <input type="checkbox" checked={withDesign} onChange={(e) => setWithDesign(e.target.checked)} /> Include template stylesheet
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={withDetail}
            onChange={(e) => {
              setWithDetail(e.target.checked);
              detail.reset();
            }}
          />
          Neighborhood &amp; agent pages
        </label>
        <span className="ml-auto">
          <ReportButton text={result?.report ?? ""} />
        </span>
      </div>
      {detail.loading && <DetailLoader state={state} onSkip={detail.skip} />}
      {withDesign && design && !design.parts && <Loader message="Reading the template design stylesheet…" started={design.started} onCancel={() => setWithDesign(false)} cancelLabel="Skip it" />}
      {design?.error && withDesign && <p className="text-sm text-red-600 dark:text-red-400">{design.error}</p>}
      <Summary>
        {!q.trim() ? (
          "Enter the old color to find every place it's used: the site palette, style presets, element styles, page CSS, element color settings, inline styles and SVG fills."
        ) : !result ? (
          "Not a color. Use #002349, 002349, rgb(0, 35, 73), hsl(…) or a color name."
        ) : result.total ? (
          <>
            <b>{result.total}</b> {result.total === 1 ? "place uses" : "places use"} {result.hex}
            {tol ? " (or a near shade)" : ""}: {result.sharedItems.length} site-wide · {plural(result.pageCards.length, "page")}
            {result.groupCards.length ? ` · ${plural(result.groupCards.length, "neighborhood/agent group")}` : ""}
          </>
        ) : (
          `${result.hex} isn't used on any of the ${result.searched} pages searched${withDesign ? " or in the template stylesheet" : ""}.`
        )}
      </Summary>
      {result && result.sharedItems.length > 0 && (
        <ResultCard
          title="Site-wide settings & shared elements"
          sub="palette · style presets · header · side menu · footer · popups"
          tone="shared"
          noun="places"
          tags={<Tag>{plural(result.sharedItems.length, "place")}</Tag>}
          items={result.sharedItems.map((x, i) => <ColorLine key={i} x={x} isMatch={result.isMatch} />)}
        />
      )}
      {result?.pageCards.map((c) => (
        <ResultCard
          key={c.row.url}
          title={c.row.label}
          sub={pagePath(c.row.url)}
          url={c.row.url}
          onJump={onJump}
          noun="places"
          tags={<Tag>{plural(c.items.length, "place")}</Tag>}
          items={c.items.map((x, i) => <ColorLine key={i} x={x} isMatch={result.isMatch} />)}
        />
      ))}
      {result?.groupCards.map((c) => (
        <ResultCard
          key={c.key}
          title={`${c.key} pages`}
          sub={`${c.count} pages · ${plural(c.items.length, "place")}`}
          noun="places"
          items={c.items.map((x, i) => <ColorLine key={i} x={x} isMatch={result.isMatch} />)}
        />
      ))}
    </div>
  );
}

// ================= Text case =================

type CaseItem = { u: CasePart; reasons: CaseReason[]; count: number; pages?: string[] };

function CaseLine({ x }: { x: CaseItem }) {
  const styled = x.reasons.find((r): r is Extract<CaseReason, { kind: "styled" }> => r.kind === "styled");
  const typed = x.reasons.find((r): r is Extract<CaseReason, { kind: "typed" }> => r.kind === "typed");
  // Highlight the words typed in capitals.
  let body: React.ReactNode = x.u.t;
  if (typed) {
    const re = new RegExp(
      typed.runs
        .toSorted((a, b) => b.length - a.length)
        .map((run) => run.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]{1,3}?"))
        .join("|"),
      "g",
    );
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const m of x.u.t.matchAll(re)) {
      parts.push(x.u.t.slice(last, m.index));
      parts.push(
        <mark key={m.index} className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40">
          {m[0]}
        </mark>,
      );
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(x.u.t.slice(last));
    body = parts;
  }
  return (
    <div>
      <CompLabel comp={x.u.comp} />
      {x.reasons.map((r, i) =>
        r.kind === "typed" ? (
          <Tag key={i} className={`${warnBadge} mr-1`} title="Written in capitals in the text itself: retype it (changing the style won't help)">
            Typed in capitals
          </Tag>
        ) : (
          <Tag key={i} className={`${softBadge} mr-1`} title={r.why}>
            Styled: {r.label}
          </Tag>
        ),
      )}
      {x.u.h && <Tag className={`${warnBadge} mr-1`}>hidden</Tag>}
      {x.pages && (
        <span className="text-xs text-zinc-500" title={x.pages.join("\n")}>
          on {plural(x.pages.length, "page")}
        </span>
      )}
      {x.count > 1 && <span className="ml-1 text-xs text-zinc-500">× {x.count}</span>}
      <div className="mt-0.5">{body}</div>
      {styled && (
        <div className="mt-0.5 text-xs text-zinc-500">
          Shows as: <span style={styled.css}>{x.u.t.slice(0, 120)}</span>
        </div>
      )}
      {styled?.why && (
        <div className="mt-0.5">
          <Code title={styled.why}>{styled.why.length > 160 ? `${styled.why.slice(0, 157)}…` : styled.why}</Code>
        </div>
      )}
      {x.u.path && (
        <div className="mt-0.5">
          <Code>{x.u.path}</Code>
        </div>
      )}
    </div>
  );
}

export function TextCaseView({ store, state, onJump }: JumpProps) {
  const [mode, setMode] = useState<CaseMode>("uppercase");
  const [screen, setScreen] = useState<Screen>("d");
  const [skipAcronyms, setSkipAcronyms] = useState(true);
  const [withDetail, setWithDetail] = useState(true);
  const detail = useDetail(store, state, withDetail);
  const [started] = useState(() => Date.now());

  const groups = useMemo(
    () => [["", state.rows.filter((r) => !r.probe)] as [string, Row[]], ...GROUP_KEYS.map((k) => [k, store.groupRows(k, detail.include)] as [string, Row[]])],
    // The store's helpers read state.groups and state.detail, so this updates when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.rows, state.groups, state.detail, detail.include, store],
  );
  // Read the pages' styles the first time they're needed; afterwards switching options is instant.
  useEffect(() => {
    if (detail.loading) return;
    void store.loadCase(groups.flatMap(([, list]) => list));
  }, [groups, detail.loading, store]);

  const result = useMemo(() => {
    const shared = new Map<string, CaseItem & { pages: string[] }>();
    const cards: { group: string; row: Row; items: CaseItem[] }[] = [];
    const report: string[] = [];
    const line = (x: CaseItem) =>
      `  - ${compText(x.u.comp)}"${x.u.t}" — ${x.reasons.map((r) => (r.kind === "typed" ? `typed in capitals (${r.runs.join(", ")})` : `styled ${r.label} (${r.why})`)).join("; ")}${x.u.h ? " [hidden]" : ""}`;
    let searched = 0;
    let typedN = 0;
    for (const [group, list] of groups) {
      for (const r of list) {
        const parts = state.caseCache.get(r.url);
        if (!parts) continue;
        searched++;
        const page = pagePath(r.url);
        const mine = new Map<string, CaseItem>();
        for (const u of parts) {
          const reasons = caseReasons(u, mode, screen, skipAcronyms);
          if (!reasons.length) continue;
          const key = [u.comp.name, u.t, reasons.map((x) => (x.kind === "styled" ? x.why : x.runs.join(","))).join("|")].join("\u0001");
          if (u.comp.global) {
            const e = shared.get(key) ?? { u, reasons, count: 1, pages: [] };
            if (!e.pages.includes(page)) e.pages.push(page);
            shared.set(key, e);
          } else {
            const e = mine.get(key) ?? { u, reasons, count: 0 };
            e.count++;
            mine.set(key, e);
          }
        }
        if (!mine.size) continue;
        const items = [...mine.values()];
        typedN += items.filter((x) => x.reasons.some((y) => y.kind === "typed")).length;
        cards.push({ group, row: r, items });
        report.push(`\n${r.label} (${r.url})`, ...items.map(line));
      }
    }
    const sharedItems = [...shared.values()];
    typedN += sharedItems.filter((x) => x.reasons.some((y) => y.kind === "typed")).length;
    if (sharedItems.length) report.unshift("Site-wide (header, side menu, footer, popups)", ...sharedItems.map(line));
    const total = sharedItems.length + cards.reduce((n, c) => n + c.items.length, 0);
    const what = CASE_LABEL[mode];
    const screenName = screen === "d" ? "desktop" : "mobile";
    return {
      sharedItems,
      cards,
      total,
      searched,
      typedN,
      what,
      screenName,
      report: total ? `Text in ${what} (${screenName}) — ${total} found on ${searched} pages scanned\n${report.join("\n")}` : "",
    };
  }, [groups, state.caseCache, mode, screen, skipAcronyms]);

  const job = state.caseJob;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value as CaseMode)} className={selectClass} aria-label="Case">
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="capitalize">Capitalized (Each Word)</option>
          <option value="small-caps">Small caps</option>
          <option value="any">Any case change</option>
        </select>
        <select value={screen} onChange={(e) => setScreen(e.target.value as Screen)} className={selectClass} aria-label="Screen">
          <option value="d">Desktop (1440px)</option>
          <option value="m">Mobile (390px)</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm" title="Ignores LLC, MLS, DRE and other short acronyms">
          <input type="checkbox" checked={skipAcronyms} onChange={(e) => setSkipAcronyms(e.target.checked)} /> Skip short acronyms
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={withDetail}
            onChange={(e) => {
              setWithDetail(e.target.checked);
              detail.reset();
            }}
          />
          Neighborhood &amp; agent pages
        </label>
        <span className="ml-auto">
          <ReportButton text={result.report} />
        </span>
      </div>
      {detail.loading && <DetailLoader state={state} onSkip={detail.skip} />}
      {job && (
        <Loader
          message={`Reading page styles ${job.done} of ${job.total}…`}
          done={job.done}
          total={job.total}
          started={started}
          notes={["only the first time"]}
          onCancel={() => store.cancelCase()}
        />
      )}
      <Summary>
        {!state.rows.length ? (
          "Run the audit first."
        ) : result.total ? (
          <>
            <b>{result.total}</b> {result.total === 1 ? "text shows" : "texts show"} in {result.what} on {result.screenName}: {plural(result.cards.length, "page")}
            {result.sharedItems.length ? ` + ${result.sharedItems.length} site-wide` : ""}
            {result.typedN ? (
              <>
                {" "}
                · <b>{result.typedN}</b> typed in capitals (need retyping)
              </>
            ) : (
              ""
            )}{" "}
            · {result.searched} pages scanned
          </>
        ) : job ? (
          ""
        ) : (
          `Nothing shows in ${result.what} on ${result.screenName} across the ${result.searched} pages scanned.`
        )}
      </Summary>
      <p className="text-xs text-zinc-500">
        Styled means the CSS makes it that case (the exact rule is shown). Typed means the words are written in capitals and need retyping. Text in images or added by
        scripts can&apos;t be checked.
      </p>
      {result.sharedItems.length > 0 && (
        <ResultCard
          title="Site-wide"
          sub="header · side menu · footer · popups"
          tone="shared"
          noun="texts"
          tags={<Tag>{plural(result.sharedItems.length, "text")}</Tag>}
          items={result.sharedItems.map((x, i) => <CaseLine key={i} x={x} />)}
        />
      )}
      {result.cards.map((c, i) => (
        <div key={c.row.url} className="flex flex-col gap-2">
          {c.group && c.group !== result.cards[i - 1]?.group && <h3 className="mt-2 text-sm font-semibold">{c.group} pages</h3>}
          <ResultCard
            title={c.row.label}
            sub={pagePath(c.row.url)}
            url={c.row.url}
            onJump={onJump}
            noun="texts"
            tags={
              <>
                <Tag>{plural(c.items.length, "text")}</Tag>
                {c.items.some((x) => x.reasons.some((r) => r.kind === "typed")) && (
                  <Tag className={warnBadge}>{c.items.filter((x) => x.reasons.some((r) => r.kind === "typed")).length} typed</Tag>
                )}
              </>
            }
            items={c.items.map((x, k) => <CaseLine key={k} x={x} />)}
          />
        </div>
      ))}
    </div>
  );
}

// ================= Spelling =================

const IGNORE_KEY = "audit:spellIgnore";
function loadIgnored(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

type SpellItem = { where: string; text: string; path: string; comp: Comp | null; seo?: boolean; m: SpellHit; pages?: string[] };

function SpellSnippet({ text, m }: { text: string; m: SpellHit }) {
  const a = Math.max(0, m.offset - 50);
  const b = Math.min(text.length, m.offset + m.length + 50);
  return (
    <>
      {a ? "…" : ""}
      {text.slice(a, m.offset)}
      <mark className="rounded-sm bg-red-200 text-inherit underline decoration-red-500 decoration-wavy dark:bg-red-500/30">{text.substr(m.offset, m.length)}</mark>
      {text.slice(m.offset + m.length, b)}
      {b < text.length ? "…" : ""}
    </>
  );
}

export function SpellingView({ store, state, onJump }: JumpProps) {
  const [skipNames, setSkipNames] = useState(true);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [editIgnored, setEditIgnored] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setIgnored(loadIgnored()), []);
  const saveIgnored = (next: Set<string>) => {
    setIgnored(next);
    try {
      localStorage.setItem(IGNORE_KEY, JSON.stringify([...next]));
    } catch {
      // storage blocked: kept until the page closes
    }
  };
  const lang = state.spellLang;

  const result = useMemo(() => {
    const pieces = store.spellPieces();
    // A flagged word to skip: ignored, names/places (capitalized mid-sentence), acronyms, emails, URLs, words with digits.
    const skipWord = (word: string, text: string, offset: number) => {
      const w = word.trim();
      if (!w || ignored.has(w.toLowerCase())) return true;
      if (/\d|@|\.\w|^www/i.test(w) || /^[A-Z0-9&]{2,}$/.test(w)) return true;
      if (skipNames && /^[A-Z]/.test(w)) {
        const before = text.slice(0, offset).trimEnd();
        if (before && !/[.!?:]$/.test(before)) return true;
      }
      return false;
    };
    const unchecked = pieces.filter((p) => !state.spellCache.has(spellKey(lang, p.text))).length;
    const shared = new Map<string, SpellItem & { pages: string[] }>();
    const byPage = new Map<Row, SpellItem[]>();
    for (const p of pieces) {
      const ms = state.spellCache.get(spellKey(lang, p.text));
      if (!ms) continue;
      for (const m of ms) {
        if (skipWord(m.word, p.text, m.offset)) continue;
        const h: SpellItem = { where: p.where, text: p.text, path: p.path, comp: p.comp, seo: p.seo, m };
        if (p.comp?.global) {
          const key = [p.comp.name, p.where, p.path, p.text, m.offset].join("\u0001");
          const s = shared.get(key) ?? { ...h, pages: [] };
          s.pages.push(pagePath(p.r.url));
          shared.set(key, s);
        } else {
          const list = byPage.get(p.r) ?? [];
          list.push(h);
          byPage.set(p.r, list);
        }
      }
    }
    const line = (h: SpellItem) => `  - "${h.m.word}"${h.m.sugs.length ? ` → ${h.m.sugs.join(" / ")}` : ""}  (${compText(h.comp)}${h.where}${h.seo ? " [SEO]" : ""})`;
    const sharedHits = [...shared.values()];
    const pages = [...byPage].map(([row, hits]) => ({ row, hits: hits.sort((a, b) => Number(!!b.seo) - Number(!!a.seo)) }));
    const all = [...sharedHits, ...pages.flatMap((p) => p.hits)];
    const words = new Set(all.map((h) => h.m.word.toLowerCase())).size;
    const report = [...(sharedHits.length ? ["Site-wide", ...sharedHits.map(line)] : []), ...pages.flatMap((p) => [`\n${p.row.label} (${p.row.url})`, ...p.hits.map(line)])];
    return { pieces: pieces.length, unchecked, sharedHits, pages, total: all.length, words, report: report.length ? `Spelling (${lang})\n${report.join("\n")}` : "" };
    // The store's helpers read state.rows and state.groups, so results update when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, state.spellCache, state.rows, state.groups, lang, ignored, skipNames]);

  const job = state.spellJob;
  const now = useNow(!!job);
  const jobMessage = job
    ? {
        preparing: "Preparing text…",
        sending: `Sending batch ${job.batch} of ${job.batches}${job.kb ? ` (${job.kb} KB)` : ""} to LanguageTool…`,
        waiting: `Waiting for the free limit (about 75 KB of text per minute): resuming in ${Math.max(0, Math.ceil((job.until - now) / 1000))}s`,
        ratelimited: `LanguageTool asked us to slow down: retrying in ${Math.max(0, Math.ceil((job.until - now) / 1000))}s`,
        retrying: `No reply in time: retrying batch ${job.batch}…`,
        cancelling: "Cancelling…",
        "done-batch": `Batch ${job.batch} of ${job.batches} done…`,
      }[job.state]
    : "";
  const waitingOnServer = job?.state === "sending" && job.sentAt ? Math.round((now - job.sentAt) / 1000) : 0;

  const wordChips = (hits: SpellItem[]) => {
    const words = [...new Set(hits.map((h) => h.m.word))];
    return (
      <>
        {words.slice(0, 8).map((w) => (
          <Tag key={w} className={badBadge}>
            {w}
          </Tag>
        ))}
        {words.length > 8 && <Tag>+{words.length - 8}</Tag>}
      </>
    );
  };
  const item = (h: SpellItem, i: number) => (
    <div key={i}>
      <CompLabel comp={h.comp} />
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{h.where}</span>
      {h.path && (
        <>
          {" in "}
          <Code title={h.path}>{h.path}</Code>
        </>
      )}
      {h.pages && (
        <span className="ml-1 text-xs text-zinc-500" title={h.pages.join("\n")}>
          same on {plural(h.pages.length, "page")}
        </span>
      )}
      <button type="button" onClick={() => saveIgnored(new Set(ignored).add(h.m.word.toLowerCase()))} className="ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400" title="Not a mistake: ignore this word everywhere">
        Ignore “{h.m.word}”
      </button>
      {h.m.sugs.length > 0 && <span className="ml-2 text-xs text-zinc-500">→ {h.m.sugs.join(", ")}</span>}
      <div className="mt-0.5">
        <SpellSnippet text={h.text} m={h.m} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallButton} disabled={!!job || !state.rows.length} onClick={() => store.runSpellCheck()}>
          {job ? "Checking…" : "Check spelling"}
        </button>
        <select value={lang} onChange={(e) => store.setSpellLang(e.target.value as SpellLang)} className={selectClass} aria-label="Language">
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="en-CA">English (Canada)</option>
          <option value="en-AU">English (Australia)</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm" title="Skips capitalized words in mid-sentence (names and places)">
          <input type="checkbox" checked={skipNames} onChange={(e) => setSkipNames(e.target.checked)} /> Skip names
        </label>
        <button type="button" className={smallButton} disabled={!ignored.size} onClick={() => setEditIgnored(!editIgnored)}>
          Ignored words ({ignored.size})
        </button>
        <span className="ml-auto">
          <ReportButton text={result.report} />
        </span>
      </div>
      {editIgnored && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <span className="text-sm">Ignored words. Remove a word to check it again.</span>
          <div className="flex flex-wrap gap-1.5">
            {[...ignored].sort().map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  const next = new Set(ignored);
                  next.delete(w);
                  saveIgnored(next);
                }}
                className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs hover:border-red-400 hover:text-red-600 dark:border-zinc-700"
                title="Check this word again"
              >
                {w} ✕
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        Runs with every audit. The visible text and SEO titles/descriptions are sent to LanguageTool (free, spelling rules only), in batches that stay under its free limits.
      </p>
      {job && (
        <Loader
          message={jobMessage}
          done={Math.max(0, job.batch - 1) + (job.state === "done-batch" ? 1 : 0)}
          total={job.batches || undefined}
          started={job.started}
          slow={waitingOnServer >= 20}
          notes={[
            job.batches ? `${Math.max(0, job.batch - 1)} of ${job.batches} batches done` : "",
            job.lastReply ? `last reply ${Math.round((now - job.lastReply) / 1000)}s ago` : "no reply yet",
            waitingOnServer >= 10 ? `waiting ${waitingOnServer}s for this batch (gives up at 45s)` : "",
          ]}
          onCancel={() => store.cancelSpell()}
        />
      )}
      {state.spellMessage && <p className="text-sm text-red-600 dark:text-red-400">{state.spellMessage}</p>}
      <Summary>
        {!result.pieces ? (
          "Run the audit first."
        ) : result.total ? (
          <>
            <b>{result.words}</b> possible {result.words === 1 ? "misspelling" : "misspellings"} in {plural(result.total, "place")}: {result.sharedHits.length} site-wide ·{" "}
            {plural(result.pages.length, "page")}
          </>
        ) : result.unchecked === result.pieces ? (
          job ? (
            "Results appear below as each batch finishes."
          ) : (
            "Press Check spelling to check every audited page."
          )
        ) : (
          "✓ No spelling mistakes found."
        )}
        {result.unchecked > 0 && result.unchecked < result.pieces ? ` · ${result.unchecked} text pieces not checked yet` : ""}
      </Summary>
      {result.sharedHits.length > 0 && (
        <ResultCard title="Site-wide (same on every page)" sub="header · side menu · footer · popups" tone="shared" tags={wordChips(result.sharedHits)} items={result.sharedHits.map(item)} />
      )}
      {result.pages.map((p) => (
        <ResultCard key={p.row.url} title={p.row.label} sub={pagePath(p.row.url)} url={p.row.url} onJump={onJump} tags={wordChips(p.hits)} items={p.hits.map(item)} />
      ))}
    </div>
  );
}
