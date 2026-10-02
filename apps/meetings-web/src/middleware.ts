import { NextResponse, type NextRequest } from "next/server";

import { getMiRotaract, SESSION_COOKIE } from "@/lib/server/mirotaract";

/**
 * Every app screen requires a Mi Rotaract session (including the projector,
 * as in legacy where it needed a logged-in socket). Without one, go through
 * "Ingresar con Mi Rotaract" and come back. Roles are checked client-side
 * against `GET /meetings-api/auth/me`, and authoritatively by meetings-api.
 */
export async function middleware(request: NextRequest) {
  let authenticated: boolean;
  try {
    authenticated =
      (await getMiRotaract().getSession(request.cookies)) !== null;
  } catch {
    // Misconfigured env: don't loop; the token route will fail loudly.
    authenticated = request.cookies.has(SESSION_COOKIE);
  }
  if (authenticated) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = publicUrl(request, "/auth/login");
  login.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

/**
 * Next requires absolute redirect URLs in middleware. Behind cloudflared the
 * Node server may see an internal host/protocol, so prefer the forwarded ones.
 */
function publicUrl(request: NextRequest, path: string): URL {
  const url = request.nextUrl.clone();
  // nextUrl normalizes loopback hosts to "localhost"; the Host header keeps
  // what the browser (or cloudflared) actually asked for.
  const host = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  )
    ?.split(",")[0]
    ?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  if (host) {
    url.port = "";
    url.host = host;
  }
  url.pathname = path;
  url.search = "";
  return url;
}

export const config = {
  matcher: [
    "/meetings/:path*",
    "/admin/:path*",
    "/history/:path*",
    "/delegaciones/:path*",
  ],
};
