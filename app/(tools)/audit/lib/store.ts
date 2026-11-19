// The Audit tool's state and background work, outside React: the audit itself,
// neighborhood/agent pages, dead-link checks and spelling. Views subscribe with
// useSyncExternalStore and read the latest snapshot.

import type { ElementMap } from "@/app/api/audit/elements/route";
import type { LinkCheck } from "@/app/api/audit/link/route";
import type { SpellMatch } from "@/app/api/audit/spell/route";
import { logError } from "@/lib/error-log";
import {
  CONCURRENCY,
  GROUP_PATH,
  auditPage,
  buildList,
  fetchPage,
  parseHtml,
  pathKey,
  pool,
  probeLink,
  readStartPage,
  sitemapDetailPaths,
  slugTitle,
  type PageLink,
  type Row,
  type StartPage,
} from "./audit";
import { collectCaseParts, type CasePart } from "./text-case";

export type GroupKey = "Neighborhood" | "Agent";
export const GROUP_KEYS: GroupKey[] = ["Neighborhood", "Agent"];
export const GROUP_LABEL: Record<GroupKey, string> = { Neighborhood: "Neighborhoods", Agent: "Agents" };

export type Group = { on: boolean; rows: Row[]; status: string | null; stamp: string };

export type LinkState = { state: "pending" | "ok" | "dead" | "warn"; code?: number; note?: string };
export type LinkJob = { done: number; total: number; started: number; lastAnswer: number; working: string[] };

export type SpellLang = "en-US" | "en-GB" | "en-CA" | "en-AU";
export type SpellHit = { offset: number; length: number; word: string; sugs: string[] };
export type SpellJob = {
  state: "preparing" | "sending" | "waiting" | "ratelimited" | "retrying" | "cancelling" | "done-batch";
  started: number;
  lastReply: number;
  batch: number;
  batches: number;
  kb: number;
  sentAt: number;
  until: number;
};

/** Background reading of neighborhood/agent pages for the searches, when those tabs are off. */
export type DetailRead = { state: "idle" | "loading" | "done"; done: number; total: number; rows: Record<GroupKey, Row[]> };

export type AuditState = {
  start: StartPage | null;
  busy: boolean;
  progress: { done: number; total: number } | null;
  error: string;
  rows: Row[];
  stamp: string;
  groups: Record<GroupKey, Group>;
  elMap: ElementMap | null;
  linkStatus: Map<string, LinkState>;
  linkJob: LinkJob | null;
  /** The last link check was cancelled before it finished. */
  linksStopped: boolean;
  spellLang: SpellLang;
  spellCache: Map<string, SpellHit[]>;
  spellJob: SpellJob | null;
  spellMessage: string;
  detail: DetailRead;
  /** Text case results per page URL. */
  caseCache: Map<string, CasePart[]>;
  caseJob: { done: number; total: number } | null;
};

