"use client";

import type { TransferStatus } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const STATUSES: readonly TransferStatus[] = [
  "REQUESTED",
  "ACCEPTED_BY_DESTINATION",
  "CONFIRMED_BY_ORIGIN",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

function readStatus(value: string | null): TransferStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as TransferStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?membership=&from=&to=&status=`) — never
 * localStorage (product spec §5/§13/§24 — deep links + back/forward must
 * survive). `router.replace` (not `push`) so tweaking a filter doesn't
 * spam the back-button history with one entry per change. Same pattern as
 * `features/memberships/view-models/use-membership-list-filters.ts`,
 * duplicated locally on purpose (product spec §32).
 *
 * `GET /membership-transfers` returns a plain `MembershipTransfer[]` (no
 * pagination — kernel-openapi.yaml), so unlike Memberships this hook has
 * no "which organization is this scoped to" default-fallback story: `from`
 * and `to` are both optional, independent filters, neither one required to
 * render a page.
 */
export function useTransferListFilters(): {
  membershipId: string | undefined;
  fromOrganizationId: string | undefined;
  toOrganizationId: string | undefined;
  status: TransferStatus | undefined;
  setMembershipId: (value: string | undefined) => void;
  setFromOrganizationId: (value: string | undefined) => void;
  setToOrganizationId: (value: string | undefined) => void;
  setStatus: (value: TransferStatus | undefined) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const membershipId = useMemo(
    () => searchParams.get("membership") ?? undefined,
    [searchParams],
  );
  const fromOrganizationId = useMemo(
    () => searchParams.get("from") ?? undefined,
    [searchParams],
  );
  const toOrganizationId = useMemo(
    () => searchParams.get("to") ?? undefined,
    [searchParams],
  );
  const status = useMemo(
    () => readStatus(searchParams.get("status")),
    [searchParams],
  );

  const update = useCallback(
    (
      key: "membership" | "from" | "to" | "status",
      value: string | undefined,
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const queryString = next.toString();
      router.replace(queryString ? `/transfers?${queryString}` : "/transfers");
    },
    [router, searchParams],
  );

  return {
    membershipId,
    fromOrganizationId,
    toOrganizationId,
    status,
    setMembershipId: (value) => update("membership", value),
    setFromOrganizationId: (value) => update("from", value),
    setToOrganizationId: (value) => update("to", value),
    setStatus: (value) => update("status", value),
  };
}
