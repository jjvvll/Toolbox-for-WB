"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AnimeResponse } from "@/app/api/anime/route";
import type { AnimeSuggestion } from "@/app/api/anime/suggest/route";

type Picture = AnimeResponse;

const HISTORY_LIMIT = 5;
const MIN_INTERVAL_MS = 10_000; // free APIs: never refresh faster than this
const INTERVALS = [
  { label: "Off", ms: 0 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
  { label: "1 min", ms: 60_000 },
  { label: "5 min", ms: 300_000 },
];
/** How much of the art shows through the veil on the right-hand side. */
const STRENGTHS = {
  subtle: { label: "Subtle", veil: 72, sharp: 0.55 },
  balanced: { label: "Balanced", veil: 45, sharp: 0.85 },
  bold: { label: "Bold", veil: 15, sharp: 1 },
} as const;
type Strength = keyof typeof STRENGTHS;

const KEYS = {
  interval: "anime:interval",
  saveTags: "anime:saveTags",
  tags: "anime:tags",
  strength: "anime:strength",
  panelOpen: "anime:panelOpen",
};

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; settings just won't persist.
  }
}

function downloadName(pic: Picture, blob: Blob): string {
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const id = pic.fullUrl.split("/").pop()?.split(".")[0]?.slice(-12) ?? Date.now().toString(36);
  const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return [slug(pic.source), pic.credit && slug(pic.credit), id].filter(Boolean).join("-") + `.${ext}`;
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  // Direct first (works when the host allows cross-origin downloads), then our relay.
  for (const src of [url, `/api/anime/download?url=${encodeURIComponent(url)}`]) {
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith("image/")) return blob;
      }
    } catch {
      // Blocked by CORS or the network; try the next option.
    }
  }
  return null;
}

