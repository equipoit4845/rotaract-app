"use client";

import { useActiveOrganization } from "@/lib/api";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type ActiveOrganizationValue = ReturnType<typeof useActiveOrganization>;

/**
 * `useActiveOrganization()` keeps its selection in local `useState`, not a
 * shared store — calling it a second time from page content would create a
 * second, independent selection that the header's `OrganizationSwitcher`
 * can't update (§7: "no duplicar organización activa en otro store"). This
 * context re-exposes the single call `DashboardShell` already makes, so
 * page content reads the same value instead of calling the hook again.
 */
const ActiveOrganizationContext = createContext<ActiveOrganizationValue | null>(
  null,
);

export function ActiveOrganizationProvider({
  value,
  children,
}: {
  value: ActiveOrganizationValue;
  children: ReactNode;
}) {
  return (
    <ActiveOrganizationContext.Provider value={value}>
      {children}
    </ActiveOrganizationContext.Provider>
  );
}

export function useActiveOrganizationContext(): ActiveOrganizationValue {
  const ctx = useContext(ActiveOrganizationContext);
  if (!ctx) {
    throw new Error(
      "useActiveOrganizationContext must be used within <DashboardShell>",
    );
  }
  return ctx;
}
