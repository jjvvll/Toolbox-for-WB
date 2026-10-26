"use client";

import { useEffect, useState } from "react";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";
import { parseDriveFileId } from "@/lib/parse-links";

type Result = { id: string; url: string; ext: string };

export default function DriveThumbnailTool() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Release the previous blob URL whenever the result changes.
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const id = parseDriveFileId(link);
    if (!id) {
      setError("That doesn't look like a Google Drive file link.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/drive-thumbnail?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status}).`);
      }
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      setResult({ id, url: URL.createObjectURL(blob), ext });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 flex max-w-3xl flex-col gap-6">
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://drive.google.com/file/d/FILE_ID/view"
          aria-label="Google Drive link"
          className={inputClass}
        />
        <button type="submit" disabled={loading || !link.trim()} className={primaryButtonClass}>
          {loading ? "Loading…" : "Get thumbnail"}
        </button>
      </form>

      {error && <p className={errorClass}>{error}</p>}

      {result && (
        <figure className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL preview */}
          <img src={result.url} alt="Drive video thumbnail" className="w-full bg-zinc-100 dark:bg-zinc-900" />
          <figcaption className="flex items-center justify-between gap-3 p-3">
            <code className="truncate text-xs text-zinc-500">{result.id}</code>
            <a
              href={result.url}
              download={`drive-${result.id}-thumbnail.${result.ext}`}
              className={primaryButtonClass}
            >
              Download
            </a>
          </figcaption>
        </figure>
      )}
    </div>
  );
}
