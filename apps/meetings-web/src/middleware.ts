import { NextResponse, type NextRequest } from 'next/server';

import { getMiRotaract, SESSION_COOKIE } from '@/lib/server/mirotaract';

/**
 * Every app screen requires a Mi Rotaract session (including the projector,
 * as in legacy where it needed a logged-in socket). Without one, go through
 * "Ingresar con Mi Rotaract" and come back. Roles are checked client-side
 * against `GET /meetings-api/auth/me`, and authoritatively by meetings-api.
 */
export async function middleware(request: NextRequest) {
  let authenticated: boolean;
  try {
    authenticated = (await getMiRotaract().getSession(request.cookies)) !== null;
  } catch {
    // Misconfigured env: don't loop; the token route will fail loudly.
    authenticated = request.cookies.has(SESSION_COOKIE);
  }
  if (authenticated) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  // Relative Location: behind cloudflared `request.url` may carry the
  // internal host, the browser resolves this against the public one.
  const location = `/auth/login?returnTo=${encodeURIComponent(`${pathname}${search}`)}`;
  return new NextResponse(null, { status: 307, headers: { location } });
}

export const config = {
  matcher: ['/meetings/:path*', '/admin/:path*', '/history/:path*', '/delegaciones/:path*'],
};
