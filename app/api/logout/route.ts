import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

// Submitted by a plain <form method="post">, so it works without JavaScript.
export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
