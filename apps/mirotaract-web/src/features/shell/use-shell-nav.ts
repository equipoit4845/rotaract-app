"use client";

import { useCan } from "@/lib/api";
import type { AdminNavItem } from "@equipoit4845/admin-shell";

/**
 * Builds `AdminFrame`'s `navItems` already filtered — the component never
 * sees a permission code, only the resulting list. `useCan` is a UX-only
 * gate (kernel-openapi.yaml §19); the Kernel still enforces every mutation
 * server-side regardless of what's visible here.
 */
export function useShellNavItems(activePath: string): AdminNavItem[] {
  const canReadOrganizations = useCan("kernel.organization.read");
  const canReadPersons = useCan("kernel.person.read");
  const canReadMemberships = useCan("kernel.membership.read");
  const canReadApplications = useCan("kernel.application.read.self");
  const canReadTransfers = useCan("kernel.transfer.read.self");
  const canReadAppointments = useCan("kernel.appointment.read");
  const canReadPeriods = useCan("kernel.period.read");

  const items: AdminNavItem[] = [{ label: "Panel", href: "/dashboard" }];

  if (canReadOrganizations) {
    items.push({ label: "Organizaciones", href: "/organizations" });
  }
  if (canReadPersons) {
    items.push({ label: "Personas", href: "/persons" });
  }
  if (canReadMemberships) {
    items.push({ label: "Membresías", href: "/memberships" });
  }
  if (canReadAppointments) {
    items.push({ label: "Autoridades", href: "/authorities" });
  }
  if (canReadPeriods) {
    items.push({ label: "Períodos", href: "/periods" });
  }
  if (canReadApplications) {
    items.push({ label: "Solicitudes", href: "/applications" });
  }
  if (canReadTransfers) {
    items.push({ label: "Transferencias", href: "/transfers" });
  }

  return items.map((item) => ({ ...item, active: item.href === activePath }));
}
