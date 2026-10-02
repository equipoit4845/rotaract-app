"use client";

import { useCan } from "@/lib/api";
import { useActiveOrganization } from "@/lib/api/organizations/use-active-organization";
import type { AdminNavItem } from "@/components/layout";
import {
  ArrowLeftRight,
  Award,
  Blocks,
  Building2,
  CalendarRange,
  FileText,
  Home,
  Landmark,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

import type { SuperadminViewMode } from "./superadmin-mode-context";

type NavEntry = {
  label: string;
  href?: string;
  icon: LucideIcon;
  /** Extra sections that should highlight this entry (detail routes). */
  alsoActiveFor?: string[];
  children?: NavEntry[];
};

/**
 * Builds `AppShell`'s `navItems` already filtered and grouped — the
 * component never sees a permission code, only the resulting list. `useCan`
 * is a UX-only gate (kernel-openapi.yaml §19); the Kernel still enforces
 * every mutation server-side regardless of what's visible here.
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
  const canReadApplications = useCan("kernel.application.read.self", scope);
  const canReadTransfers = useCan("kernel.transfer.read.self", scope);
  const canReadAppointments = useCan("kernel.appointment.read", scope);
  const canReadPositions = useCan("kernel.position.read", scope);
  const canReadPeriods = useCan("kernel.period.read", scope);
  const canReadApps = useCan("kernel.app.read", scope);
  const isDistrictAdminView = superadminMode === "ADMIN";

  const district: NavEntry[] = [];
  if (canReadOrganizations && isDistrictAdminView) {
    // The Kernel aggregate remains Organization, but this installation has
    // one district and its day-to-day unit is the club.
    district.push({ label: "Clubes", href: "/organizations", icon: Building2 });
  }
  if (canReadPersons && isDistrictAdminView) {
    district.push({ label: "Usuarios", href: "/persons", icon: UserCog });
  }
  if (canReadApps && isDistrictAdminView) {
    district.push({ label: "Apps", href: "/developer/apps", icon: Blocks });
  }

  const club: NavEntry[] = [];
  if (canReadMemberships) {
    club.push({ label: "Socios", href: "/memberships", icon: Users });
  }
  if (canReadAppointments) {
    club.push({
      label: "Autoridades",
      href: "/authorities",
      icon: ShieldCheck,
      alsoActiveFor: ["/appointments"],
    });
  }
  if (canReadPositions) {
    club.push({ label: "Cargos", href: "/positions", icon: Award });
  }
  if (canReadPeriods) {
    club.push({ label: "Períodos", href: "/periods", icon: CalendarRange });
  }

  const procedures: NavEntry[] = [];
  if (canReadApplications) {
    procedures.push({
      label: "Solicitudes",
      href: "/applications",
      icon: FileText,
    });
  }
  if (canReadTransfers) {
    procedures.push({
      label: "Transferencias",
      href: "/transfers",
      icon: ArrowLeftRight,
    });
  }

  const entries: NavEntry[] = [
    { label: "Inicio", href: "/dashboard", icon: Home },
  ];
  if (district.length) {
    entries.push({ label: "Distrito", icon: Landmark, children: district });
  }
  if (club.length) {
    entries.push({ label: "Mi club", icon: Building2, children: club });
  }
  if (procedures.length) {
    entries.push({ label: "Trámites", icon: FileText, children: procedures });
  }

  return entries.map((entry) => toNavItem(entry, activePath));
}

function toNavItem(entry: NavEntry, activePath: string): AdminNavItem {
  return {
    label: entry.label,
    href: entry.href,
    icon: createElement(entry.icon, { "aria-hidden": true }),
    active:
      entry.href === activePath ||
      (entry.alsoActiveFor?.includes(activePath) ?? false),
    children: entry.children?.map((child) => toNavItem(child, activePath)),
  };
}

/** Label of the active entry, used as the top bar's section title. */
export function findActiveNavLabel(items: AdminNavItem[]): string | undefined {
  for (const item of items) {
    if (item.active) return item.label;
    const child = item.children && findActiveNavLabel(item.children);
    if (child) return child;
  }
  return undefined;
}
