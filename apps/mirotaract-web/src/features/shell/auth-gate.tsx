"use client";

import { useAuthStatus } from "@/lib/api";
import { DataState } from "@mirotaract/admin-shell";
import { Spinner } from "@mirotaract/ui";
import type { ReactNode } from "react";

/**
 * Tri-state gate around any authenticated shell content. `BOOTSTRAPPING`
 * covers the window before `session-bootstrap.tsx`'s silent refresh
 * resolves — rendering a login prompt during that window would flash a
 * false "signed out" state on every reload. Building an actual sign-in
 * form is a separate, later feature; `UNAUTHENTICATED` here is only a
 * placeholder message.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();

  if (status === "BOOTSTRAPPING") {
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

  if (status === "UNAUTHENTICATED") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          padding: "var(--mr-space-6)",
        }}
      >
        <DataState
          kind="empty"
          title="Sesión requerida"
          description="Iniciá sesión para continuar."
        />
      </div>
    );
  }

  return <>{children}</>;
}
