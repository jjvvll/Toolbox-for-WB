import type { NextRequest } from "next/server";
import { danbooruSuggestions } from "@/lib/anime-sources";

export type AnimeSuggestion = Awaited<ReturnType<typeof danbooruSuggestions>>[number];

/** `GET /api/anime/suggest?q=fri` → Danbooru tag suggestions for the keyword box. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, "_");
  if (q.length < 2) return Response.json([]);
  try {
    const suggestions = await danbooruSuggestions(q.slice(0, 60));
    return Response.json(suggestions, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json([], { status: 502 });
  }
}
