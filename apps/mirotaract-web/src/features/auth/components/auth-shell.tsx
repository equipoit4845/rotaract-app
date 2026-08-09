import { Card, CardContent } from "@equipoit4845/ui";
import { Logo } from "@equipoit4845/icons";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for every public/unauthenticated screen (login, register,
 * invite acceptance, forgot/reset password). Deliberately not `AdminFrame`
 * — that component is scoped to the authenticated app (sidebar nav,
 * organization switcher, period indicator), none of which makes sense
 * before there's a session (product spec §12).
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--mr-space-6)",
        padding: "var(--mr-space-6)",
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--mr-space-2)",
          color: "var(--mr-color-text)",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        <Logo size={28} />
        Mi Rotaract
      </Link>
      <Card style={{ width: "100%", maxWidth: 400 }}>
        <CardContent
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-4)",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h1>
            {description ? (
              <p
                style={{
                  margin: "var(--mr-space-1) 0 0",
                  color: "var(--mr-color-text-muted)",
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
