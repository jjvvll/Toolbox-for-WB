"use client";

import { useEffect, useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        )
      }
      className={`rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900 ${className}`}
    >
      {state === "copied" ? "Copied!" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}
