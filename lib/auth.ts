// Single-password site auth: a stateless cookie of "<expiry>.<HMAC-SHA256 signature>".
// Uses Web Crypto only, so it runs in both the proxy and route handlers.

export const AUTH_COOKIE = "site_auth";
export const SESSION_SECONDS = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Both env vars must be set; otherwise nobody can log in (fail closed). */
export function authConfig() {
  const password = process.env.SITE_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  return password && secret ? { password, secret } : null;
}

export async function createToken(secret: string): Promise<string> {
  const payload = `v1.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  const match = token?.match(/^(v1\.(\d+))\.([\w-]+)$/);
  if (!match) return false;
  const [, payload, expiry, sigText] = match;
  if (Number(expiry) * 1000 < Date.now()) return false;
  const sig = fromBase64Url(sigText);
  if (!sig) return false;
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(payload));
}

/** Constant-time string comparison: compares HMACs of both values, not the values. */
export async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const key = await hmacKey(secret);
  const sigA = await crypto.subtle.sign("HMAC", key, encoder.encode(a));
  return crypto.subtle.verify("HMAC", key, sigA, encoder.encode(b));
}

