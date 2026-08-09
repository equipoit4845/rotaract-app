"use client";

import type { ApplicationStatus } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const STATUSES: readonly ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];

function readStatus(value: string | null): ApplicationStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as ApplicationStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?organization=&status=`) — never
 * localStorage, same rule as `features/memberships/view-models/
 * use-membership-list-filters.ts`. `router.replace` (not `push`) so
 * tweaking a filter doesn't spam back-button history.
 *
 * `organization` is read here as an explicit opt-in scope: when present
 * in the URL it wins over `activeOrganizationId`, and this hook never
 * falls back to the active organization itself — that's the caller's job
 * (see `ApplicationsListContainer`), so this hook can be tested without
 * the Shell's `ActiveOrganizationContext`.
 *
 * There is no `setPersonId`/`person` param here on purpose:
 * `listMembershipApplications` only honors the `personId` query filter
 * for an actor with `kernel.application.review` — without that
 * permission the Kernel ignores it and forces the actor's own id
 * (kernel-openapi.yaml, description on the operation). Offering a
 * free-text "person" filter control to every actor would silently do
 * nothing for most of them, so no toolbar control writes it (see
 * docs/09-administrative-web.md, US-SOL-01).
 */
export function useApplicationListFilters(): {
  organizationId: string | undefined;
  status: ApplicationStatus | undefined;
  setOrganizationId: (organizationId: string | undefined) => void;
  setStatus: (status: ApplicationStatus | undefined) => void;
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
        queryString ? `/applications?${queryString}` : "/applications",
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
