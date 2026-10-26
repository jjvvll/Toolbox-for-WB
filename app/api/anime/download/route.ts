import type { NextRequest } from "next/server";
import { IMAGE_HOSTS, fetchImageForDownload } from "@/lib/anime-sources";

/**
 * `GET /api/anime/download?url=…` relays an image from one of the known picture
 * hosts, for images whose host doesn't allow the browser to download them directly.
 */
export async function GET(request: NextRequest) {
  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("url") ?? "");
  } catch {
    return Response.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname)) {
    return Response.json({ error: "That image host isn't allowed." }, { status: 400 });
  }

  try {
    const upstream = await fetchImageForDownload(url);
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !type.startsWith("image/")) {
      return Response.json({ error: "The image couldn't be fetched." }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": type,
        ...(upstream.headers.get("content-length")
          ? { "content-length": upstream.headers.get("content-length")! }
          : {}),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "The image couldn't be fetched." }, { status: 502 });
  }
}
