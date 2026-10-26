"use client";

import { useState } from "react";
import { errorClass, inputClass, primaryButtonClass } from "@/components/ui";

/** Only allow same-site relative paths as post-login destinations. */
function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Sign-in failed (${res.status}).`);
      }
      // Full navigation so the proxy sees the new cookie on every request.
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(safeNextPath(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label htmlFor="password" className="sr-only">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className={inputClass}
      />
      {error && <p className={errorClass}>{error}</p>}
      <button type="submit" disabled={loading || !password} className={primaryButtonClass}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
