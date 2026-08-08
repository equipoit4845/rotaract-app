import "server-only";

import type { NextResponse } from "next/server";

/**
 * Server-only — the `server-only` import above makes any accidental
 * client-component import of this module fail the build. The Kernel
 * refresh token never reaches browser JS or
 * `localStorage` — it's held exclusively in this httpOnly cookie, set and
 * read only by the `/api/auth/*` route handlers (kernel-openapi.yaml
 * `AuthTokens.refreshToken`).
 */
export const REFRESH_COOKIE = "kernel_rt";

export function setRefreshCookie(
  response: NextResponse,
  refreshToken: string,
): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Strict, not Lax: this cookie is only ever read by our own same-origin
    // fetch() calls to /api/auth/refresh — never as part of a cross-site
    // top-level navigation, so Lax's extra allowance buys nothing and Strict
    // is safe.
    sameSite: "strict",
    path: "/api/auth",
  });
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.delete({ name: REFRESH_COOKIE, path: "/api/auth" });
}

export function kernelBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_KERNEL_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_KERNEL_API_URL is not configured");
  return url;
}
