"use client";

import { useEffect, useState } from "react";
import CopyButton from "@/components/copy-button";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import { logError } from "@/lib/error-log";
import {
  MODELS,
  PROVIDER_LABEL,
  STYLES,
  STYLE_IDS,
  type Provider,
  type RewriteRequest,
  type RewriteResponse,
  type StyleId,
} from "./lib/styles";

// ---------- settings, saved in this browser ----------

type Settings = {
  provider: Provider;
  keys: Record<Provider, string>;
  models: Record<Provider, string>;
  /** Edited prompts only; a style without one uses its default. */
  prompts: Partial<Record<StyleId, string>>;
};

const SETTINGS_KEY = "rewrite:settings";
const DEFAULTS: Settings = {
  provider: "gemini",
  keys: { gemini: "", claude: "" },
  models: { gemini: MODELS.gemini[0].id, claude: MODELS.claude[0].id },
  prompts: {},
};

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (saved && typeof saved === "object") {
      return {
        ...DEFAULTS,
        ...saved,
        keys: { ...DEFAULTS.keys, ...saved.keys },
        models: { ...DEFAULTS.models, ...saved.models },
        prompts: { ...saved.prompts },
      };
    }
  } catch {
    // unreadable: start from the defaults
  }
  return DEFAULTS;
}

/** The prompt a style uses: the saved edit if there is one, otherwise the default. */
const toneFor = (style: StyleId, prompts: Settings["prompts"]) => prompts[style]?.trim() || STYLES[style].tone;

async function callRewrite(body: RewriteRequest): Promise<RewriteResponse> {
  const res = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as RewriteResponse | null;
  if (!data) return { error: `Request failed (${res.status}).` };
  return data;
}

