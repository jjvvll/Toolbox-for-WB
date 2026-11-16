// Word-level matching for the content checker. Text is compared as a sequence of
// lowercase words, so punctuation, quote style, spacing and capitalization never
// cause a miss.

export type Words = {
  raw: string;
  /** Normalized words, with the range each one covers in `raw`. */
  words: string[];
  starts: number[];
  ends: number[];
};

export type PageIndex = Words & {
  /** " w0 w1 … wn " — lets a phrase be found with a plain substring search. */
  joined: string;
  /** Character offset of each word inside `joined`. */
  offsets: number[];
  /** Words from this index on come from the page title and meta description. */
  metaStart: number;
};

export type Status = "found" | "partial" | "missing";
/** A stretch of text; `hit` is false where the other side has no matching words. */
export type Span = { text: string; hit: boolean };
export type Hit = { page: number; meta: boolean };

export type Segment = {
  text: string;
  status: Status;
  words: number;
  /** Share of the words that were found, 0–1. */
  score: number;
  /** Pages (indexes into the list given to `checkContent`) holding the exact text. */
  hits: Hit[];
  /** Partial matches only: the text with the words missing from the site marked. */
  yours?: Span[];
  /** Partial matches only: the closest passage on the site, extra words marked. */
  site?: Hit & { spans: Span[] };
};

/** One line of the pasted content. `parts` is set when it was checked sentence by sentence. */
export type LineResult = Segment & { parts?: Segment[] };

