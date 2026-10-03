import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/layout";
import { Card, CardContent } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for every public/unauthenticated screen (login, register,
 * invite acceptance, forgot/reset password). Deliberately not `AppShell`
 * — that component is scoped to the authenticated app (sidebar nav,
 * organization switcher, period indicator), none of which makes sense
 * before there's a session (product spec §12).
 *
 * Two columns from `lg`: a brand panel on the left, the form on the right.
 * `footer` holds secondary links (e.g. "¿Olvidaste tu contraseña?").
 */
export function AuthShell({
  title,
  description,
  footer,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10 blur-2xl"
        />
        <Link href="/" aria-label="Mi Rotaract" className="relative w-fit">
          <Logo size={56} tone="current" aria-hidden />
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            La gestión de tu club, clara y conectada.
          </p>
          <p className="mt-4 text-primary-foreground/80">
            Organizaciones, personas, membresías, autoridades y períodos del
            Distrito 4845 en un solo lugar.
          </p>
        </div>
        <p className="relative text-sm font-medium text-primary-foreground/80">
          Mi Rotaract
        </p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <Link
            href="/"
            aria-label="Mi Rotaract"
            className="flex items-center lg:hidden"
          >
            <Logo size={32} aria-hidden />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-sm">
            <Card className="shadow-sm">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {title}
                  </h1>
                  {description ? (
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>
                {children}
              </CardContent>
            </Card>
            {footer ? (
              <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
