"use client";

import { useCan } from "@/lib/api";
import { useActiveOrganization } from "@/lib/api/organizations/use-active-organization";
import type { AdminNavItem } from "@equipoit4845/admin-shell";
import { createElement } from "react";

import { NavIcon } from "./nav-icons";
import type { SuperadminViewMode } from "./superadmin-mode-context";

/**
 * Builds `AdminFrame`'s `navItems` already filtered — the component never
 * sees a permission code, only the resulting list. `useCan` is a UX-only
 * gate (kernel-openapi.yaml §19); the Kernel still enforces every mutation
 * server-side regardless of what's visible here.
 */
export function useShellNavItems(
  activePath: string,
  superadminMode: SuperadminViewMode = "CLUB",
): AdminNavItem[] {
  const { organizationId } = useActiveOrganization();
  // District assignments are scoped to ORGANIZATION_TREE.  Evaluating them
  // at platform scope makes a valid RDR look like a user without access.
  const scope = organizationId
    ? { scopeType: "ORGANIZATION" as const, scopeId: organizationId }
    : undefined;
  const canReadOrganizations = useCan("kernel.organization.read", scope);
  const canReadPersons = useCan("kernel.person.read", scope);
  const canReadMemberships = useCan("kernel.membership.read", scope);
  const canReadApplications = useCan(
    "kernel.application.read.self",
    scope,
  );
  const canReadTransfers = useCan("kernel.transfer.read.self", scope);
  const canReadAppointments = useCan("kernel.appointment.read", scope);
  const canReadPositions = useCan("kernel.position.read", scope);
  const canReadPeriods = useCan("kernel.period.read", scope);
  const isDistrictAdminView = superadminMode === "ADMIN";

  const items: AdminNavItem[] = [
    { label: "Inicio", href: "/dashboard", icon: createElement(NavIcon, { name: "home" }) },
  ];

  if (canReadOrganizations && isDistrictAdminView) {
    // The Kernel aggregate remains Organization, but this installation has
    // one district and its day-to-day unit is the club.
    items.push({ label: "Clubes", href: "/organizations", icon: createElement(NavIcon, { name: "clubs" }) });
  }
  if (canReadPersons && isDistrictAdminView) {
    items.push({ label: superadminMode === "ADMIN" ? "Usuarios" : "Personas", href: "/persons", icon: createElement(NavIcon, { name: "people" }) });
  }
  if (canReadMemberships) {
    items.push({ label: "Socios", href: "/memberships", icon: createElement(NavIcon, { name: "members" }) });
  }
  if (canReadAppointments) {
    items.push({ label: "Autoridades", href: "/authorities", icon: createElement(NavIcon, { name: "authorities" }) });
  }
  if (canReadPositions) {
    items.push({ label: "Cargos", href: "/positions", icon: createElement(NavIcon, { name: "authorities" }) });
  }
  if (canReadPeriods) {
    items.push({ label: "Períodos", href: "/periods", icon: createElement(NavIcon, { name: "periods" }) });
  }
  if (canReadApplications) {
    items.push({ label: "Solicitudes", href: "/applications", icon: createElement(NavIcon, { name: "applications" }) });
  }
  if (canReadTransfers) {
    items.push({ label: "Transferencias", href: "/transfers", icon: createElement(NavIcon, { name: "transfers" }) });
  }

  return items.map((item) => ({ ...item, active: item.href === activePath }));
}
