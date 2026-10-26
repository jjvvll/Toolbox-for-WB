"use client";

import { useState } from "react";
import CopyButton from "@/components/copy-button";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import type { VideoResponse } from "@/app/api/video/route";
import { parseYouTubeVideoId } from "@/lib/parse-links";
import { autoplayUrl, watchUrl } from "@/lib/youtube";

type Video = {
  id: string;
  title: string | null;
  description: string | null;
  /** Why the description couldn't be loaded, if it couldn't. */
  descriptionError: string | null;
  thumb: "maxresdefault" | "hqdefault";
};

// oEmbed allows cross-origin requests, so this runs in the browser.
async function fetchOEmbedTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`,
    );
    return res.ok ? ((await res.json()).title ?? null) : null;
  } catch {
    return null;
  }
}

export default function YouTubeTool() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVideo(null);

    const id = parseYouTubeVideoId(link);
    if (!id) {
      setError("That doesn't look like a YouTube video link.");
      return;
    }

    setLoading(true);
    // The description needs the Data API (server-side key); oEmbed only has the title.
    let title: string | null = null;
    let description: string | null = null;
    let descriptionError: string | null = null;
    try {
      const res = await fetch(`/api/video?id=${id}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      ({ title, description } = body as VideoResponse);
    } catch (err) {
      descriptionError = err instanceof Error ? err.message : String(err);
      title = await fetchOEmbedTitle(id);
    }
    setVideo({ id, title, description, descriptionError, thumb: "maxresdefault" });
    setLoading(false);
  }

  const fallBack = () =>
    setVideo((v) => (v && v.thumb !== "hqdefault" ? { ...v, thumb: "hqdefault" } : v));

  return (
    <div className="mt-8 flex max-w-3xl flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=… or youtu.be/… or /shorts/…"
          aria-label="YouTube link"
          className={inputClass}
        />
        <button type="submit" disabled={loading || !link.trim()} className={primaryButtonClass}>
          {loading ? "Loading…" : "Get video"}
        </button>
      </form>

      {error && <p className={errorClass}>{error}</p>}

      {video && (
        <article className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- external thumbnail with runtime fallback */}
          <img
            key={video.thumb}
            src={`https://i.ytimg.com/vi/${video.id}/${video.thumb}.jpg`}
            alt={video.title ?? "Video thumbnail"}
            className="aspect-video w-full bg-zinc-100 object-cover dark:bg-zinc-900"
            onError={fallBack}
            // A missing maxres image can still come back as a 120×90 placeholder.
            onLoad={(e) => e.currentTarget.naturalWidth <= 120 && fallBack()}
          />
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium">
                  {video.title ?? (
                    <span className="text-zinc-500">
                      Title unavailable (the video may be private or not embeddable)
                    </span>
                  )}
                </h2>
                <a
                  href={watchUrl(video.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {watchUrl(video.id)}
                </a>
              </div>
              {video.title && <CopyButton text={video.title} label="Copy title" className="shrink-0" />}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-500">
                  Description (hashtags removed)
                </p>
                {video.description && <CopyButton text={video.description} label="Copy description" />}
              </div>
              {video.description ? (
                <textarea
                  readOnly
                  value={video.description}
                  rows={6}
                  className={`${inputClass} resize-y`}
                />
              ) : (
                <p className="text-sm text-zinc-500">
                  {video.descriptionError
                    ? `Description unavailable: ${video.descriptionError}`
                    : "This video has no description."}
                </p>
              )}
            </div>

            <LinkRow label="Video link" value={watchUrl(video.id)} />
            <LinkRow label="Autoplay (muted)" value={autoplayUrl(video.id, true)} />
            <LinkRow label="Autoplay (with sound)" value={autoplayUrl(video.id, false)} />
          </div>
        </article>
      )}
    </div>
  );
}

function LinkRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={value} onFocus={(e) => e.target.select()} className={inputClass} />
        <CopyButton text={value} className="shrink-0 py-2" />
      </div>
    </div>
  );
}