const WORD = /[\p{L}\p{N}]+(?:['’‘ʼ][\p{L}\p{N}]+)*/gu;
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;
/** Never produced by `tokenize`, so no phrase can match across it. */
const SEPARATOR = "\u0001";

/** Shortest text that gets a close-match search; shorter text is exact-or-nothing. */
const MIN_FUZZY_WORDS = 4;
/** A close match has to share at least this many consecutive words with the page. */
const MIN_RUN = 3;
/** Below this share of matching words a passage counts as missing, not partial. */
const PARTIAL_MIN = 0.6;

export function tokenize(raw: string): Words {
  const words: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (const m of raw.matchAll(WORD)) {
    const word = m[0]
      .normalize("NFKD")
      .replace(/[\u0300-\u036f'’‘ʼ\s]/g, "")
      .toLowerCase();
    if (!word) continue;
    words.push(word);
    starts.push(m.index);
    ends.push(m.index + m[0].length);
  }
  return { raw, words, starts, ends };
}

export function buildPageIndex(text: string, meta: string): PageIndex {
  const body = tokenize(text);
  const head = tokenize(meta);
  const shift = text.length + 1;
  const words = [...body.words, SEPARATOR, ...head.words];
  const offsets: number[] = [];
  let at = 1;
  for (const w of words) {
    offsets.push(at);
    at += w.length + 1;
  }
  return {
    raw: `${text}\n${meta}`,
    words,
    starts: [...body.starts, text.length, ...head.starts.map((s) => s + shift)],
    ends: [...body.ends, text.length, ...head.ends.map((e) => e + shift)],
    joined: ` ${words.join(" ")} `,
    offsets,
    metaStart: body.words.length + 1,
  };
}

/** Lines of the pasted content that contain at least one word. */
export function contentLines(content: string): string[] {
  return content
    .replace(INVISIBLE, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => tokenize(line).words.length > 0);
}

export function checkContent(content: string, pages: PageIndex[]): LineResult[] {
  return contentLines(content).map((line) => checkLine(line, pages));
}

function checkLine(text: string, pages: PageIndex[]): LineResult {
  const q = tokenize(text);
  const hits = exactHits(q.words, pages);
  if (hits.length) return found(text, q.words.length, hits);

  // A paragraph that isn't on the site word for word is checked sentence by
  // sentence, so one edited sentence doesn't hide the ones that are there.
  const sentences = splitSentences(text);
  if (sentences.length < 2) return checkSegment(text, pages);

  const parts = sentences.map((s) => checkSegment(s, pages));
  const words = parts.reduce((sum, p) => sum + p.words, 0);
  const matched = parts.reduce(
    (sum, p) => sum + (p.status === "missing" ? 0 : p.score * p.words),
    0,
  );
  const status: Status = parts.every((p) => p.status === "found")
    ? "found"
    : parts.some((p) => p.status !== "missing")
      ? "partial"
      : "missing";
  const seen = new Set<number>();
  const union = parts
    .flatMap((p) => p.hits)
    .filter((h) => !seen.has(h.page) && seen.add(h.page))
    .sort((a, b) => a.page - b.page);
  return { text, status, words, score: words ? matched / words : 0, hits: union, parts };
}

function checkSegment(text: string, pages: PageIndex[]): Segment {
  const q = tokenize(text);
  const n = q.words.length;
  const hits = exactHits(q.words, pages);
  if (hits.length) return found(text, n, hits);

  const missing: Segment = { text, status: "missing", words: n, score: 0, hits: [] };
  if (n < MIN_FUZZY_WORDS) return missing;

  // Align against the few pages sharing the longest run of words with the text.
  const candidates: { page: PageIndex; i: number; seed: Run }[] = [];
  pages.forEach((page, i) => {
    const seed = longestRun(page, q.words);
    if (seed) candidates.push({ page, i, seed });
  });
  candidates.sort((a, b) => b.seed.len - a.seed.len);

  let best: (Alignment & { page: PageIndex; i: number }) | null = null;
  for (const { page, i, seed } of candidates.slice(0, 3)) {
    const alignment = align(page, q.words, seed);
    if (!best || alignment.matched > best.matched) best = { ...alignment, page, i };
  }
  if (!best) return missing;

  const score = best.matched / n;
  if (score < PARTIAL_MIN) return { ...missing, score };

  const { page, i, qHit, siteHit, siteLo, siteHi } = best;
  return {
    ...missing,
    status: "partial",
    score,
    yours: toSpans(q, 0, n, (k) => qHit[k] === 1, true),
    site: {
      page: i,
      meta: siteLo >= page.metaStart,
      spans: toSpans(page, siteLo, siteHi, (k) => siteHit[k - siteLo] === 1, false),
    },
  };
}

function found(text: string, words: number, hits: Hit[]): Segment {
  return { text, status: "found", words, score: 1, hits };
}

function exactHits(q: string[], pages: PageIndex[]): Hit[] {
  const needle = phrase(q, 0, q.length);
  const hits: Hit[] = [];
  pages.forEach((page, i) => {
    const pos = page.joined.indexOf(needle);
    // The body comes first in `joined`, so a meta-only hit means it's nowhere in the body.
    if (pos >= 0) hits.push({ page: i, meta: wordAt(page, pos + 1) >= page.metaStart });
  });
  return hits;
}

/**
 * Splits on sentence-ending punctuation followed by a capital or digit. Pieces
 * too short to search for on their own are folded into their neighbour.
 */
export function splitSentences(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?]["”’)\]]*)\s+(?=["“‘(\[]?[\p{Lu}\p{N}])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const short = (s: string) => tokenize(s).words.length < MIN_FUZZY_WORDS;
  for (const piece of pieces) {
    const last = out.length - 1;
    if (last >= 0 && (short(piece) || short(out[last]))) out[last] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
}

function phrase(q: string[], from: number, len: number): string {
  return ` ${q.slice(from, from + len).join(" ")} `;
}

function wordAt(page: PageIndex, offset: number): number {
  let lo = 0;
  let hi = page.offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (page.offsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

type Run = { qi: number; pi: number; len: number };

/** Longest run of consecutive words from `q` that appears on the page, if at least MIN_RUN long. */
function longestRun(page: PageIndex, q: string[]): Run | null {
  let best: Run | null = null;
  let bestLen = MIN_RUN - 1;
  for (let i = 0; ; i++) {
    // Only a run longer than the best so far is interesting.
    let len = bestLen + 1;
    if (i + len > q.length) break;
    let pos = page.joined.indexOf(phrase(q, i, len));
    if (pos < 0) continue;
    let pi = wordAt(page, pos + 1);
    while (i + len < q.length) {
      if (page.words[pi + len] === q[i + len]) {
        len++;
        continue;
      }
      // This occurrence ends here; a later one may run longer.
      pos = page.joined.indexOf(phrase(q, i, len + 1), pos + 1);
      if (pos < 0) break;
      pi = wordAt(page, pos + 1);
      len++;
    }
    best = { qi: i, pi, len };
    bestLen = len;
  }
  return best;
}

type Alignment = {
  matched: number;
  /** 1 for each word of the text that lines up with a word on the site. */
  qHit: Uint8Array;
  /** The site passage [siteLo, siteHi) the text lines up with, and which of its words matched. */
  siteLo: number;
  siteHi: number;
  siteHit: Uint8Array;
};

/** Lines the text up with the page around `seed`, allowing for edits on both sides of it. */
function align(page: PageIndex, q: string[], seed: Run): Alignment {
  const n = q.length;
  const after = n - seed.qi - seed.len;
  // Room for the site's version to be longer than the text, proportional to what's left to match.
  const slack = (words: number) => (words ? Math.ceil(words / 2) + 4 : 0);
  const inMeta = seed.pi >= page.metaStart;
  const regionLo = inMeta ? page.metaStart : 0;
  const regionHi = inMeta ? page.words.length : page.metaStart - 1;
  const lo = Math.max(regionLo, seed.pi - seed.qi - slack(seed.qi));
  const hi = Math.min(regionHi, seed.pi + seed.len + after + slack(after));

  const blocks: Block[] = [];
  matchBlocks(q, 0, seed.qi, page.words, lo, seed.pi, blocks);
  blocks.push([seed.qi, seed.pi, seed.len]);
  matchBlocks(q, seed.qi + seed.len, n, page.words, seed.pi + seed.len, hi, blocks);

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const siteLo = first[1];
  const siteHi = last[1] + last[2];
  const qHit = new Uint8Array(n);
  const siteHit = new Uint8Array(siteHi - siteLo);
  let matched = 0;
  for (const [qi, pi, len] of blocks) {
    qHit.fill(1, qi, qi + len);
    siteHit.fill(1, pi - siteLo, pi - siteLo + len);
    matched += len;
  }
  return { matched, qHit, siteLo, siteHi, siteHit };
}

/** [index in a, index in b, length] */
type Block = [number, number, number];

/**
 * Appends, in order, the matching blocks between a[alo, ahi) and b[blo, bhi):
 * the longest common run first, then the same on each side of it. A lone short
 * word ("the", "of") doesn't count, which keeps stray matches out of the result.
 */
function matchBlocks(
  a: string[],
  alo: number,
  ahi: number,
  b: string[],
  blo: number,
  bhi: number,
  out: Block[],
): void {
  if (alo >= ahi || blo >= bhi) return;
  let bestA = 0;
  let bestB = 0;
  let bestLen = 0;
  // prev[j - blo + 1] = length of the common run ending at (i - 1, j).
  let prev = new Uint16Array(bhi - blo + 1);
  let cur = new Uint16Array(bhi - blo + 1);
  for (let i = alo; i < ahi; i++) {
    const word = a[i];
    for (let j = blo; j < bhi; j++) {
      const len = b[j] === word ? prev[j - blo] + 1 : 0;
      cur[j - blo + 1] = len;
      if (len > bestLen && (len > 1 || word.length >= 4)) {
        bestLen = len;
        bestA = i - len + 1;
        bestB = j - len + 1;
      }
    }
    [prev, cur] = [cur, prev];
  }
  if (!bestLen) return;
  matchBlocks(a, alo, bestA, b, blo, bestB, out);
  out.push([bestA, bestB, bestLen]);
  matchBlocks(a, bestA + bestLen, ahi, b, bestB + bestLen, bhi, out);
}

/**
 * Cuts words [from, to) of `src` into alternating hit / miss spans. Text between
 * two missed words is marked as missed too, so a missed phrase reads as one block.
 */
function toSpans(
  src: Words,
  from: number,
  to: number,
  isHit: (word: number) => boolean,
  wholeText: boolean,
): Span[] {
  const spans: Span[] = [];
  const push = (text: string, hit: boolean) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.hit === hit) last.text += text;
    else spans.push({ text, hit });
  };
  let at = wholeText ? 0 : src.starts[from];
  let prevHit = true;
  for (let i = from; i < to; i++) {
    const hit = isHit(i);
    push(src.raw.slice(at, src.starts[i]), hit || prevHit);
    push(src.raw.slice(src.starts[i], src.ends[i]), hit);
    at = src.ends[i];
    prevHit = hit;
  }
  if (wholeText) push(src.raw.slice(at), true);
  return spans;
}
