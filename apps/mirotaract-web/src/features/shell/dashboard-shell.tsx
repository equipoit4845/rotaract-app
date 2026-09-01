"use client";

import {
  useActiveOrganization,
  useCurrentPeriod,
  useCurrentUser,
} from "@/lib/api";
import {
  AdminFrame,
  Avatar,
  DataState,
  OrganizationSwitcher,
  PeriodIndicator,
} from "@equipoit4845/admin-shell";
import { Logo } from "@equipoit4845/icons";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "./account-menu";
import { ActiveOrganizationProvider } from "./active-organization-context";
import { AuthGate } from "./auth-gate";
import { toVisualPeriodStatus } from "./period-status";
import { useOrganizationOptions } from "./use-organization-options";
import { useShellNavItems } from "./use-shell-nav";
import {
  SuperadminModeProvider,
  useSuperadminMode,
} from "./superadmin-mode-context";
import { SuperadminModeSwitcher } from "./superadmin-mode-switcher";

/**
 * The one place Kernel hooks meet `AdminFrame`. Everything below this
 * component's own body is resolved-props-only: `AdminFrame` never calls a
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
      <AdminFrame
      brand={
        <Link href="/dashboard" className="mr-workspace-brand">
          <Logo size={20} />
          <span>Mi Rotaract</span>
        </Link>
      }
      navItems={navItems}
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
        superadminMode.isSuperadmin ? (
          <SuperadminModeSwitcher
            mode={superadminMode.mode}
            onChange={superadminMode.setMode}
          />
        ) : undefined
      }
      sidebarFooter={
        currentUser ? (
          <div className="mr-workspace-user">
            <Avatar name={currentUser.displayName} size="sm" />
            <div style={{ minWidth: 0 }}>
              <span className="mr-workspace-user__name">
                {currentUser.displayName}
              </span>
              <span className="mr-workspace-user__hint">
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
              action={<Link href="/join-club">Buscar mi club</Link>}
            />
          )}
        </ActiveOrganizationProvider>
      </AdminFrame>
    </SuperadminModeProvider>
  );
}
