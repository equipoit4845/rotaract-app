"use client";

import type { PeriodStatus } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const STATUSES: readonly PeriodStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "CLOSED",
  "CANCELLED",
];

function readStatus(value: string | null): PeriodStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as PeriodStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?organization=&status=`) — never
 * localStorage (product spec §5/§13). `router.replace` (not `push`) so
 * tweaking a filter doesn't spam the back-button history with one entry
 * per change.
 *
 * `organization` is read here as an explicit opt-in scope: when present in
 * the URL it wins over `activeOrganizationId`, and once chosen it stays in
 * the URL — this hook never falls back to the active organization itself,
 * that's the caller's job (see `PeriodsListContainer`), same split as
 * `useMembershipListFilters` (Membresías, Fase 4) so this hook can be
 * tested without the Shell's `ActiveOrganizationContext`.
 */
export function usePeriodListFilters(): {
  organizationId: string | undefined;
  status: PeriodStatus | undefined;
  setOrganizationId: (organizationId: string | undefined) => void;
  setStatus: (status: PeriodStatus | undefined) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationId = useMemo(
    () => searchParams.get("organization") ?? undefined,
    [searchParams],
  );
  const status = useMemo(
    () => readStatus(searchParams.get("status")),
    [searchParams],
  );

  const update = useCallback(
    (key: "organization" | "status", value: string | undefined) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const queryString = next.toString();
      router.replace(queryString ? `/periods?${queryString}` : "/periods");
    },
    [router, searchParams],
  );

  return {
    organizationId,
    status,
    setOrganizationId: (value) => update("organization", value),
    setStatus: (value) => update("status", value),
  };
}
