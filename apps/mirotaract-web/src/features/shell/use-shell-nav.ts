"use client";

import { useCan } from "@/lib/api";
import type { AdminNavItem } from "@mirotaract/admin-shell";

/**
 * Builds `AdminFrame`'s `navItems` already filtered — the component never
 * sees a permission code, only the resulting list. `useCan` is a UX-only
 * gate (kernel-openapi.yaml §19); the Kernel still enforces every mutation
 * server-side regardless of what's visible here.
 *
 * Item set is intentionally placeholder/generic — this is shell
 * validation, not a business feature. `kernel.organization.manage` follows
 * the real `<namespace>.<resource>.<action>` permission-code format
 * (invariant 6.7.1) but isn't a claim that this exact code exists in seed
 * data; the point is proving the filtering mechanism, not shipping a real
 * admin section.
 */
export function useShellNavItems(activePath: string): AdminNavItem[] {
  const canManageOrganization = useCan("kernel.organization.manage");

  const items: AdminNavItem[] = [{ label: "Panel", href: "/dashboard" }];

  if (canManageOrganization) {
    items.push({ label: "Organización", href: "/dashboard/organization" });
  }

  return items.map((item) => ({ ...item, active: item.href === activePath }));
}
