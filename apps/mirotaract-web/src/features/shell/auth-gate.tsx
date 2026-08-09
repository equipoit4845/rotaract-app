"use client";

import { useAuthStatus } from "@/lib/api";
import { Spinner } from "@equipoit4845/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";

function AuthGateFallback() {
  return (
    <div
      role="status"
      aria-label="Restaurando sesión"
      style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
    >
      <Spinner size={28} label="Restaurando sesión" />
    </div>
  );
}

/**
 * Tri-state gate around any authenticated shell content. `BOOTSTRAPPING`
 * covers the window before `session-bootstrap.tsx`'s silent refresh
 * resolves — rendering a login redirect during that window would bounce an
 * already-signed-in user through `/login` on every reload (product spec
 * §17/§25/§39/§40). `UNAUTHENTICATED` redirects to `/login?next=<ruta
 * actual>` (querystring included, so filters survive the round trip) —
 * this fires for an explicit logout, a session that never existed, and a
 * refresh that ultimately failed (`refresh-manager.ts` calls
 * `tokenManager.clearSession()`, which flips this same status), so
 * "expired mid-use" and "never logged in" both land here instead of
 * leaving stale admin content on screen.
 *
 * `useSearchParams` requires a Suspense boundary during static prerendering
 * (Next.js), so the actual gate logic lives in `AuthGateInner` — the
 * fallback it shows while suspended is the same spinner used once the
 * status resolves to non-`AUTHENTICATED`, so there's no visible seam.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AuthGateFallback />}>
      <AuthGateInner>{children}</AuthGateInner>
    </Suspense>
  );
}

function AuthGateInner({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const currentPath = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    if (status === "UNAUTHENTICATED") {
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    }
  }, [status, currentPath, router]);

  if (status !== "AUTHENTICATED") {
    return <AuthGateFallback />;
  }

  return <>{children}</>;
}
