// Server-only helpers for the YouTube Data API v3. Never import from client code.
import { cleanDescription, type ChannelVideo, type VideoPage } from "./youtube";

const API = "https://www.googleapis.com/youtube/v3";

export type Thumbs = Partial<
  Record<"default" | "medium" | "high" | "standard" | "maxres", { url: string }>
>;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function getApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY || null;
}

export const missingKeyResponse = () =>
  Response.json({ error: "YOUTUBE_API_KEY is not configured on the server." }, { status: 500 });

export async function yt<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  // Sent as a header so the key never appears in a URL.
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { "x-goog-api-key": key },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.message ?? `YouTube API error (${res.status}).`, res.status);
  }
  return data as T;
}

type PlaylistItems = {
  items?: {
    snippet: {
      title: string;
      description?: string;
      thumbnails: Thumbs;
      resourceId: { videoId: string };
    };
    contentDetails?: { videoPublishedAt?: string };
  }[];
  nextPageToken?: string;
  pageInfo?: { totalResults: number };
};

/** One page (up to 50) of a playlist. A missing playlist (e.g. no Shorts) is an empty page. */
export async function fetchPlaylistPage(
  playlistId: string,
  pageToken: string | null,
  key: string,
): Promise<VideoPage> {
  let page: PlaylistItems;
  try {
    page = await yt<PlaylistItems>(
      "playlistItems",
      {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      key,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { videos: [], nextPageToken: null, total: 0 };
    }
    throw err;
  }

  const videos: ChannelVideo[] = [];
  for (const { snippet, contentDetails } of page.items ?? []) {
    const t = snippet.thumbnails;
    const thumbnail = t.high?.url ?? t.medium?.url ?? t.default?.url;
    // Private and deleted videos come back without thumbnails.
    if (thumbnail) {
      videos.push({
        id: snippet.resourceId.videoId,
        title: snippet.title,
        description: cleanDescription(snippet.description ?? ""),
        thumbnail,
        publishedAt: contentDetails?.videoPublishedAt ?? null,
      });
    }
  }
  return {
    videos,
    nextPageToken: page.nextPageToken || null,
    total: page.pageInfo?.totalResults ?? videos.length,
  };
}

export function errorResponse(err: unknown) {
  const status = err instanceof ApiError ? (err.status === 404 ? 404 : 502) : 500;
  return Response.json(
    { error: err instanceof Error ? err.message : "Unexpected error." },
    { status },
  );
}
