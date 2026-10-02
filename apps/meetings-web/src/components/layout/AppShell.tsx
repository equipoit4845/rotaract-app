'use client';

import {
  ArrowUpRight,
  Calendar,
  CalendarDays,
  ChevronRight,
  Gem,
  History,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthActions } from '@/context/AuthContext';
import { MIROTARACT_URL } from '@/lib/config';
import { activeNavHref, visibleNav } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const NAV_ICONS: Record<string, ReactNode> = {
  '/meetings': <CalendarDays />,
  '/admin/meetings': <Settings />,
  '/history': <History />,
  '/admin/clubes': <ShieldCheck />,
  '/delegaciones': <UserCheck />,
};

type AppShellProps = {
  title: string;
  user: { id: string; fullName: string; role: string };
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Mi Rotaract application frame (same as apps/mirotaract-web
 * `components/layout/app-shell.tsx`: fixed 14rem sidebar with collapsible
 * groups, sticky 3.5rem top bar, content capped at max-w-7xl) with the
 * legacy meetings `AppShell` props (`title`, `user`, `backHref`).
 */
export function AppShell({
  title,
  user,
  backHref,
  backLabel = 'Volver',
  actions,
  children,
  className,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className={cn('flex min-h-screen bg-background text-foreground', className)}>
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-2.5 z-20 md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </Button>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-56 shrink-0 transition-transform md:sticky md:top-0 md:z-0 md:h-screen md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
            <Link
              href="/meetings"
              onClick={closeMobile}
              className="flex items-center gap-2 font-semibold text-sidebar-foreground transition-colors hover:text-primary"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Gem aria-label="Mi Rotaract" size={16} strokeWidth={1.8} />
              </span>
              <span>Mi Rotaract</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 md:hidden"
              onClick={closeMobile}
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <SidebarNav role={user.role} onNavigate={closeMobile} />
          </div>
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-2 px-1">
              <InitialAvatar name={user.fullName} />
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium">{user.fullName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">Distrito 4845</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={closeMobile} aria-hidden />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 h-14 border-b border-border bg-background/95 px-4 pl-14 backdrop-blur md:pl-6">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {backHref ? (
                <>
                  <Link
                    href={backHref}
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronRight className="size-4 rotate-180" aria-hidden />
                    {backLabel}
                  </Link>
                  <Separator orientation="vertical" className="h-4" />
                </>
              ) : null}
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <ThemeToggle />
              <AccountMenu fullName={user.fullName} />
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

function InitialAvatar({ name }: { name: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {initialsOf(name)}
    </span>
  );
}

function AccountMenu({ fullName }: { fullName: string }) {
  const { logout } = useAuthActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de ${fullName}`}
          className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <InitialAvatar name={fullName} />
          <span className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline">{fullName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={MIROTARACT_URL}>
            <ArrowUpRight />
            Ir a Mi Rotaract
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const linkBase =
  'flex items-center gap-2 rounded-lg text-sm transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0';
const linkIdle = 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const linkActive = 'bg-primary/10 text-primary';

function SidebarNav({ role, onNavigate }: { role: string; onNavigate: () => void }) {
  const pathname = usePathname() ?? '';
  const entries = visibleNav(role);
  const active = activeNavHref(pathname, entries);
  const [open, setOpen] = useState(true);

  return (
    <nav className="flex flex-col gap-0.5">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(linkBase, 'w-full px-3 py-2 text-left font-medium', active ? linkActive : linkIdle)}
        >
          <Calendar />
          <span className="min-w-0 flex-1">Reuniones</span>
          <ChevronRight className={cn('transition-transform', open ? 'rotate-90' : 'rotate-0')} aria-hidden />
        </button>
        {open ? (
          <div className="ml-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
            {entries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={onNavigate}
                aria-current={entry.href === active ? 'page' : undefined}
                className={cn(
                  linkBase,
                  'px-2 py-1.5',
                  entry.href === active ? cn(linkActive, 'font-medium') : linkIdle,
                )}
              >
                {NAV_ICONS[entry.href]}
                {entry.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <a href={MIROTARACT_URL} className={cn(linkBase, linkIdle, 'mt-3 px-3 py-2 font-medium')}>
        <ArrowUpRight />
        Volver a Mi Rotaract
      </a>
    </nav>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-32" />
        </div>
      </header>
      <main className="p-4 md:p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </main>
    </div>
  );
}
