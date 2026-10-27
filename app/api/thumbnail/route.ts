import type { NextRequest } from "next/server";
import { safeFileName } from "@/lib/youtube";

// YouTube's image host sends no CORS headers and the browser ignores `download`
// on cross-origin links, so the image is relayed from our origin with a file name.
const SIZES = ["maxresdefault", "hqdefault"];

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{11}$/.test(id)) {
    return Response.json({ error: "Invalid video ID." }, { status: 400 });
  }
  const name = safeFileName(request.nextUrl.searchParams.get("name") ?? "", id);

  for (const size of SIZES) {
    let upstream: Response;
    try {
      upstream = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`);
    } catch {
      return Response.json({ error: "Couldn't reach YouTube." }, { status: 502 });
    }
    if (!upstream.ok) continue;
    const bytes = await upstream.arrayBuffer();
    // A missing maxres image can come back as a small placeholder; use the next size.
    if (bytes.byteLength < 5000 && size !== SIZES[SIZES.length - 1]) continue;
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    return new Response(bytes, {
      headers: {
        "content-type": "image/jpeg",
        "content-disposition": `attachment; filename="${ascii}.jpg"; filename*=UTF-8''${encodeURIComponent(name)}.jpg`,
        "cache-control": "public, max-age=3600, s-maxage=86400",
      },
    });
  }
  return Response.json({ error: "No thumbnail available for this video." }, { status: 404 });
}
