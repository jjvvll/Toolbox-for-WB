import type { NextRequest } from "next/server";
import { parseYouTubeVideoId } from "@/lib/parse-links";
import { titleMatcher, type ChannelVideo } from "@/lib/youtube";
import { errorResponse, fetchPlaylistPage, getApiKey, missingKeyResponse } from "@/lib/youtube-api";

export type ChannelSearchResponse = {
  matches: ChannelVideo[];
  /** Where to resume scanning; null once the whole playlist has been checked. */
  nextPageToken: string | null;
  scanned: number;
  total: number;
};

// Each page is 50 videos and costs 1 quota unit, so one request checks at most
// 1,000 videos (20 units) and stays well under serverless time limits.
const MAX_PAGES = 20;
const MAX_MATCHES = 50;

/**
 * Finds videos by title in a channel's uploads without the search endpoint,
 * by scanning the uploads playlist: `?playlistId=UU…&q=…[&pageToken=…]`.
 */
export async function GET(request: NextRequest) {
  const key = getApiKey();
  if (!key) return missingKeyResponse();

  const params = request.nextUrl.searchParams;
  const playlistId = params.get("playlistId") ?? "";
  const q = (params.get("q") ?? "").trim();
  if (!/^UU[\w-]+$/.test(playlistId)) {
    return Response.json({ error: "Invalid uploads playlistId." }, { status: 400 });
  }
  if (!q) return Response.json({ error: "Enter something to search for." }, { status: 400 });

  const matches = titleMatcher(q, parseYouTubeVideoId(q));
  const found: ChannelVideo[] = [];
  let pageToken = params.get("pageToken");
  let scanned = 0;
  let total = 0;

  try {
    for (let i = 0; i < MAX_PAGES && found.length < MAX_MATCHES; i++) {
      const page = await fetchPlaylistPage(playlistId, pageToken, key);
      total = page.total;
      scanned += page.videos.length;
      found.push(...page.videos.filter(matches));
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }

    const body: ChannelSearchResponse = { matches: found, nextPageToken: pageToken, scanned, total };
    return Response.json(body, {
      headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
