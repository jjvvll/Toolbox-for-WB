import type { NextRequest } from "next/server";
import { parseChannelRef } from "@/lib/parse-links";
import { channelPlaylists, type VideoPage } from "@/lib/youtube";
import {
  errorResponse,
  fetchPlaylistPage,
  getApiKey,
  missingKeyResponse,
  yt,
  type Thumbs,
} from "@/lib/youtube-api";

export type ChannelResponse = {
  channel: { id: string; title: string; thumbnail: string | null };
  playlists: ReturnType<typeof channelPlaylists>;
  long: VideoPage;
  shorts: VideoPage;
};

const cacheHeaders = { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" };

/**
 * First call: `?q=<channel link or @handle>` resolves the channel and returns the
 * first page (newest 50) of both its long-form videos and its Shorts.
 * Next pages: `?playlistId=…&pageToken=…` returns one more page of that playlist.
 * Pages are fetched only on request, so huge channels are never loaded in full.
 */
export async function GET(request: NextRequest) {
  const key = getApiKey();
  if (!key) return missingKeyResponse();

  const params = request.nextUrl.searchParams;
  const playlistId = params.get("playlistId");

  try {
    if (playlistId) {
      if (!/^[\w-]+$/.test(playlistId)) {
        return Response.json({ error: "Invalid playlistId." }, { status: 400 });
      }
      const page = await fetchPlaylistPage(playlistId, params.get("pageToken"), key);
      return Response.json(page satisfies VideoPage, { headers: cacheHeaders });
    }

    const ref = parseChannelRef(params.get("q") ?? "");
    if (!ref) {
      return Response.json(
        { error: "Enter a channel link (youtube.com/@handle, /channel/UC…, /user/…) or an @handle." },
        { status: 400 },
      );
    }
    const lookup = { id: "id", handle: "forHandle", username: "forUsername" }[ref.kind];
    const data = await yt<{
      items?: {
        id: string;
        snippet: { title: string; thumbnails: Thumbs };
        contentDetails: { relatedPlaylists: { uploads: string } };
      }[];
    }>("channels", { part: "snippet,contentDetails", [lookup]: ref.value }, key);

    const item = data.items?.[0];
    if (!item) return Response.json({ error: "Channel not found." }, { status: 404 });

    const playlists = channelPlaylists(item.contentDetails.relatedPlaylists.uploads);
    const [long, shorts] = await Promise.all([
      fetchPlaylistPage(playlists.long, null, key),
      fetchPlaylistPage(playlists.shorts, null, key),
    ]);

    const body: ChannelResponse = {
      channel: {
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? null,
      },
      playlists,
      long,
      shorts,
    };
    return Response.json(body, { headers: cacheHeaders });
  } catch (err) {
    return errorResponse(err);
  }
}
