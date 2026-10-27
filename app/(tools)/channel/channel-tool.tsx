"use client";

import { useMemo, useRef, useState } from "react";
import CopyButton from "@/components/copy-button";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import type { ChannelResponse } from "@/app/api/channel/route";
import type { ChannelSearchResponse } from "@/app/api/channel/search/route";
import { parseYouTubeVideoId } from "@/lib/parse-links";
import {
  autoplayUrl,
  safeFileName,
  thumbnailDownloadUrl,
  titleMatcher,
  watchUrl,
  type ChannelVideo,
  type VideoPage,
} from "@/lib/youtube";

type Tab = "long" | "shorts";
type Sort = "newest" | "oldest" | "title";

const TABS: { id: Tab; label: string }[] = [
  { id: "long", label: "Long videos" },
  { id: "shorts", label: "Shorts" },
];

type ChannelSearch = {
  query: string;
  status: "searching" | "done" | "error";
  matches: ChannelVideo[];
  nextPageToken: string | null;
  scanned: number;
  total: number;
  error?: string;
};

const secondaryButtonClass =
  "rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${path}?${new URLSearchParams(params)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

function mergeVideos(prev: ChannelVideo[], next: ChannelVideo[]) {
  const seen = new Set(prev.map((v) => v.id));
  return [...prev, ...next.filter((v) => !seen.has(v.id))];
}

function sortVideos(videos: ChannelVideo[], sort: Sort) {
  if (sort === "title") return [...videos].sort((a, b) => a.title.localeCompare(b.title));
  // Playlists are already newest first; dates only refine that order.
  const time = (v: ChannelVideo) => (v.publishedAt ? Date.parse(v.publishedAt) : 0);
  const sorted = [...videos].sort((a, b) => time(b) - time(a));
  return sort === "oldest" ? sorted.reverse() : sorted;
}

/** Fetches every thumbnail and saves them as one ZIP, each named after its video title. */
async function downloadThumbnailsZip(
  videos: ChannelVideo[],
  zipName: string,
  onProgress: (done: number) => void,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  let failed = 0;
  let done = 0;
  const queue = [...videos];
  // A few at a time keeps the server and browser responsive on big lists.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let v = queue.shift(); v; v = queue.shift()) {
        try {
          const res = await fetch(thumbnailDownloadUrl(v.id, v.title));
          if (!res.ok) throw new Error();
          let name = safeFileName(v.title, v.id);
          if (used.has(name.toLowerCase())) name = `${name} (${v.id})`;
          used.add(name.toLowerCase());
          zip.file(`${name}.jpg`, await res.blob());
        } catch {
          failed++;
        }
        onProgress(++done);
      }
    }),
  );
  if (failed === videos.length) throw new Error("No thumbnails could be downloaded.");
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${safeFileName(zipName, "thumbnails")}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return failed;
}

