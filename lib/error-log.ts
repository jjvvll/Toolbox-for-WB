// The app-wide error log: failures from every tool, kept in this browser until
// cleared. Repeats are grouped (count + first/last time), so one error firing 100
// times stays one line. API keys are removed before anything is stored.

export type LogEntry = {
  /** The tool it happened in, e.g. "Audit". */
  tool: string;
  kind: string;
  message: string;
  detail: string;
  count: number;
  first: number;
  last: number;
};

const KEY = "errorLog";
const SEEN_KEY = "errorLog:seen";
const MAX_ENTRIES = 500;
const MAX_TEXT = 3000;
/** Fired on window whenever the log changes, so the log page and badge can update. */
export const LOG_EVENT = "errorlog:change";

// Harmless browser notices, not failures.
const IGNORE = /^ResizeObserver loop|^Script error\.?$/;

/** API keys never go into the log, even if a message or URL contains one. */
export const redact = (s: unknown) =>
  String(s ?? "")
    .replace(/AIza[\w-]{20,}/g, "[key removed]")
    .replace(/sk-ant-[\w-]+/g, "[key removed]")
    .replace(/([?&](?:key|api_key|apikey|token)=)[^&\s"']+/gi, "$1[removed]")
    .replace(/("(?:key|apiKey|api_key)"\s*:\s*")[^"]*"/gi, '$1[removed]"')
    .slice(0, MAX_TEXT);

export function readLog(): LogEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLog(list: LogEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // storage full or blocked: a log that can't be written must never cause another error
  }
  window.dispatchEvent(new Event(LOG_EVENT));
}

let pending: LogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!pending.length) return;
  const list = readLog();
  for (const e of pending) {
    const same = list.find((x) => x.tool === e.tool && x.kind === e.kind && x.message === e.message);
    if (same) {
      same.count += e.count;
      same.last = e.last;
      same.detail = e.detail || same.detail;
    } else list.push(e);
  }
  pending = [];
  list.sort((a, b) => b.last - a.last);
  writeLog(list);
}

/** Adds an error to the log. `tool` is the tool's name as shown in the tabs. */
export function logError(tool: string, kind: string, message: unknown, detail: unknown = "") {
  if (typeof window === "undefined") return;
  const text = redact(message instanceof Error ? message.message || message.name : message);
  if (!text || IGNORE.test(text)) return;
  const now = Date.now();
  const twin = pending.find((e) => e.tool === tool && e.kind === kind && e.message === text);
  if (twin) {
    twin.count++;
    twin.last = now;
    return;
  }
  pending.push({ tool, kind, message: text, detail: redact(detail), count: 1, first: now, last: now });
  timer ??= setTimeout(flush, 100);
}

/** Set when the log is cleared, until the database copy has been cleared too (see the notes sync). */
export const LOG_CLEARED_KEY = "errorLog:clearedAt";
/** Which version of each entry the database has: key → its `last` time when saved there. */
export const LOG_SYNCED_KEY = "errorLog:synced";

export function clearLog() {
  pending = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LOG_SYNCED_KEY);
    localStorage.setItem(LOG_CLEARED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(LOG_EVENT));
}

/** When the log page was last opened; errors after that count as new. */
export function lastSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(LOG_EVENT));
}

export const newErrorCount = () => {
  const seen = lastSeen();
  return readLog().filter((e) => e.last > seen).length;
};

const stamp = (t: number) => new Date(t).toLocaleString();

export function logToText(list: LogEntry[]): string {
  const head = [`Toolbox error log: ${list.length} error${list.length === 1 ? "" : "s"}`, `Saved ${stamp(Date.now())} · ${navigator.userAgent}`];
  const body = list.map((e) =>
    [`[${stamp(e.last)}] ${e.tool} · ${e.kind}${e.count > 1 ? ` · ${e.count} times since ${stamp(e.first)}` : ""}`, e.message, e.detail].filter(Boolean).join("\n"),
  );
  return [head.join("\n"), ...body].join("\n\n");
}
