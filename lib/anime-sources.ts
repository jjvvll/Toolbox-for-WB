// Server-only: fetches one SFW picture of a female anime character from a free API.

export type AnimePicture = {
  /** Direct image URL (may be a smaller preview). */
  url: string;
  /** Full-size original, for downloading. */
  fullUrl: string;
  /** Name of the API it came from. */
  source: string;
  /** Artist name, when the API provides one. */
  credit: string | null;
  artistUrl: string | null;
  /** Page to credit: the post or original source. */
  link: string;
};

export class NoResultsError extends Error {}

const TIMEOUT_MS = 6000;
const USER_AGENT = "Toolbox/1.0 (personal dashboard widget)";
const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`);
  return res.json();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const httpUrl = (v: unknown) => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
};

// --- Danbooru ---------------------------------------------------------------

/** Tags that mean a male character is in the picture. */
const MALE_TAGS = ["1boy", "2boys", "3boys", "4boys", "5boys", "6+boys", "multiple_boys", "male_focus"];

type DanbooruPost = {
  id: number;
  rating: string;
  file_url?: string;
  large_file_url?: string;
  file_ext?: string;
  tag_string_general?: string;
  tag_string_artist?: string;
  source?: string;
  is_deleted?: boolean;
  is_banned?: boolean;
};

function danbooruPicture(post: DanbooruPost): AnimePicture | null {
  const general = (post.tag_string_general ?? "").split(" ");
  if (post.rating !== "g") return null; // never anything but general/SFW
  if (post.is_deleted || post.is_banned) return null;
  if (!post.file_url || !["jpg", "jpeg", "png", "webp"].includes(post.file_ext ?? "")) return null;
  if (!general.includes("1girl") || MALE_TAGS.some((t) => general.includes(t))) return null;

  const artist = post.tag_string_artist?.split(" ").find(Boolean) ?? null;
  // The "sample" is a smaller JPG/WebP of the same image; fall back to the original.
  const display = post.large_file_url && IMAGE_EXT.test(post.large_file_url) ? post.large_file_url : post.file_url;
  return {
    url: display,
    fullUrl: post.file_url,
    source: "Danbooru",
    credit: artist ? artist.replace(/_/g, " ") : null,
    artistUrl: artist ? `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(artist)}` : null,
    link: `https://danbooru.donmai.us/posts/${post.id}`,
  };
}

async function danbooruRandom(tags: string, attempts: number): Promise<AnimePicture> {
  for (let i = 0; i < attempts; i++) {
    let post: unknown;
    try {
      post = await getJson(`https://danbooru.donmai.us/posts/random.json?tags=${encodeURIComponent(tags)}`);
    } catch (err) {
      // Danbooru answers 404 when no post matches the tags.
      if (err instanceof Error && err.message.endsWith("404")) throw new NoResultsError();
      throw err;
    }
    if (isObj(post) && typeof post.id === "number") {
      const pic = danbooruPicture(post as DanbooruPost);
      if (pic) return pic;
    }
  }
  throw new NoResultsError();
}

/** Keyword mode. Anonymous searches allow 2 tags: the keyword + rating:g; 1girl is checked on the result. */
export function danbooruKeyword(keyword: string) {
  return danbooruRandom(`${keyword} rating:g`, 5);
}

// --- Random-mode sources ----------------------------------------------------

type Source = { name: string; fetch: () => Promise<AnimePicture> };

