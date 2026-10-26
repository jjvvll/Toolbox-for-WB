import type { NextRequest } from "next/server";
import { NoResultsError, danbooruKeyword, randomPicture, type AnimePicture } from "@/lib/anime-sources";

export type AnimeResponse = AnimePicture;

/**
 * `GET /api/anime` → a random picture from one of four sources.
 * `GET /api/anime?q=frieren` → a Danbooru picture for that tag (series or character).
 * Comma-separated keywords pick one at random per request.
 */
export async function GET(request: NextRequest) {
  const keywords = (request.nextUrl.searchParams.get("q") ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase().replace(/\s+/g, "_"))
    // One plain tag only: no metatags (e.g. "rating:e") or extra tags slipped in.
    .filter((k) => /^[^\s:*,]{1,80}$/.test(k) && !k.startsWith("-"));
  const keyword = keywords.length ? keywords[Math.floor(Math.random() * keywords.length)] : null;

  try {
    const picture = keyword ? await danbooruKeyword(keyword) : await randomPicture();
    return Response.json(picture satisfies AnimeResponse, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    if (err instanceof NoResultsError) {
      return Response.json(
        { error: `No safe pictures of a girl found for “${keyword?.replace(/_/g, " ")}”. Try another name or pick a suggestion.` },
        { status: 404 },
      );
    }
    console.error("[api/anime]", err);
    return Response.json(
      { error: "The picture services aren't responding right now. Try again in a moment." },
      { status: 502 },
    );
  }
}