export default function ChannelTool() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Omit<ChannelResponse, "long" | "shorts"> | null>(null);
  const [pages, setPages] = useState<Record<Tab, VideoPage> | null>(null);
  const [tab, setTab] = useState<Tab>("long");
  const [sort, setSort] = useState<Sort>("newest");
  const [loading, setLoading] = useState<"channel" | Tab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState<ChannelSearch | null>(null);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  // Bumped on each new channel so responses for an old one are ignored.
  const generation = useRef(0);

  async function loadChannel(e: React.FormEvent) {
    e.preventDefault();
    const gen = ++generation.current;
    setError(null);
    setData(null);
    setPages(null);
    setFilter("");
    setSearch(null);
    setLoading("channel");
    try {
      const { long, shorts, ...rest } = await getJson<ChannelResponse>("/api/channel", { q: query });
      if (gen !== generation.current) return;
      setData(rest);
      setPages({ long, shorts });
      setTab(long.total === 0 && shorts.total > 0 ? "shorts" : "long");
    } catch (err) {
      if (gen === generation.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === generation.current) setLoading(null);
    }
  }

  async function loadMore(which: Tab) {
    const pageToken = pages?.[which].nextPageToken;
    if (!data || !pageToken) return;
    const gen = generation.current;
    setError(null);
    setLoading(which);
    try {
      const page = await getJson<VideoPage>("/api/channel", {
        playlistId: data.playlists[which],
        pageToken,
      });
      if (gen !== generation.current) return;
      setPages((p) =>
        p && {
          ...p,
          [which]: { ...page, videos: mergeVideos(p[which].videos, page.videos) },
        },
      );
    } catch (err) {
      if (gen === generation.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === generation.current) setLoading(null);
    }
  }

  async function searchChannel(q: string, resume?: ChannelSearch) {
    if (!data) return;
    const gen = generation.current;
    setSearch({
      query: q,
      status: "searching",
      matches: resume?.matches ?? [],
      nextPageToken: resume?.nextPageToken ?? null,
      scanned: resume?.scanned ?? 0,
      total: resume?.total ?? 0,
    });
    try {
      const res = await getJson<ChannelSearchResponse>("/api/channel/search", {
        playlistId: data.playlists.uploads,
        q,
        ...(resume?.nextPageToken ? { pageToken: resume.nextPageToken } : {}),
      });
      if (gen !== generation.current) return;
      setSearch({
        query: q,
        status: "done",
        matches: mergeVideos(resume?.matches ?? [], res.matches),
        nextPageToken: res.nextPageToken,
        scanned: (resume?.scanned ?? 0) + res.scanned,
        total: res.total,
      });
    } catch (err) {
      if (gen !== generation.current) return;
      setSearch((s) =>
        s && { ...s, status: "error", error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  const matcher = useMemo(
    () => (filter.trim() ? titleMatcher(filter, parseYouTubeVideoId(filter)) : null),
    [filter],
  );
  const loaded = pages?.[tab].videos ?? [];
  const visible = sortVideos(matcher ? loaded.filter(matcher) : loaded, sort);
  const otherTab: Tab = tab === "long" ? "shorts" : "long";
  const otherMatches = matcher && pages ? pages[otherTab].videos.filter(matcher).length : 0;

  async function saveAllThumbnails() {
    setError(null);
    setZipStatus(`Downloading 0 of ${visible.length}…`);
    try {
      const failed = await downloadThumbnailsZip(visible, `${data?.channel.title ?? "channel"} thumbnails`, (n) =>
        setZipStatus(`Downloading ${n} of ${visible.length}…`),
      );
      if (failed) setError(`${failed} thumbnail${failed === 1 ? "" : "s"} couldn't be downloaded and ${failed === 1 ? "was" : "were"} left out.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setZipStatus(null);
    }
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = filter.trim();
    if (!q) return;
    // Only go to the API when nothing already loaded matches.
    if (visible.length === 0 && otherMatches === 0) searchChannel(q);
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form onSubmit={loadChannel} className="flex max-w-3xl flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="https://www.youtube.com/@handle or @handle"
          aria-label="Channel link or handle"
          className={inputClass}
        />
        <button type="submit" disabled={!!loading || !query.trim()} className={primaryButtonClass}>
          {loading === "channel" ? "Loading…" : "Get videos"}
        </button>
      </form>

      {error && <p className={`${errorClass} max-w-3xl`}>{error}</p>}

      {data && pages && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {data.channel.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element -- external avatar
              <img src={data.channel.thumbnail} alt="" className="h-10 w-10 rounded-full" />
            )}
            <a
              href={`https://www.youtube.com/channel/${data.channel.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mr-auto font-medium hover:underline"
            >
              {data.channel.title}
            </a>
          </div>

          <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
            <div role="tablist" className="-mb-px flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "border-blue-600 text-foreground"
                      : "border-transparent text-zinc-500 hover:text-foreground"
                  }`}
                >
                  {t.label}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    {pages[t.id].videos.length.toLocaleString()} /{" "}
                    {pages[t.id].total.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-2">
              <form onSubmit={onSearchSubmit} className="flex gap-2">
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setSearch(null);
                  }}
                  placeholder="Search videos by title or link"
                  aria-label="Search videos"
                  className={`${inputClass} w-56 py-1.5`}
                />
                <button type="submit" disabled={!filter.trim()} className={`${secondaryButtonClass} py-1.5`}>
                  Search
                </button>
              </form>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                aria-label="Sort"
                className="rounded-lg border border-zinc-300 bg-background px-2 py-1.5 text-sm dark:border-zinc-700"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          </div>

          {matcher && (
            <SearchSummary
              shown={visible.length}
              loaded={loaded.length}
              otherMatches={otherMatches}
              otherLabel={TABS.find((t) => t.id === otherTab)!.label}
              onSwitch={() => setTab(otherTab)}
              onSearchChannel={() => searchChannel(filter.trim())}
              searching={search?.status === "searching"}
            />
          )}

          {search && <ChannelSearchResults search={search} onContinue={() => searchChannel(search.query, search)} />}

          {visible.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {zipStatus && <span className="text-xs text-zinc-500">{zipStatus}</span>}
                <button
                  type="button"
                  onClick={saveAllThumbnails}
                  disabled={!!zipStatus}
                  className={`${secondaryButtonClass} px-3 py-1.5 text-xs`}
                >
                  Download {visible.length} thumbnails (ZIP)
                </button>
                <CopyButton
                  text={visible.map((v) => watchUrl(v.id)).join("\n")}
                  label={`Copy ${visible.length} links`}
                />
              </div>
              <VideoGrid videos={visible} vertical={tab === "shorts"} />
            </>
          ) : (
            !matcher && (
              <p className="text-sm text-zinc-500">
                No {tab === "shorts" ? "Shorts" : "long videos"} on this channel.
              </p>
            )
          )}

          {pages[tab].nextPageToken && (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => loadMore(tab)}
                disabled={!!loading}
                className={primaryButtonClass}
              >
                {loading === tab ? "Loading…" : "Load 50 more"}
              </button>
              <p className="text-xs text-zinc-500">
                {(pages[tab].total - loaded.length).toLocaleString()} not loaded yet
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SearchSummary({
  shown,
  loaded,
  otherMatches,
  otherLabel,
  onSwitch,
  onSearchChannel,
  searching,
}: {
  shown: number;
  loaded: number;
  otherMatches: number;
  otherLabel: string;
  onSwitch: () => void;
  onSearchChannel: () => void;
  searching: boolean;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      <span>
        {shown} match{shown === 1 ? "" : "es"} in {loaded} loaded videos.
      </span>
      {otherMatches > 0 && (
        <button type="button" onClick={onSwitch} className="text-blue-600 hover:underline dark:text-blue-400">
          {otherMatches} in {otherLabel} →
        </button>
      )}
      <button
        type="button"
        onClick={onSearchChannel}
        disabled={searching}
        className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        Search the whole channel
      </button>
    </p>
  );
}

function ChannelSearchResults({
  search,
  onContinue,
}: {
  search: ChannelSearch;
  onContinue: () => void;
}) {
  const searching = search.status === "searching";
  const finished = !search.nextPageToken && search.status === "done";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Channel search for “{search.query}”
          <span className="ml-2 font-normal text-zinc-500">
            {searching
              ? `Scanning uploads… (${search.scanned.toLocaleString()} checked)`
              : `${search.matches.length} found · ${search.scanned.toLocaleString()} of ${search.total.toLocaleString()} uploads checked`}
          </span>
        </h2>
        {search.nextPageToken && !searching && (
          <button type="button" onClick={onContinue} className={`${secondaryButtonClass} py-1.5`}>
            Keep searching older videos
          </button>
        )}
      </div>

      {search.status === "error" && <p className={errorClass}>{search.error}</p>}
      {finished && search.matches.length === 0 && (
        <p className="text-sm text-zinc-500">No video on this channel has a title matching that.</p>
      )}
      {search.matches.length > 0 && <VideoGrid videos={search.matches} />}
    </section>
  );
}

function VideoGrid({ videos, vertical = false }: { videos: ChannelVideo[]; vertical?: boolean }) {
  return (
    <ul
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
        vertical ? "xl:grid-cols-5" : "xl:grid-cols-4"
      }`}
    >
      {videos.map((v) => (
        <li
          key={v.id}
          className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background dark:border-zinc-800"
        >
          <a href={watchUrl(v.id)} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- external thumbnail */}
            <img
              src={v.thumbnail}
              alt=""
              loading="lazy"
              className={`w-full bg-zinc-100 object-cover dark:bg-zinc-900 ${
                vertical ? "aspect-[9/16]" : "aspect-video"
              }`}
            />
          </a>
          <div className="flex flex-1 flex-col gap-3 p-3">
            <div>
              <p className="line-clamp-2 text-sm font-medium" title={v.title}>
                {v.title}
              </p>
              {v.publishedAt && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {new Date(v.publishedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <CopyButton text={watchUrl(v.id)} label="Link" />
              <CopyButton text={v.title} label="Title" />
              <a
                href={thumbnailDownloadUrl(v.id, v.title)}
                download
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Thumbnail
              </a>
              {v.description && <CopyButton text={v.description} label="Description" />}
              <CopyButton text={autoplayUrl(v.id, true)} label="Autoplay (muted)" />
              <CopyButton text={autoplayUrl(v.id, false)} label="Autoplay (sound)" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