const SOURCES: Source[] = [
  {
    name: "Danbooru",
    fetch: () => danbooruRandom("rating:g 1girl", 3),
  },
  {
    name: "nekos.best",
    fetch: async () => {
      const data = await getJson(`https://nekos.best/api/v2/${pick(["neko", "waifu", "kitsune"])}`);
      const r = isObj(data) && Array.isArray(data.results) ? data.results[0] : null;
      const url = isObj(r) ? httpUrl(r.url) : null;
      if (!isObj(r) || !url) throw new Error("nekos.best returned no image");
      return {
        url,
        fullUrl: url,
        source: "nekos.best",
        credit: str(r.artist_name),
        artistUrl: httpUrl(r.artist_href),
        link: httpUrl(r.source_url) ?? httpUrl(r.artist_href) ?? "https://nekos.best",
      };
    },
  },
  {
    name: "waifu.pics",
    fetch: async () => {
      const data = await getJson(`https://api.waifu.pics/sfw/${pick(["waifu", "neko", "shinobu", "megumin"])}`);
      const url = isObj(data) ? httpUrl(data.url) : null;
      if (!url) throw new Error("waifu.pics returned no image");
      return { url, fullUrl: url, source: "waifu.pics", credit: null, artistUrl: null, link: "https://waifu.pics" };
    },
  },
  {
    name: "waifu.im",
    fetch: async () => {
      const data = await getJson("https://api.waifu.im/images?IsNsfw=false&IncludedTags=waifu");
      // Accept both the current and older response shapes.
      const list = isObj(data) ? (data.items ?? data.images) : null;
      const img = Array.isArray(list) ? list.find(isObj) : null;
      const url = img ? httpUrl(img.url) : null;
      if (!img || !url) throw new Error("waifu.im returned no image");
      if (img.isNsfw === true || img.is_nsfw === true || img.IsNsfw === true) {
        throw new Error("waifu.im returned an NSFW image");
      }
      const artists = Array.isArray(img.artists) ? img.artists : img.artist ? [img.artist] : [];
      const artist = artists.find(isObj);
      return {
        url,
        fullUrl: url,
        source: "waifu.im",
        credit: artist ? str(artist.name) : null,
        artistUrl: artist ? (httpUrl(artist.twitter) ?? httpUrl(artist.pixiv) ?? httpUrl(artist.deviant_art)) : null,
        link: httpUrl(img.source) ?? "https://waifu.im",
      };
    },
  },
];

/**
 * Random mode: each source has an equal chance. If the chosen one fails, a random
 * one of the rest is tried, and so on, so a broken source doesn't skew the odds.
 */
export async function randomPicture(): Promise<AnimePicture> {
  const remaining = [...SOURCES];
  const errors: string[] = [];
  while (remaining.length) {
    const [source] = remaining.splice(Math.floor(Math.random() * remaining.length), 1);
    try {
      return await source.fetch();
    } catch (err) {
      errors.push(`${source.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All sources failed (${errors.join("; ")})`);
}

/** Image hosts the download relay may fetch from (so it can't be used as an open proxy). */
export const IMAGE_HOSTS = new Set(["cdn.donmai.us", "nekos.best", "i.waifu.pics", "cdn.waifu.im"]);

export function fetchImageForDownload(url: URL): Promise<Response> {
  return fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      // Danbooru's CDN only serves images to requests that come from Danbooru.
      ...(url.hostname === "cdn.donmai.us" ? { referer: "https://danbooru.donmai.us/" } : {}),
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
}

/** Autocomplete for the keyword box, via Danbooru's tag search. */
export async function danbooruSuggestions(query: string) {
  const params = new URLSearchParams({
    "search[query]": query,
    "search[type]": "tag_query",
    limit: "10",
  });
  const data = await getJson(`https://danbooru.donmai.us/autocomplete.json?${params}`);
  const CATEGORY: Record<number, string> = { 0: "tag", 1: "artist", 3: "series", 4: "character", 5: "meta" };
  return (Array.isArray(data) ? data : [])
    .filter(isObj)
    .map((s) => ({
      value: str(s.value) ?? "",
      label: str(s.label) ?? str(s.value) ?? "",
      category: CATEGORY[Number(s.category)] ?? "tag",
      postCount: typeof s.post_count === "number" ? s.post_count : 0,
    }))
    .filter((s) => s.value && s.category !== "meta");
}
