import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authConfig, verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = authConfig();
  const authed =
    !!config && (await verifyToken(request.cookies.get(AUTH_COOKIE)?.value, config.secret));

  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed in: skip the login page.
    if (authed && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (authed) return NextResponse.next();

  // API callers get a status code they can handle instead of an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except build assets and site icons, which the login page itself needs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
