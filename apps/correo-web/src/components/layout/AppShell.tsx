import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/** Logo, theme and sign out; `leading` goes before the logo (mobile menu). */
export function AppHeader({ leading }: { leading?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-3">
      <span className="flex items-center gap-2">
        {leading}
        <Link href="/bandeja" className="flex items-center gap-3">
          <Logo size={28} />
          <span className="text-sm font-semibold text-foreground">
            Correo Distrital
          </span>
        </Link>
      </span>
      <span className="flex items-center gap-1">
        <ThemeToggle />
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Salir
          </button>
        </form>
      </span>
    </header>
  );
}

/** Header and a centered column, for the screens outside the inbox. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
