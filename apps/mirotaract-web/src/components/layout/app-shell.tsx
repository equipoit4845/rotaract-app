"use client";

import { ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button, Separator } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Navigation entry for the sidebar. An entry with `children` renders as a
 * collapsible group (it never navigates by itself); `active` is resolved
 * by the caller so this component stays free of routing rules.
 */
export type AdminNavItem = {
  label: string;
  href?: string;
  icon?: ReactNode;
  active?: boolean;
  children?: AdminNavItem[];
};

type AppShellProps = {
  brand?: ReactNode;
  navItems: AdminNavItem[];
  /** Section title shown in the top bar (usually the active nav label). */
  title?: ReactNode;
  backHref?: string;
  backLabel?: string;
  organizationSwitcher?: ReactNode;
  periodIndicator?: ReactNode;
  user?: ReactNode;
  sidebarFooter?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Application frame ported from the legacy Mi Rotaract web: fixed 14rem
 * sidebar with collapsible groups, sticky 3.5rem top bar, centered content
 * capped at max-w-7xl. Presentational only — it receives resolved props.
 */
export function AppShell({
  brand,
  navItems,
  title,
  backHref,
  backLabel = "Volver",
  organizationSwitcher,
  periodIndicator,
  user,
  sidebarFooter,
  actions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
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
          "fixed inset-y-0 left-0 z-30 w-56 shrink-0 transition-transform md:sticky md:top-0 md:z-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
            <div onClick={closeMobile}>{brand}</div>
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
            <NavLinks items={navItems} onNavigate={closeMobile} />
          </div>
          {sidebarFooter ? (
            <div className="border-t border-sidebar-border p-3">
              {sidebarFooter}
            </div>
          ) : null}
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={closeMobile}
          aria-hidden
        />
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
              {title ? (
                <span className="truncate text-sm font-semibold text-foreground">
                  {title}
                </span>
              ) : null}
              {organizationSwitcher || periodIndicator ? (
                <div className="hidden min-w-0 items-center gap-3 sm:flex">
                  {title ? (
                    <Separator orientation="vertical" className="h-4" />
                  ) : null}
                  {organizationSwitcher}
                  {periodIndicator}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              {user}
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

const linkBase =
  "flex items-center gap-2 rounded-lg text-sm transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0";
const linkIdle =
  "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const linkActive = "bg-primary/10 text-primary";

function hasActiveChild(item: AdminNavItem): boolean {
  return item.children?.some((child) => child.active) ?? false;
}

function NavLinks({
  items,
  onNavigate,
}: {
  items: AdminNavItem[];
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        if (item.children?.length) {
          const childActive = hasActiveChild(item);
          const isOpen = childActive || (expanded[item.label] ?? false);
          return (
            <div key={item.label} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [item.label]: !isOpen,
                  }))
                }
                aria-expanded={isOpen}
                className={cn(
                  linkBase,
                  "w-full px-3 py-2 text-left font-medium",
                  childActive ? linkActive : linkIdle,
                )}
              >
                {item.icon}
                <span className="min-w-0 flex-1">{item.label}</span>
                <ChevronRight
                  className={cn(
                    "transition-transform",
                    isOpen ? "rotate-90" : "rotate-0",
                  )}
                  aria-hidden
                />
              </button>
              {isOpen ? (
                <div className="ml-1 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                  {item.children.map((child) =>
                    child.href ? (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={child.active ? "page" : undefined}
                        className={cn(
                          linkBase,
                          "px-2 py-1.5",
                          child.active
                            ? cn(linkActive, "font-medium")
                            : linkIdle,
                        )}
                      >
                        {child.icon}
                        {child.label}
                      </Link>
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
          );
        }

        if (!item.href) return null;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              linkBase,
              "px-3 py-2 font-medium",
              item.active ? linkActive : linkIdle,
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
