import type { NextRequest } from "next/server";

// Drive thumbnails don't send CORS headers, so the browser can't turn them
// into a downloadable blob directly. This relays the image from our origin.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,}$/.test(id)) {
    return Response.json({ error: "Invalid Google Drive file ID." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`,
    );
  } catch {
    return Response.json({ error: "Couldn't reach Google Drive." }, { status: 502 });
  }

  const type = upstream.headers.get("content-type") ?? "";
  // Private or missing files come back as an HTML error/sign-in page.
  if (!upstream.ok || !type.startsWith("image/")) {
    return Response.json(
      {
        error:
          "No thumbnail available. Make sure the file exists and is shared as “Anyone with the link”.",
      },
      { status: 404 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
