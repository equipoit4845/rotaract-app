import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu, AppsMenu } from "@/components/layout/HeaderMenus";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

/**
 * The top bar, Gmail-style: logo on the left, `center` (the inbox search) in
 * the middle, then theme, the district apps and the account menu. Without
 * `account` (screens before the mailbox loads) a plain "Salir" stays.
 */
export function AppHeader({
  leading,
  center,
  account,
}: {
  leading?: ReactNode;
  center?: ReactNode;
  account?: { name: string | null; detail?: string };
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
      <span className="flex shrink-0 items-center gap-2 lg:w-[13rem]">
        {leading}
        <Link href="/bandeja" className="flex items-center gap-3">
          <Logo size={28} />
          <span className="hidden text-sm font-semibold text-foreground sm:inline">
            Correo Distrital
          </span>
        </Link>
      </span>
      <div className="min-w-0 flex-1">{center}</div>
      <span className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <AppsMenu />
        {account ? (
          <AccountMenu name={account.name} detail={account.detail} />
        ) : (
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Salir
            </button>
          </form>
        )}
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
