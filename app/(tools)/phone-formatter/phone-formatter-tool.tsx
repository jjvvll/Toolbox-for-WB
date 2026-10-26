"use client";

import { useState } from "react";
import CopyButton from "@/components/copy-button";
import { errorClass, inputClass } from "@/components/ui";

type Parts = { area: string; prefix: string; line: string };

const FORMATS = [
  { id: "parens", label: "(555) 123-4567", format: (p: Parts) => `(${p.area}) ${p.prefix}-${p.line}` },
  { id: "dashes", label: "555-123-4567", format: (p: Parts) => `${p.area}-${p.prefix}-${p.line}` },
  { id: "dots", label: "555.123.4567", format: (p: Parts) => `${p.area}.${p.prefix}.${p.line}` },
  { id: "e164", label: "+15551234567", format: (p: Parts) => `+1${p.area}${p.prefix}${p.line}` },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

/** 10 digits, or 11 starting with the US country code 1. */
function parsePhone(input: string): Parts | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return { area: digits.slice(0, 3), prefix: digits.slice(3, 6), line: digits.slice(6) };
}

export default function PhoneFormatterTool() {
  const [input, setInput] = useState("");
  const [formatId, setFormatId] = useState<FormatId>("parens");

  const parts = parsePhone(input);
  const result = parts && FORMATS.find((f) => f.id === formatId)!.format(parts);
  const digitCount = input.replace(/\D/g, "").length;

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-6">
      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. 1 (555) 123 4567"
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Choose Format</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMATS.map((f) => (
            <label
              key={f.id}
              className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-2.5 text-center font-mono text-sm transition-colors hover:border-zinc-400 has-checked:border-blue-600 has-checked:bg-blue-50 has-checked:text-blue-700 has-focus-visible:ring-2 has-focus-visible:ring-blue-500/40 dark:border-zinc-700 dark:hover:border-zinc-500 dark:has-checked:border-blue-500 dark:has-checked:bg-blue-950/40 dark:has-checked:text-blue-300"
            >
              <input
                type="radio"
                name="format"
                value={f.id}
                checked={formatId === f.id}
                onChange={() => setFormatId(f.id)}
                className="sr-only"
              />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>

      {input.trim() && !parts && (
        <p className={errorClass}>
          Invalid number: found {digitCount} digit{digitCount === 1 ? "" : "s"}. Enter 10 digits,
          or 11 starting with 1.
        </p>
      )}

      {result && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <output className="font-mono text-xl" aria-live="polite">
            {result}
          </output>
          <CopyButton text={result} className="py-2" />
        </div>
      )}
    </div>
  );
}
