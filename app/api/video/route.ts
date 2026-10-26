import type { NextRequest } from "next/server";
import { cleanDescription } from "@/lib/youtube";
import { errorResponse, getApiKey, missingKeyResponse, yt } from "@/lib/youtube-api";

export type VideoResponse = { id: string; title: string; description: string };

/** Title and cleaned description for one video (`?id=VIDEO_ID`). */
export async function GET(request: NextRequest) {
  const key = getApiKey();
  if (!key) return missingKeyResponse();

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{11}$/.test(id)) {
    return Response.json({ error: "Invalid video ID." }, { status: 400 });
  }

  try {
    const data = await yt<{
      items?: { snippet: { title: string; description?: string } }[];
    }>("videos", { part: "snippet", id }, key);

    const snippet = data.items?.[0]?.snippet;
    if (!snippet) {
      return Response.json({ error: "Video not found or private." }, { status: 404 });
    }

    const body: VideoResponse = {
      id,
      title: snippet.title,
      description: cleanDescription(snippet.description ?? ""),
    };
    return Response.json(body, {
      headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
