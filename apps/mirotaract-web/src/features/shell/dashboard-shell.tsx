"use client";

import {
  useActiveOrganization,
  useCurrentPeriod,
  useCurrentUser,
} from "@/lib/api";
import {
  AdminFrame,
  Avatar,
  OrganizationSwitcher,
  PeriodIndicator,
} from "@equipoit4845/admin-shell";
import { Logo } from "@equipoit4845/icons";
import type { ReactNode } from "react";

import { AuthGate } from "./auth-gate";
import { toVisualPeriodStatus } from "./period-status";
import { useOrganizationOptions } from "./use-organization-options";
import { useShellNavItems } from "./use-shell-nav";

/**
 * The one place Kernel hooks meet `AdminFrame`. Everything below this
 * component's own body is resolved-props-only: `AdminFrame` never calls a
 * hook, never sees a permission code, never sees a Kernel entity.
 */
export function DashboardShell({
  activePath,
  children,
}: {
  activePath: string;
  children: ReactNode;
}) {
  return (
    <AuthGate>
      <DashboardShellContent activePath={activePath}>
        {children}
      </DashboardShellContent>
    </AuthGate>
  );
}

function DashboardShellContent({
  activePath,
  children,
}: {
  activePath: string;
  children: ReactNode;
}) {
  const { data: currentUser } = useCurrentUser();
  const { organizationId, organization, setActiveOrganizationId } =
    useActiveOrganization();
  const { data: currentPeriod } = useCurrentPeriod(organizationId);
  const { options: organizationOptions } = useOrganizationOptions();
  const navItems = useShellNavItems(activePath);

  return (
    <AdminFrame
      brand={<Logo size={20} />}
      navItems={navItems}
      organizationSwitcher={
        organizationOptions.length > 0 ? (
          <OrganizationSwitcher
            organizations={organizationOptions}
            activeOrganizationId={organizationId ?? ""}
            onSelect={setActiveOrganizationId}
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
          <Avatar name={currentUser.displayName} size="sm" />
        ) : undefined
      }
    >
      {organization ? children : <p>Elegí una organización para continuar.</p>}
    </AdminFrame>
  );
}
