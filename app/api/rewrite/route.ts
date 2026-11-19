import Anthropic from "@anthropic-ai/sdk";
import { MODELS, SYSTEM_PROMPT, type RewriteRequest, type RewriteResponse } from "@/app/(tools)/rewrite/lib/styles";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TEXT = 50_000;
const TIMEOUT_MS = 90_000;

/** An error whose message is safe to show in the tool. */
class RewriteError extends Error {}

// Rewrites text with the AI provider picked in the tool. The API key is typed
// into the tool and kept in that browser; it's sent with each request, used for
// that one call and never stored or logged here.
export async function POST(request: Request) {
  let body: RewriteRequest;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Bad request." }, 400);
  }
  const { provider, key, model } = body;
  if ((provider !== "gemini" && provider !== "claude") || typeof key !== "string" || !key.trim()) {
    return reply({ error: "Add an API key in the settings first." }, 400);
  }
  if (!MODELS[provider].some((m) => m.id === model)) return reply({ error: "Pick a model in the settings." }, 400);

  try {
    if (body.action === "test") {
      await (provider === "claude" ? testClaude(key.trim()) : testGemini(key.trim()));
      return reply({ ok: true });
    }
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return reply({ error: "Enter some text to rewrite." }, 400);
    if (text.length > MAX_TEXT) return reply({ error: "That text is too long to rewrite in one go." }, 400);
    const prompt = `${body.tone}\n\n<text>\n${text}\n</text>`;
    const out = provider === "claude" ? await rewriteClaude(key.trim(), model, prompt) : await rewriteGemini(key.trim(), model, prompt);
    return reply({ text: out });
  } catch (err) {
    return reply({ error: err instanceof RewriteError ? err.message : "The AI service couldn't be reached. Try again." }, 502);
  }
}

const reply = (body: RewriteResponse, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// ---------- Claude ----------

function claudeClient(apiKey: string) {
  return new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
}

function claudeError(err: unknown): never {
  if (err instanceof Anthropic.AuthenticationError) throw new RewriteError("Invalid Claude API key (check the settings).");
  if (err instanceof Anthropic.PermissionDeniedError) throw new RewriteError("This Claude API key can't use that model.");
  if (err instanceof Anthropic.RateLimitError) throw new RewriteError("Rate limited by Claude. Try again in a moment.");
  if (err instanceof Anthropic.APIError) throw new RewriteError(`Claude error ${err.status ?? ""}: ${err.message}`.trim());
  throw err;
}

async function testClaude(apiKey: string) {
  // Listing models checks the key without spending tokens.
  try {
    await claudeClient(apiKey).models.list({ limit: 1 });
  } catch (err) {
    claudeError(err);
  }
}

async function rewriteClaude(apiKey: string, model: string, prompt: string): Promise<string> {
  // Opus 5.5 and Sonnet 5.5 can retry on another model if a safety classifier declines.
  const fallback = model === "claude-opus-5-5" || model === "claude-sonnet-5-5";
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await claudeClient(apiKey).beta.messages.create({
      model,
      max_tokens: 16000,
      // A short, simple task: low effort keeps it fast.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  } catch (err) {
    claudeError(err);
  }
  if (response.stop_reason === "refusal") throw new RewriteError("Claude declined to rewrite this text.");
  const out = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!out.trim()) throw new RewriteError("Claude returned an empty response.");
  if (response.stop_reason === "max_tokens") throw new RewriteError("The rewrite was cut off. Try a shorter piece of text.");
  return out;
}

// ---------- Gemini (free tier; key from aistudio.google.com) ----------

async function geminiFetch(url: string, apiKey: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message: string = data?.error?.message ?? "";
    if ((res.status === 400 && /key/i.test(message)) || res.status === 401) throw new RewriteError("Invalid Gemini API key (check the settings).");
    if (res.status === 403) throw new RewriteError("This Gemini key isn't allowed to use that model.");
    if (res.status === 429) throw new RewriteError("Gemini free-tier limit reached. Wait a minute and try again.");
    throw new RewriteError(message ? `Gemini error: ${message}` : `Gemini error ${res.status}.`);
  }
  return data;
}

async function testGemini(apiKey: string) {
  await geminiFetch(`${GEMINI_URL}?pageSize=1`, apiKey);
}

async function rewriteGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const data = await geminiFetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  if (data.promptFeedback?.blockReason) throw new RewriteError("Gemini declined to rewrite this text.");
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") throw new RewriteError("Gemini declined to rewrite this text.");
  const out = ((candidate?.content?.parts ?? []) as { text?: string; thought?: boolean }[])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("");
  if (!out.trim()) throw new RewriteError("Gemini returned an empty response.");
  return out;
}