/** Saves the full-size picture; falls back to opening it in a new tab. */
async function downloadPicture(pic: Picture): Promise<"saved" | "opened"> {
  const blob = await fetchImageBlob(pic.fullUrl);
  if (!blob) {
    window.open(pic.fullUrl, "_blank", "noopener,noreferrer");
    return "opened";
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = downloadName(pic, blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return "saved";
}

function DownloadButton({ picture, compact = false }: { picture: Picture; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "opened">("idle");

  useEffect(() => {
    if (state !== "saved" && state !== "opened") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function run() {
    setState("saving");
    setState(await downloadPicture(picture));
  }

  const label =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : state === "opened" ? "Opened in new tab" : "Download";

  if (compact) {
    return (
      <button
        type="button"
        onClick={run}
        disabled={state === "saving"}
        aria-label="Download this picture"
        title={state === "idle" ? "Download this picture" : label}
        className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-base shadow-lg transition hover:scale-105 disabled:opacity-60"
      >
        {state === "saving" ? <span className="animate-spin text-sm">◌</span> : state === "saved" ? "✓" : "⬇"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={state === "saving"}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      ⬇ {label}
    </button>
  );
}

/** Resolves once the image is downloaded and decoded, so swapping it in never shows a blank frame. */
function preload(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.decode().then(resolve, resolve);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = url;
  });
}

/**
 * Site-wide anime backdrop plus a floating controller. Mounted once in the root
 * layout, so the picture, history, and timer survive page navigation.
 */
export default function AnimeScene() {
  const [current, setCurrent] = useState<Picture | null>(null);
  // Kept underneath while the new picture fades in, so the backdrop never goes blank.
  const [underlay, setUnderlay] = useState<Picture | null>(null);
  const [history, setHistory] = useState<Picture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveTags, setSaveTags] = useState(() => load(KEYS.saveTags) === "1");
  const [keyword, setKeyword] = useState(() => (load(KEYS.saveTags) === "1" ? (load(KEYS.tags) ?? "") : ""));
  const [intervalMs, setIntervalMs] = useState(() => {
    const saved = load(KEYS.interval);
    return saved !== null && INTERVALS.some((o) => String(o.ms) === saved) ? Number(saved) : 30_000;
  });
  const [strength, setStrength] = useState<Strength>(() => {
    const saved = load(KEYS.strength);
    return saved && saved in STRENGTHS ? (saved as Strength) : "balanced";
  });
  const [panelOpen, setPanelOpen] = useState(() => load(KEYS.panelOpen) === "1");

  const [manualPause, setManualPause] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  // Bumped after every load attempt so the auto-refresh countdown restarts from then.
  const [cycle, setCycle] = useState(0);

  const busy = useRef(false);
  const keywordRef = useRef(keyword);
  const currentRef = useRef(current);
  useEffect(() => {
    keywordRef.current = keyword;
    currentRef.current = current;
  });

  const showPicture = useCallback((next: Picture, prev: Picture | null) => {
    setUnderlay(prev);
    setCurrent(next);
    currentRef.current = next;
  }, []);

  const fetchNext = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const q = keywordRef.current.trim();
      const res = await fetch(`/api/anime${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) throw new Error(body?.error ?? "Couldn't get a picture right now.");
      const pic = body as Picture;
      await preload(pic.url);
      const prev = currentRef.current;
      if (prev) setHistory((h) => [prev, ...h].slice(0, HISTORY_LIMIT));
      showPicture(pic, prev);
      setError(null);
    } catch (err) {
      // Keep showing the current picture; auto-refresh just waits for the next interval.
      setError(err instanceof Error ? err.message : "Couldn't get a picture right now.");
    } finally {
      busy.current = false;
      setLoading(false);
      setCycle((c) => c + 1);
    }
  }, [showPicture]);

  function goBack() {
    const [prev, ...rest] = history;
    if (!prev) return;
    setHistory(rest);
    showPicture(prev, current);
    setError(null);
    setCycle((c) => c + 1);
  }

  // First picture on mount.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetchNext();
  }, [fetchNext]);

  // Page Visibility: pause while the tab is hidden.
  useEffect(() => {
    const onChange = () => setTabHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const paused = manualPause || hovering || tabHidden;

  // Auto-refresh: one timeout per cycle; cleared on change or unmount.
  useEffect(() => {
    if (!intervalMs || paused) return;
    const t = setTimeout(() => void fetchNext(), Math.max(intervalMs, MIN_INTERVAL_MS));
    return () => clearTimeout(t);
  }, [intervalMs, paused, cycle, fetchNext]);

  function updateKeyword(value: string) {
    setKeyword(value);
    if (saveTags) store(KEYS.tags, value.trim() || null);
  }

  function toggleSaveTags(on: boolean) {
    setSaveTags(on);
    store(KEYS.saveTags, on ? "1" : null);
    store(KEYS.tags, on && keyword.trim() ? keyword.trim() : null);
  }

  function togglePanel() {
    setPanelOpen((o) => {
      store(KEYS.panelOpen, o ? null : "1");
      return !o;
    });
  }

  const pausedReason = manualPause
    ? "Paused"
    : hovering
      ? "Paused while hovering"
      : tabHidden
        ? "Paused (tab hidden)"
        : null;
  const s = STRENGTHS[strength];

  return (
    <>
      <Backdrop current={current} underlay={underlay} veil={s.veil} sharpOpacity={s.sharp} />

      <div
        className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {panelOpen && (
          <div
            id="anime-controller"
            role="region"
            aria-label="Background picture controls"
            className="glass-panel flex max-h-[calc(100vh-6rem)] w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-2xl p-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Background art <span aria-hidden>✨</span>
              </h2>
              <button
                type="button"
                onClick={togglePanel}
                aria-label="Close controls"
                className="rounded-md px-1.5 text-zinc-500 hover:bg-zinc-200/60 hover:text-foreground dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>

            {/* Preview of the current picture; hovering anywhere on the controller pauses auto-refresh. */}
            <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
              {current ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote image from a random API
                <img
                  key={current.url}
                  src={current.url}
                  alt={current.credit ? `Anime illustration by ${current.credit}` : "Anime illustration"}
                  className="anime-fade-in h-full w-full object-contain"
                />
              ) : loading ? (
                <div className="h-full w-full animate-pulse bg-zinc-200 dark:bg-zinc-800" aria-label="Loading picture" />
              ) : (
                <p className="px-4 text-center text-xs text-zinc-500">{error ?? "No picture yet."}</p>
              )}
              {current && intervalMs > 0 && (
                <button
                  type="button"
                  onClick={() => setManualPause((p) => !p)}
                  aria-label={manualPause ? "Resume auto-refresh" : "Pause auto-refresh"}
                  title={manualPause ? "Resume auto-refresh" : "Pause auto-refresh"}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-xs text-white backdrop-blur hover:bg-black/70"
                >
                  {manualPause ? "▶" : "❚❚"}
                </button>
              )}
              {loading && current && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                  Loading…
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void fetchNext()}
                disabled={loading}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Loading…" : "New picture"}
              </button>
              <button
                type="button"
                onClick={goBack}
                disabled={history.length === 0}
                title={`Previous picture (${history.length} saved)`}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                ← Back
              </button>
            </div>

            <KeywordBox value={keyword} onChange={updateKeyword} onSubmit={() => void fetchNext()} />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveTags}
                onChange={(e) => toggleSaveTags(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              Save tags
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Auto-refresh
                <select
                  value={intervalMs}
                  onChange={(e) => {
                    setIntervalMs(Number(e.target.value));
                    store(KEYS.interval, e.target.value);
                  }}
                  className="rounded-md border border-zinc-300 bg-background px-1.5 py-1 text-xs text-foreground dark:border-zinc-700"
                >
                  {INTERVALS.map((o) => (
                    <option key={o.ms} value={o.ms}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Backdrop
                <select
                  value={strength}
                  onChange={(e) => {
                    setStrength(e.target.value as Strength);
                    store(KEYS.strength, e.target.value);
                  }}
                  className="rounded-md border border-zinc-300 bg-background px-1.5 py-1 text-xs text-foreground dark:border-zinc-700"
                >
                  {Object.entries(STRENGTHS).map(([value, o]) => (
                    <option key={value} value={value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && current && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                {error}
              </p>
            )}

            {current && (
              <div className="flex items-center justify-between gap-2">
                <DownloadButton picture={current} />
                <a
                  href={current.fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open image ↗
                </a>
              </div>
            )}
            {pausedReason && intervalMs > 0 && <p className="text-xs text-zinc-500">{pausedReason}</p>}
          </div>
        )}

        <div className="flex items-center gap-2">
          {current && <Credit picture={current} />}
          {current && <DownloadButton picture={current} compact />}
          <button
            type="button"
            onClick={togglePanel}
            aria-expanded={panelOpen}
            aria-controls="anime-controller"
            aria-label={panelOpen ? "Hide background controls" : "Show background controls"}
            title="Background art controls"
            className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-lg shadow-lg transition hover:scale-105"
          >
            {loading ? <span className="animate-spin text-sm">◌</span> : <span aria-hidden>✨</span>}
          </button>
        </div>
      </div>
    </>
  );
}

/** Fixed, full-viewport art behind every page, veiled so text stays readable. */
function Backdrop({
  current,
  underlay,
  veil,
  sharpOpacity,
}: {
  current: Picture | null;
  underlay: Picture | null;
  veil: number;
  sharpOpacity: number;
}) {
  const layer = (pic: Picture, top: boolean) => (
    <div key={`${pic.url}-${top}`} className={`absolute inset-0 ${top ? "anime-fade-in" : ""}`}>
      {/* Soft, blurred fill for the whole viewport. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative remote image */}
      <img src={pic.url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl saturate-150" />
      {/* The picture, sharp, filling the right half; edges fade out (see .anime-sharp). */}
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative remote image */}
      <img
        src={pic.url}
        alt=""
        style={{ opacity: sharpOpacity }}
        className="anime-sharp absolute inset-y-0 right-0 hidden h-full w-[50vw] object-cover object-[50%_20%] md:block"
      />
    </div>
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {underlay && layer(underlay, false)}
      {current && layer(current, true)}
      {/* Veil: strong on the left (content side), lighter on the right so the art shows. */}
      <div
        className="anime-veil absolute inset-0"
        style={{ "--veil-right": `${veil}%` } as React.CSSProperties}
      />
    </div>
  );
}

function Credit({ picture }: { picture: Picture }) {
  return (
    <p className="glass-panel hidden max-w-[16rem] truncate rounded-full px-3 py-1.5 text-[11px] text-zinc-600 shadow-sm sm:block dark:text-zinc-400">
      <a href={picture.link} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
        {picture.source}
      </a>
      {picture.credit && (
        <>
          {" · "}
          {picture.artistUrl ? (
            <a href={picture.artistUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
              {picture.credit}
            </a>
          ) : (
            picture.credit
          )}
        </>
      )}
    </p>
  );
}

function KeywordBox({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [suggestions, setSuggestions] = useState<AnimeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  // The last comma-separated part is what's being typed.
  const parts = value.split(",");
  const term = parts[parts.length - 1].trim();

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/anime/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((list: AnimeSuggestion[]) => {
          setSuggestions(list);
          setActive(-1);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  const visible = open && term.length >= 2 ? suggestions : [];

  function choose(s: AnimeSuggestion) {
    onChange([...parts.slice(0, -1).map((p) => p.trim()), s.value].filter(Boolean).join(", "));
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-zinc-500">Series or character (optional)</label>
      <input
        type="text"
        role="combobox"
        aria-expanded={visible.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && visible.length) {
            e.preventDefault();
            setActive((a) => (a + 1) % visible.length);
          } else if (e.key === "ArrowUp" && visible.length) {
            e.preventDefault();
            setActive((a) => (a - 1 + visible.length) % visible.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0 && visible[active]) choose(visible[active]);
            else {
              setOpen(false);
              onSubmit();
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="e.g. frieren, hatsune_miku"
        className="w-full rounded-lg border border-zinc-300 bg-background px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
      />
      <p className="mt-1 text-[11px] text-zinc-400">Empty = random. Separate several with commas.</p>
      {visible.length > 0 && (
        // Opens upward: the controller sits at the bottom of the screen.
        <ul
          id={listId}
          role="listbox"
          className="absolute bottom-full z-20 mb-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-background py-1 shadow-lg dark:border-zinc-800"
        >
          {visible.map((s, i) => (
            <li key={s.value} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-[11px] text-zinc-400">
                  {s.category} · {s.postCount.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