const emptyGroup = (): Group => ({ on: false, rows: [], status: null, stamp: "" });
const timeStamp = () => `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const spellKey = (lang: string, text: string) => `${lang}\u0001${text}`;

/** Links in round-robin order by site, so a slow or rate-limited site doesn't hold up the others. */
function interleaveByHost(urls: string[]): string[] {
  const byHost = new Map<string, string[]>();
  for (const u of urls) {
    const host = new URL(u).host;
    byHost.set(host, [...(byHost.get(host) ?? []), u]);
  }
  const queues = [...byHost.values()];
  const out: string[] = [];
  for (let i = 0; out.length < urls.length; i++) for (const q of queues) if (i < q.length) out.push(q[i]);
  return out;
}

let elMapPromise: Promise<ElementMap | null> | null = null;
function loadElementMap() {
  elMapPromise ??= fetch("/api/audit/elements")
    .then((r) => (r.ok ? (r.json() as Promise<ElementMap>) : null))
    .catch(() => null);
  return elMapPromise;
}

export class AuditStore {
  private state: AuditState = {
    start: null,
    busy: false,
    progress: null,
    error: "",
    rows: [],
    stamp: "",
    groups: { Neighborhood: emptyGroup(), Agent: emptyGroup() },
    elMap: null,
    linkStatus: new Map(),
    linkJob: null,
    linksStopped: false,
    spellLang: "en-US",
    spellCache: new Map(),
    spellJob: null,
    spellMessage: "",
    detail: { state: "idle", done: 0, total: 0, rows: { Neighborhood: [], Agent: [] } },
    caseCache: new Map(),
    caseJob: null,
  };
  private listeners = new Set<() => void>();
  private runId = 0;
  private groupRun: Record<GroupKey, number> = { Neighborhood: 0, Agent: 0 };
  private detailPaths: Promise<Set<string>> | null = null;
  private detailPromise: Promise<void> | null = null;
  private linkRun = 0;
  private linkInFlight = new Map<string, Promise<void>>();
  private spellRunning = false;
  private spellCancelled = false;
  private spellAbort: AbortController | null = null;
  private ltWindow: [number, number][] = [];
  private caseRun = 0;
  private emitQueued = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<AuditState>) {
    this.state = { ...this.state, ...patch };
    // Many updates arrive at once while checking links; tell React once per frame.
    if (this.emitQueued) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      this.listeners.forEach((fn) => fn());
    });
  }
  private setGroup(key: GroupKey, patch: Partial<Group>) {
    this.set({ groups: { ...this.state.groups, [key]: { ...this.state.groups[key], ...patch } } });
  }

  // ---------- rows ----------

  /** Every audited page except the 404 test: main pages, then the neighborhood/agent tabs that are on. */
  allRows(): Row[] {
    const { rows, groups } = this.state;
    return [...rows, ...groups.Neighborhood.rows, ...groups.Agent.rows].filter((r) => !r.probe);
  }
  private probeTitle = () => this.state.rows.find((r) => r.probe)?.title;

  /** A group's pages for the searches: the open tab's pages, else the background copy. */
  groupRows(key: GroupKey, includeDetail: boolean): Row[] {
    const g = this.state.groups[key];
    if (g.on && g.rows.length) return g.rows;
    return includeDetail ? this.state.detail.rows[key] : [];
  }

  // ---------- the audit ----------

  async audit(pageUrl: string, full = true) {
    const id = ++this.runId;
    this.set({ busy: true, error: "", progress: null, rows: [] });
    if (full) {
      this.detailPaths = null;
      this.detailPromise = null;
      this.linkRun++;
      this.linkInFlight.clear();
      this.spellCancelled = true;
      this.spellAbort?.abort();
      this.caseRun++;
      this.set({
        linkStatus: new Map(),
        linkJob: null,
        linksStopped: false,
        detail: { state: "idle", done: 0, total: 0, rows: { Neighborhood: [], Agent: [] } },
        caseCache: new Map(),
        caseJob: null,
        spellMessage: "",
      });
      GROUP_KEYS.forEach((k) => {
        this.groupRun[k]++;
        this.setGroup(k, { rows: [], status: this.state.groups[k].on ? "Waiting for the main audit…" : null });
      });
    }
    try {
      const elMap = await loadElementMap();
      this.set({ elMap });
      const page = await fetchPage(pageUrl);
      if (id !== this.runId) return;
      const read = readStartPage(parseHtml(page.body), page.url);
      if ("error" in read) throw new Error(read.error);
      this.set({ start: read });
      const links = buildList(read);
      const total = links.length + 1;
      this.set({ progress: { done: 0, total } });
      // The 404 page first, so pages answering "200 OK" with it can be spotted.
      const probe = await auditPage(probeLink(read.origin), undefined, elMap);
      if (id !== this.runId) return;
      this.set({ progress: { done: 1, total } });
      const results = await pool(
        links,
        (link) => auditPage(link, probe.title, elMap),
        (done) => id === this.runId && this.set({ progress: { done: done + 1, total } }),
        () => id !== this.runId,
      );
      if (id !== this.runId) return;
      this.set({ rows: [...results, probe], stamp: timeStamp(), busy: false, progress: null });
      // Dead links and spelling run with every audit.
      void this.runLinkCheck();
      void this.runSpellCheck();
      if (full) GROUP_KEYS.forEach((k) => this.state.groups[k].on && void this.auditGroup(k));
    } catch (err) {
      if (id !== this.runId) return;
      const message = err instanceof Error ? err.message : String(err);
      logError("Audit", "Audit failed", `${pageUrl}: ${message}`);
      this.set({ error: message, busy: false, progress: null });
    }
  }

  private getDetailPaths(): Promise<Set<string>> {
    const { start, rows } = this.state;
    if (!start) return Promise.resolve(new Set());
    this.detailPaths ??= sitemapDetailPaths(start.origin).then((list) => {
      const found = new Set(list);
      rows.forEach((row) => row.detailLinks.forEach((p) => found.add(p)));
      return found;
    });
    return this.detailPaths;
  }

  private detailLinks(key: GroupKey, paths: Set<string>): PageLink[] {
    const { start, rows } = this.state;
    if (!start) return [];
    const audited = new Set(rows.map((r) => pathKey(new URL(r.url).pathname)));
    return [...paths].filter((p) => GROUP_PATH[key](p) && !audited.has(p)).map((p) => ({ href: start.origin + p, text: slugTitle(p), useH1: true, source: key }));
  }

  async auditGroup(key: GroupKey) {
    const id = ++this.groupRun[key];
    if (!this.state.start) return;
    this.setGroup(key, { rows: [], status: "Finding pages (sitemap + page links)…" });
    const list = this.detailLinks(key, await this.getDetailPaths());
    if (id !== this.groupRun[key]) return;
    if (!list.length) {
      this.setGroup(key, { status: `No ${key.toLowerCase()} pages found on this site (checked the sitemap and page links).`, stamp: timeStamp() });
      return;
    }
    const label = key.toLowerCase();
    this.setGroup(key, { status: `Auditing ${label} pages 0/${list.length}…` });
    const out = await pool(
      list,
      (link) => auditPage(link, this.probeTitle(), this.state.elMap),
      (done) => id === this.groupRun[key] && this.setGroup(key, { status: `Auditing ${label} pages ${done}/${list.length}…` }),
      () => id !== this.groupRun[key],
    );
    if (id !== this.groupRun[key]) return;
    out.sort((a, b) => a.label.localeCompare(b.label));
    this.setGroup(key, { rows: out, status: null, stamp: timeStamp() });
    // The new pages' links and spelling are checked too.
    void this.runLinkCheck();
    void this.runSpellCheck();
  }

  toggleGroup(key: GroupKey, on: boolean) {
    this.groupRun[key]++;
    this.setGroup(key, { on, rows: [], status: null });
    if (on) void this.auditGroup(key);
  }

  refreshGroup(key: GroupKey) {
    this.detailPaths = null; // read the sitemap again so new pages show up
    this.detailPromise = null;
    void this.auditGroup(key);
  }

  async rerunOne(row: Row) {
    const fresh = await auditPage(
      { href: row.url, text: row.label, source: row.source, probe: row.probe, useH1: row.source === "Neighborhood" || row.source === "Agent" },
      row.probe ? undefined : this.probeTitle(),
      this.state.elMap,
    );
    const swap = (list: Row[]) => list.map((r) => (r.url === row.url ? fresh : r));
    const { groups } = this.state;
    this.set({
      rows: swap(this.state.rows),
      groups: { Neighborhood: { ...groups.Neighborhood, rows: swap(groups.Neighborhood.rows) }, Agent: { ...groups.Agent, rows: swap(groups.Agent.rows) } },
    });
    this.state.caseCache.delete(row.url);
    void this.runLinkCheck();
    void this.runSpellCheck();
  }

  // ---------- neighborhood / agent pages for the searches ----------

  /** Reads the neighborhood and agent pages in the background (once), for searches that include them. */
  loadDetail(): Promise<void> {
    if (!this.state.start) return Promise.resolve();
    if (!this.detailPromise) {
      const run = this.runId;
      this.detailPromise = (async () => {
        this.set({ detail: { ...this.state.detail, state: "loading", done: 0, total: 0 } });
        const paths = await this.getDetailPaths();
        const todo: { key: GroupKey; link: PageLink }[] = [];
        const out: Record<GroupKey, Row[]> = { Neighborhood: [], Agent: [] };
        for (const key of GROUP_KEYS) {
          const g = this.state.groups[key];
          if (g.on && g.rows.length) continue; // that tab already has them
          this.detailLinks(key, paths).forEach((link) => todo.push({ key, link }));
        }
        this.set({ detail: { ...this.state.detail, total: todo.length } });
        const rows = await pool(
          todo,
          (t) => auditPage(t.link, this.probeTitle(), this.state.elMap),
          (done) => run === this.runId && this.set({ detail: { ...this.state.detail, done } }),
          () => run !== this.runId,
        );
        if (run !== this.runId) return;
        rows.forEach((r, i) => out[todo[i].key].push(r));
        GROUP_KEYS.forEach((k) => out[k].sort((a, b) => a.label.localeCompare(b.label)));
        this.set({ detail: { state: "done", done: todo.length, total: todo.length, rows: out } });
      })();
    }
    return this.detailPromise;
  }

  // ---------- dead links ----------

  // At most 2 checks at a time per site, and a site that answers "too many requests" (429) is
  // paused as a whole before it's asked again: the audit has just read many of its pages.
  private hostGates = new Map<string, { active: number; until: number }>();

  private async checkUrl(url: string): Promise<LinkState> {
    let check: LinkCheck;
    const host = new URL(url).host;
    const gate = this.hostGates.get(host) ?? { active: 0, until: 0 };
    this.hostGates.set(host, gate);
    for (let attempt = 0; ; attempt++) {
      while (gate.active >= 2 || Date.now() < gate.until) await sleep(250);
      gate.active++;
      try {
        const res = await fetch(`/api/audit/link?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        check = await res.json();
      } catch {
        return { state: "warn", code: 0, note: "could not check" };
      } finally {
        gate.active--;
      }
      if (check.status !== 429 || attempt >= 4) break;
      gate.until = Math.max(gate.until, Date.now() + Math.min(30, check.retryAfter ?? 5 * (attempt + 1)) * 1000);
    }
    if (check.error) return { state: "warn", code: 0, note: check.error === "timeout" ? "timed out" : check.error === "blocked" ? "not a public address" : "could not connect" };
    const c = check.status;
    if (c < 400) return { state: "ok", code: c };
    // Only a 404 is a dead link. Every other answer could be the site refusing an automatic
    // check (or a passing fault), so it is left for a person to confirm.
    if (c === 404) return { state: "dead", code: c, note: "not found" };
    if (c === 410) return { state: "warn", code: c, note: "the site says the page is gone; open it to confirm" };
    // Social networks refuse automated, logged-out requests even for pages that exist.
    const site = new URL(check.url || url).hostname.replace(/^www\./, "");
    if (/(^|\.)(linkedin|facebook|fb|instagram|twitter|x|tiktok|pinterest|youtube|threads)\.com$/.test(site)) {
      return { state: "warn", code: c, note: `${site.split(".")[0]} blocks automatic checks; open it to confirm` };
    }
    if (c >= 500 && c <= 599) return { state: "warn", code: c, note: "server error; open it to confirm" };
    if (c === 429) return { state: "warn", code: c, note: "the site kept saying too many requests; open it to confirm" };
    // 400, 401, 403, 429, 999 …: bot protection refuses automated requests even for pages that exist.
    return { state: "warn", code: c, note: c === 999 ? "request refused (code 999); open it to confirm" : "the site refused the automatic check; open it to confirm" };
  }

  /** Every link not checked yet, on all audited pages. */
  uncheckedLinks(): string[] {
    const status = this.state.linkStatus;
    return [...new Set(this.allRows().flatMap((r) => r.linkInv.links.map((l) => l.href)))].filter((u) => !status.has(u));
  }

  /** Checks every link not checked yet. `recheck` clears earlier answers and checks everything again. */
  async runLinkCheck(recheck = false) {
    if (!this.state.rows.length) return;
    if (recheck) {
      this.linkRun++;
      this.linkInFlight.clear();
      this.set({ linkStatus: new Map() });
    }
    const run = ++this.linkRun;
    const status = this.state.linkStatus;
    // Pages the audit already read answer for themselves.
    this.allRows().forEach((r) => {
      if (r.status) status.set(r.url, r.status < 400 ? { state: "ok", code: r.status } : r.status === 404 ? { state: "dead", code: 404, note: "not found" } : { state: "warn", code: r.status, note: "error; open it to confirm" });
    });
    const todo = interleaveByHost(
      [...new Set(this.allRows().flatMap((r) => r.linkInv.links.map((l) => l.href)))].filter((u) => {
        const s = status.get(u);
        return (!s || s.state === "pending") && !this.linkInFlight.has(u);
      }),
    );
    todo.forEach((u) => status.set(u, { state: "pending" }));
    // Links still being answered for an earlier check: this one waits for them too.
    const inherited = [...this.linkInFlight.keys()];
    const total = todo.length + inherited.length;
    if (!total) {
      this.set({ linkStatus: new Map(status), linkJob: null, linksStopped: false });
      return;
    }
    const job: LinkJob = { done: 0, total, started: Date.now(), lastAnswer: Date.now(), working: [...inherited] };
    this.set({ linkStatus: new Map(status), linkJob: { ...job }, linksStopped: false });
    const answered = (u: string) => {
      job.working = job.working.filter((w) => w !== u);
      job.done++;
      job.lastAnswer = Date.now();
      if (run === this.linkRun) this.set({ linkStatus: new Map(status), linkJob: { ...job } });
    };
    let i = 0;
    await Promise.all([
      ...inherited.map((u) => this.linkInFlight.get(u)?.then(() => answered(u))),
      ...Array.from({ length: 6 }, async () => {
        while (i < todo.length && run === this.linkRun) {
          const u = todo[i++];
          job.working.push(u);
          // The answer is kept even if this check is cancelled or replaced meanwhile.
          const p = this.checkUrl(u).then((st) => {
            status.set(u, st);
            this.linkInFlight.delete(u);
          });
          this.linkInFlight.set(u, p);
          await p;
          answered(u);
        }
      }),
    ]);
    if (run !== this.linkRun) return;
    this.set({ linkStatus: new Map(status), linkJob: null });
  }

  stopLinkCheck() {
    this.linkRun++;
    const status = new Map([...this.state.linkStatus].filter(([, s]) => s.state !== "pending"));
    this.set({ linkStatus: status, linkJob: null, linksStopped: true });
  }

  // ---------- spelling ----------

  /** The text pieces to check: titles, descriptions and visible text of every audited page. */
  spellPieces() {
    const out: { r: Row; where: string; text: string; path: string; comp: Row["visibleParts"][number]["comp"]; seo?: boolean }[] = [];
    for (const r of this.allRows()) {
      out.push({ r, where: "title", text: r.title, path: "head › title", comp: null, seo: true });
      out.push({ r, where: "description", text: r.description, path: 'head › meta[name="description"]', comp: null, seo: true });
      for (const p of r.visibleParts) out.push({ r, ...p });
    }
    return out.filter((p) => p.text && /[a-z]{3}/i.test(p.text));
  }

  setSpellLang(lang: SpellLang) {
    this.set({ spellLang: lang });
    void this.runSpellCheck();
  }

  private spellStatus(patch: Partial<SpellJob>) {
    if (this.state.spellJob) this.set({ spellJob: { ...this.state.spellJob, ...patch } });
  }

  private async ltBatch(texts: string[], lang: string, attempt = 1): Promise<void> {
    const SEP = "\n\n";
    let body = "";
    const starts: number[] = [];
    for (const t of texts) {
      starts.push(body.length);
      body += t + SEP;
    }
    const bytes = new Blob([body]).size;
    // Stay under ~18 requests and ~70 KB per rolling minute (LanguageTool's free limits).
    for (;;) {
      if (this.spellCancelled) throw new Error("cancelled");
      const now = Date.now();
      this.ltWindow = this.ltWindow.filter(([t]) => now - t < 60_000);
      const used = this.ltWindow.reduce((s, [, b]) => s + b, 0);
      if (this.ltWindow.length < 18 && used + bytes <= 70_000) break;
      this.spellStatus({ state: "waiting", until: this.ltWindow[0] ? this.ltWindow[0][0] + 60_000 : now + 3000 });
      await sleep(1000);
    }
    this.ltWindow.push([Date.now(), bytes]);
    this.spellStatus({ state: "sending", kb: Math.max(1, Math.round(bytes / 1024)), sentAt: Date.now() });
    const ctl = new AbortController();
    this.spellAbort = ctl;
    let res: Response;
    try {
      res = await fetch("/api/audit/spell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body, language: lang }),
        signal: ctl.signal,
      });
    } catch (err) {
      if (this.spellCancelled) throw new Error("cancelled");
      if (attempt < 2) {
        this.spellStatus({ state: "retrying" });
        return this.ltBatch(texts, lang, attempt + 1);
      }
      throw new Error(err instanceof Error ? err.message : "could not reach LanguageTool");
    } finally {
      this.spellAbort = null;
    }
    this.spellStatus({ lastReply: Date.now() });
    if (res.status === 429) {
      this.spellStatus({ state: "ratelimited", until: Date.now() + 20_000 });
      for (let i = 0; i < 20 && !this.spellCancelled; i++) await sleep(1000);
      return this.ltBatch(texts, lang, attempt);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 504 && attempt < 2) {
        this.spellStatus({ state: "retrying" });
        return this.ltBatch(texts, lang, attempt + 1);
      }
      throw new Error(data?.error ?? `HTTP ${res.status}`);
    }
    const perText: SpellHit[][] = texts.map(() => []);
    for (const m of (data?.matches ?? []) as SpellMatch[]) {
      let k = starts.length - 1;
      while (k > 0 && starts[k] > m.offset) k--;
      const off = m.offset - starts[k];
      perText[k].push({ offset: off, length: m.length, word: texts[k].substr(off, m.length), sugs: m.replacements });
    }
    texts.forEach((t, k) => this.state.spellCache.set(spellKey(lang, t), perText[k]));
    this.set({ spellCache: new Map(this.state.spellCache) });
    this.spellStatus({ state: "done-batch" });
  }

  /** Checks every text piece not checked yet in the current language. Runs with every audit. */
  async runSpellCheck() {
    if (this.spellRunning) {
      // Already running: pick up new pages once it finishes.
      this.spellAgain = true;
      return;
    }
    const lang = this.state.spellLang;
    const texts = [...new Set(this.spellPieces().map((p) => p.text))].filter((t) => !this.state.spellCache.has(spellKey(lang, t)));
    if (!texts.length) return;
    this.spellRunning = true;
    this.spellCancelled = false;
    this.spellAgain = false;
    const now = Date.now();
    this.set({ spellMessage: "", spellJob: { state: "preparing", started: now, lastReply: 0, batch: 0, batches: 0, kb: 0, sentAt: 0, until: 0 } });
    let failed = "";
    try {
      // Batches of up to ~15 KB.
      const batches: string[][] = [];
      let cur: string[] = [];
      let size = 0;
      for (const t of texts) {
        if (size + t.length > 15_000 && cur.length) {
          batches.push(cur);
          cur = [];
          size = 0;
        }
        cur.push(t);
        size += t.length + 2;
      }
      if (cur.length) batches.push(cur);
      this.spellStatus({ batches: batches.length });
      for (let b = 0; b < batches.length; b++) {
        if (this.spellCancelled) throw new Error("cancelled");
        this.spellStatus({ batch: b + 1 });
        await this.ltBatch(batches[b], lang);
      }
    } catch (err) {
      failed = err instanceof Error ? err.message : String(err);
    } finally {
      this.spellRunning = false;
    }
    if (failed === "cancelled") {
      this.set({ spellJob: null, spellMessage: this.spellAgain ? "" : "Cancelled. Press Check spelling to continue where it stopped." });
      // Cancelled by a new audit, whose pages are waiting to be checked.
      if (this.spellAgain) void this.runSpellCheck();
    } else if (failed) {
      logError("Audit", "Spelling check stopped", failed);
      this.set({ spellJob: null, spellMessage: `Spelling check stopped: ${failed}. Press Check spelling to continue where it stopped.` });
    } else {
      this.set({ spellJob: null });
      if (this.spellAgain) void this.runSpellCheck();
    }
  }
  private spellAgain = false;

  cancelSpell() {
    this.spellCancelled = true;
    this.spellAgain = false;
    this.spellAbort?.abort();
    this.spellStatus({ state: "cancelling" });
  }

  // ---------- text case ----------

  /** Reads page styles for Text case (only pages not read yet). */
  async loadCase(rows: Row[]) {
    const run = ++this.caseRun;
    const cache = this.state.caseCache;
    const todo = rows.filter((r) => !cache.has(r.url) && r.status !== null);
    if (!todo.length) return;
    this.set({ caseJob: { done: 0, total: todo.length } });
    let done = 0;
    let i = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (i < todo.length && run === this.caseRun) {
          const r = todo[i++];
          cache.set(r.url, await collectCaseParts(r.url, this.state.elMap));
          done++;
          if (run === this.caseRun) this.set({ caseJob: { done, total: todo.length }, caseCache: new Map(cache) });
        }
      }),
    );
    if (run === this.caseRun) this.set({ caseJob: null, caseCache: new Map(cache) });
  }

  cancelCase() {
    this.caseRun++;
    this.set({ caseJob: null });
  }
}

export { spellKey };