export default function RewriteTool() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [text, setText] = useState("");
  const [style, setStyle] = useState<StyleId>("normal");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // localStorage only exists in the browser, so the saved settings are read after mounting.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSettings(loadSettings()), []);

  const save = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // storage blocked: settings last until the page closes
    }
  };

  const s = settings ?? DEFAULTS;
  const key = s.keys[s.provider].trim();

  async function rewrite() {
    if (!key) {
      setShowSettings(true);
      setError(`Add your ${PROVIDER_LABEL[s.provider]} API key in the settings first.`);
      return;
    }
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setResult("");
    const data = await callRewrite({
      action: "rewrite",
      provider: s.provider,
      key,
      model: s.models[s.provider],
      tone: toneFor(style, s.prompts),
      text,
    });
    setBusy(false);
    if ("error" in data) {
      setError(data.error);
      logError("AI Rewrite", "AI rewrite failed", `${PROVIDER_LABEL[s.provider]}, ${STYLES[style].title}: ${data.error}`);
    }
    else if ("text" in data) {
      // Keep any spaces or line breaks that were around the original text.
      const lead = text.match(/^\s*/)?.[0] ?? "";
      const trail = text.match(/\s*$/)?.[0] ?? "";
      setResult(lead + data.text.trim() + trail);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {STYLE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setStyle(id)}
            aria-pressed={style === id}
            className={`rounded-full px-3 py-1 text-sm ${
              style === id
                ? "bg-foreground text-background"
                : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            {STYLES[id].title}
            {s.prompts[id]?.trim() ? " (edited)" : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-sm dark:border-zinc-700"
        >
          ⚙ Settings
          {settings && !key && <span className="h-2 w-2 rounded-full bg-red-500" title="No API key saved" />}
        </button>
      </div>

      {showSettings && <SettingsPanel settings={s} onChange={save} />}

      <textarea
        className={`${inputClass} min-h-40`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the text to rewrite"
        aria-label="Text to rewrite"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={rewrite} disabled={busy || !text.trim()} className={primaryButtonClass}>
          {busy ? `Rewriting (${STYLES[style].title.toLowerCase()})…` : "Rewrite"}
        </button>
        <span className="text-xs text-zinc-500">
          {PROVIDER_LABEL[s.provider]} · {MODELS[s.provider].find((m) => m.id === s.models[s.provider])?.label}
        </span>
      </div>

      {error && <p className={errorClass}>{error}</p>}

      {result && (
        <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Rewritten</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setText(result);
                  setResult("");
                }}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Use as input
              </button>
              <CopyButton text={result} />
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm">{result}</p>
        </div>
      )}
    </div>
  );
}

// ---------- settings panel ----------

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "testing" | "ok" | "bad"; message?: string }>({ state: "idle" });
  const [promptStyle, setPromptStyle] = useState<StyleId>("normal");
  const p = settings.provider;
  const edited = settings.prompts[promptStyle]?.trim();

  async function testKey() {
    setTest({ state: "testing" });
    const data = await callRewrite({ action: "test", provider: p, key: settings.keys[p].trim(), model: settings.models[p] });
    setTest("error" in data ? { state: "bad", message: data.error } : { state: "ok" });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Provider</span>
        <div className="flex flex-wrap gap-4 text-sm">
          {(Object.keys(PROVIDER_LABEL) as Provider[]).map((id) => (
            <label key={id} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="provider"
                checked={p === id}
                onChange={() => {
                  setTest({ state: "idle" });
                  onChange({ ...settings, provider: id });
                }}
              />
              {PROVIDER_LABEL[id]}
              <span className="text-xs text-zinc-500">{id === "gemini" ? "(free tier)" : "(paid)"}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Model</span>
        <select
          value={settings.models[p]}
          onChange={(e) => onChange({ ...settings, models: { ...settings.models, [p]: e.target.value } })}
          className="rounded-md border border-zinc-300 bg-background px-2 py-1.5 dark:border-zinc-700"
        >
          {MODELS[p].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{PROVIDER_LABEL[p]} API key</span>
        <div className="flex gap-2">
          <input
            type={show ? "text" : "password"}
            className={inputClass}
            value={settings.keys[p]}
            autoComplete="off"
            spellCheck={false}
            placeholder={p === "gemini" ? "From aistudio.google.com" : "From platform.claude.com"}
            onChange={(e) => {
              setTest({ state: "idle" });
              onChange({ ...settings, keys: { ...settings.keys, [p]: e.target.value } });
            }}
          />
          <button type="button" onClick={() => setShow(!show)} className="shrink-0 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700">
            {show ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={testKey}
            disabled={!settings.keys[p].trim() || test.state === "testing"}
            className="shrink-0 rounded-md border border-zinc-300 px-3 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            {test.state === "testing" ? "Testing…" : "Test key"}
          </button>
        </div>
        {test.state === "ok" && <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ The key works.</p>}
        {test.state === "bad" && <p className="text-xs text-red-600 dark:text-red-400">{test.message}</p>}
        <p className="text-xs text-zinc-500">
          Saved in this browser only. Each rewrite sends the key and your text through this app&apos;s server to{" "}
          {PROVIDER_LABEL[p]}; the server doesn&apos;t keep either.
          {p === "gemini" && " Gemini's free tier may use the text to improve Google's products."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Rewrite prompts</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={promptStyle}
            onChange={(e) => setPromptStyle(e.target.value as StyleId)}
            className="rounded-md border border-zinc-300 bg-background px-2 py-1.5 dark:border-zinc-700"
          >
            {STYLE_IDS.map((id) => (
              <option key={id} value={id}>
                {STYLES[id].title}
                {settings.prompts[id]?.trim() ? " (edited)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!edited}
            onClick={() => {
              const rest = { ...settings.prompts };
              delete rest[promptStyle];
              onChange({ ...settings, prompts: rest });
            }}
            className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Reset to default
          </button>
        </div>
        <textarea
          className={`${inputClass} min-h-28`}
          value={settings.prompts[promptStyle] ?? STYLES[promptStyle].tone}
          onChange={(e) => {
            const value = e.target.value;
            const prompts = { ...settings.prompts };
            // Matching the default means "use the default"; an empty box is kept so it can be retyped,
            // and also uses the default until something is typed.
            if (value === STYLES[promptStyle].tone) delete prompts[promptStyle];
            else prompts[promptStyle] = value;
            onChange({ ...settings, prompts });
          }}
        />
        <p className="text-xs text-zinc-500">
          What this style tells the AI. Every style also fixes spelling and grammar and keeps the meaning, names,
          numbers, links and line breaks. Empty the box to go back to the default.
        </p>
      </div>
    </div>
  );
}
