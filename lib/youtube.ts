export type ChannelVideo = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string | null;
};

export type VideoPage = { videos: ChannelVideo[]; nextPageToken: string | null; total: number };

export const watchUrl =(id: string) => `https://www.youtube.com/watch?v=${id}`;

export const autoplayUrl = (id: string, muted: boolean) =>
  `https://www.youtube.com/embed/${id}?autoplay=1${muted ? "&mute=1" : ""}`;

/** Strips hashtags and stray HTML tags from a description and tidies whitespace. */
export function cleanDescription(text: string): string {
  return text
    .replace(/<\/?[a-z][^>]*>/gi, "")
    // Hashtags need a letter, so "#42" (an issue or list number) is kept.
    .replace(/(^|\s)#(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+/gu, "$1")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A channel's uploads playlist is "UU" + the channel ID minus its "UC".
 * YouTube also serves unlisted variants of it: "UULF" (long-form videos only)
 * and "UUSH" (Shorts only). Livestreams appear in neither.
 */
export function channelPlaylists(uploadsId: string) {
  const suffix = uploadsId.replace(/^UU/, "");
  return { uploads: uploadsId, long: `UULF${suffix}`, shorts: `UUSH${suffix}` };
}

const normalize = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Builds a matcher: every word of the query must appear in the title (or it's the video's ID). */
export function titleMatcher(query: string, videoId?: string | null) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return (v: { id: string; title: string }) =>
    (videoId != null && v.id === videoId) ||
    (words.length > 0 && words.every((w) => normalize(v.title).includes(w)));
}
