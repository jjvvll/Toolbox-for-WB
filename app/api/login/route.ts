import { NextResponse } from "next/server";
import { AUTH_COOKIE, SESSION_SECONDS, authConfig, createToken, safeEqual } from "@/lib/auth";

const FAILED_LOGIN_DELAY_MS = 1000;

export async function POST(request: Request) {
  const config = authConfig();
  if (!config) {
    return Response.json(
      { error: "Login is not configured: set SITE_PASSWORD and AUTH_SECRET on the server." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await safeEqual(password, config.password, config.secret))) {
    // Slow down guessing; the jitter hides any timing differences.
    await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS + Math.random() * 500));
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await createToken(config.secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return res;
}
