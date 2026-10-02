"use client";

import {
  useActiveOrganization,
  useCurrentPeriod,
  useCurrentUser,
} from "@/lib/api";
import {
  AppShell,
  Avatar,
  DataState,
  OrganizationSwitcher,
  PeriodIndicator,
} from "@/components/layout";
import { Logo } from "@/components/brand";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "./account-menu";
import { ActiveOrganizationProvider } from "./active-organization-context";
import { AuthGate } from "./auth-gate";
import { toVisualPeriodStatus } from "./period-status";
import { useOrganizationOptions } from "./use-organization-options";
import { findActiveNavLabel, useShellNavItems } from "./use-shell-nav";
import {
  SuperadminModeProvider,
  useSuperadminMode,
} from "./superadmin-mode-context";
import { SuperadminModeSwitcher } from "./superadmin-mode-switcher";
import { ThemeToggle } from "@/components/layout";

/**
 * The one place Kernel hooks meet `AppShell`. Everything below this
 * component's own body is resolved-props-only: `AppShell` never calls a
 * hook, never sees a permission code, never sees a Kernel entity.
 */
export function DashboardShell({
  activePath,
  children,
  allowWithoutOrganization = false,
}: {
  activePath: string;
  children: ReactNode;
  /** Onboarding is the only authenticated flow before a person is a club member. */
  allowWithoutOrganization?: boolean;
}) {
  return (
    <AuthGate>
      <DashboardShellContent
        activePath={activePath}
        allowWithoutOrganization={allowWithoutOrganization}
      >
        {children}
      </DashboardShellContent>
    </AuthGate>
  );
}

function DashboardShellContent({
  activePath,
  children,
  allowWithoutOrganization,
}: {
  activePath: string;
  children: ReactNode;
  allowWithoutOrganization: boolean;
}) {
  const { data: currentUser } = useCurrentUser();
  const superadminMode = useSuperadminMode(
    currentUser?.platformRole === "SUPERADMIN",
  );
  const activeOrganization = useActiveOrganization();
  const { organizationId, organization } = activeOrganization;
  const { data: currentPeriod } = useCurrentPeriod(organizationId);
  const { options: organizationOptions } = useOrganizationOptions();
  const navItems = useShellNavItems(activePath, superadminMode.mode);

  return (
    <SuperadminModeProvider value={superadminMode}>
      <AppShell
        brand={
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-sidebar-foreground transition-colors hover:text-primary"
          >
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Logo size={16} />
            </span>
            <span>Mi Rotaract</span>
          </Link>
        }
        navItems={navItems}
        title={findActiveNavLabel(navItems)}
        organizationSwitcher={
          organizationOptions.length > 0 ? (
            <OrganizationSwitcher
              organizations={organizationOptions}
              activeOrganizationId={organizationId ?? ""}
              onSelect={activeOrganization.setActiveOrganizationId}
            />
          ) : undefined
        }
        periodIndicator={
          currentPeriod ? (
            <PeriodIndicator
              label={currentPeriod.name}
              status={toVisualPeriodStatus(currentPeriod.status)}
            />
          ) : undefined
        }
        user={
          currentUser ? (
            <AccountMenu displayName={currentUser.displayName} />
          ) : undefined
        }
        actions={
          <>
            {superadminMode.isSuperadmin ? (
              <SuperadminModeSwitcher
                mode={superadminMode.mode}
                onChange={superadminMode.setMode}
              />
            ) : null}
            <ThemeToggle />
          </>
        }
        sidebarFooter={
          currentUser ? (
            <div className="flex items-center gap-2 px-1">
              <Avatar name={currentUser.displayName} size="sm" />
              <div className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {currentUser.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Distrito 4845
                </span>
              </div>
            </div>
          ) : undefined
        }
      >
        <ActiveOrganizationProvider value={activeOrganization}>
          {organization || allowWithoutOrganization ? (
            children
          ) : (
            <DataState
              kind="empty"
              title="Todavía no pertenecés a un club"
              description="Buscá tu club y enviá una solicitud. La presidencia del club la revisará antes de habilitar tu espacio de socio."
              action={
                <Link
                  href="/join-club"
                  className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Buscar mi club
                </Link>
              }
            />
          )}
        </ActiveOrganizationProvider>
      </AppShell>
    </SuperadminModeProvider>
  );
}
