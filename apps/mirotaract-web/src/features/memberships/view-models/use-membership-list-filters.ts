"use client";

import type { MembershipStatus } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const STATUSES: readonly MembershipStatus[] = [
  "PENDING",
  "ACTIVE",
  "ON_LEAVE",
  "INACTIVE",
  "GRADUATED",
  "TRANSFERRED",
];

function readStatus(value: string | null): MembershipStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as MembershipStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?organization=&status=`) — never
 * localStorage (product spec §5/§13/§24 — deep links + back/forward must
 * survive). `router.replace` (not `push`) so tweaking a filter doesn't
 * spam the back-button history with one entry per change.
 *
 * `organization` is read here as an explicit opt-in scope (product spec
 * §6): when present in the URL it wins over `activeOrganizationId`, and
 * once chosen it stays in the URL — this hook never falls back to the
 * active organization itself, that's the caller's job (see
 * `MembershipsListContainer`), so this hook can be tested without the
 * Shell's `ActiveOrganizationContext`.
 */
export function useMembershipListFilters(): {
  organizationId: string | undefined;
  status: MembershipStatus | undefined;
  setOrganizationId: (organizationId: string | undefined) => void;
  setStatus: (status: MembershipStatus | undefined) => void;
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
      router.replace(
        queryString ? `/memberships?${queryString}` : "/memberships",
      );
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
