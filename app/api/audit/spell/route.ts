// Spelling for the Audit tool, through LanguageTool's free public API (spelling
// rules only). The page batches the text and keeps under the free limits; this
// route only forwards one batch and passes LanguageTool's answer back.

const LT_URL = "https://api.languagetool.org/v2/check";
const LANGUAGES = new Set(["en-US", "en-GB", "en-CA", "en-AU"]);
const MAX_BYTES = 60_000;
const TIMEOUT_MS = 45_000;

export type SpellMatch = { offset: number; length: number; replacements: string[] };

export async function POST(request: Request) {
  let body: { text?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  const language = typeof body.language === "string" && LANGUAGES.has(body.language) ? body.language : "en-US";
  if (!text.trim()) return Response.json({ matches: [] });
  if (new TextEncoder().encode(text).length > MAX_BYTES) return Response.json({ error: "Batch too large." }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(LT_URL, {
      method: "POST",
      body: new URLSearchParams({ text, language, enabledOnly: "true", enabledCategories: "TYPOS" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json({ error: timedOut ? "LanguageTool did not answer within 45 seconds." : "Couldn't reach LanguageTool." }, { status: 504 });
  }
  if (res.status === 429) return Response.json({ error: "LanguageTool asked us to slow down." }, { status: 429 });
  if (!res.ok) return Response.json({ error: `LanguageTool error ${res.status}.` }, { status: 502 });

  const data = await res.json().catch(() => ({}));
  type LtMatch = { offset: number; length: number; replacements?: { value: string }[]; rule?: { issueType?: string } };
  const matches: SpellMatch[] = ((data.matches ?? []) as LtMatch[])
    .filter((m) => !m.rule?.issueType || m.rule.issueType === "misspelling")
    .map((m) => ({ offset: m.offset, length: m.length, replacements: (m.replacements ?? []).slice(0, 3).map((r) => r.value) }));
  return Response.json({ matches }, { headers: { "cache-control": "no-store" } });
}
