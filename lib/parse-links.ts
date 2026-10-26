function toUrl(input: string): URL | null {
  const s = input.trim();
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** Google Drive file ID from a share link, `?id=` link, or a bare ID. */
export function parseDriveFileId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{20,}$/.test(s)) return s;
  const url = toUrl(s);
  if (!url || !/(^|\.)google\.com$/.test(url.hostname)) return null;
  const fromPath = url.pathname.match(/\/d\/([\w-]{10,})/);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get("id");
  return fromQuery && /^[\w-]{10,}$/.test(fromQuery) ? fromQuery : null;
}

const VIDEO_ID = /^[\w-]{11}$/;

/** YouTube video ID from watch, youtu.be, shorts, embed, or live links. */
export function parseYouTubeVideoId(input: string): string | null {
  const s = input.trim();
  if (VIDEO_ID.test(s)) return s;
  const url = toUrl(s);
  if (!url) return null;
  const host = url.hostname.replace(/^(www|m|music)\./, "");

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ??
      null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string };

/** Channel reference from a channel URL, @handle, or channel ID. */
export function parseChannelRef(input: string): ChannelRef | null {
  const s = input.trim();
  if (!s) return null;
  if (/^UC[\w-]{22}$/.test(s)) return { kind: "id", value: s };
  if (/^@[\w.-]+$/.test(s)) return { kind: "handle", value: s };

  const url = toUrl(s);
  if (url && /(^|\.)youtube\.com$/.test(url.hostname)) {
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (first?.startsWith("@")) return { kind: "handle", value: decodeURIComponent(first) };
    if (first === "channel" && second && /^UC[\w-]{22}$/.test(second)) {
      return { kind: "id", value: second };
    }
    if (first === "user" && second) return { kind: "username", value: second };
    // Legacy /c/ custom URLs can't be resolved without the search endpoint;
    // they usually match the channel's handle, so try that.
    if (first === "c" && second) return { kind: "handle", value: `@${second}` };
    return null;
  }
  // A bare word is most likely a handle typed without the @.
  return /^[\w.-]{3,}$/.test(s) ? { kind: "handle", value: `@${s}` } : null;
}
