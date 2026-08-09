"use client";

import type { AppointmentStatus } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const STATUSES: readonly AppointmentStatus[] = [
  "NOMINATED",
  "ELECTED",
  "ACTIVE",
  "ENDED",
  "REVOKED",
];

function readStatus(value: string | null): AppointmentStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as AppointmentStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?organization=&period=&position=&status=`)
 * — never localStorage, `router.replace` (not `push`) so a filter change
 * doesn't spam browser history. Mirrors `useMembershipListFilters`:
 * `organization` is read as an explicit opt-in scope, the caller decides
 * the `activeOrganizationId` fallback.
 *
 * `status` maps 1:1 to `listAppointments`'s single `status` query param
 * (`kernel-openapi.yaml`) — the Kernel does not accept a set of statuses in
 * one request, so "Actuales/Futuras/Históricas" as originally drafted in
 * docs/09 (a combined NOMINATED+ELECTED "futuras" group) is not something
 * this single filter can express in one request. This UI exposes the real
 * five-way status filter instead; the correction is noted in docs/09 under
 * US-APP-02.
 */
export function useAppointmentListFilters(): {
  organizationId: string | undefined;
  periodId: string | undefined;
  positionCode: string | undefined;
  status: AppointmentStatus | undefined;
  setOrganizationId: (value: string | undefined) => void;
  setPeriodId: (value: string | undefined) => void;
  setPositionCode: (value: string | undefined) => void;
  setStatus: (value: AppointmentStatus | undefined) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationId = useMemo(
    () => searchParams.get("organization") ?? undefined,
    [searchParams],
  );
  const periodId = useMemo(
    () => searchParams.get("period") ?? undefined,
    [searchParams],
  );
  const positionCode = useMemo(
    () => searchParams.get("position") ?? undefined,
    [searchParams],
  );
  const status = useMemo(
    () => readStatus(searchParams.get("status")),
    [searchParams],
  );

  const update = useCallback(
    (
      key: "organization" | "period" | "position" | "status",
      value: string | undefined,
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const queryString = next.toString();
      router.replace(
        queryString ? `/appointments?${queryString}` : "/appointments",
      );
    },
    [router, searchParams],
  );

  return {
    organizationId,
    periodId,
    positionCode,
    status,
    setOrganizationId: (value) => update("organization", value),
    setPeriodId: (value) => update("period", value),
    setPositionCode: (value) => update("position", value),
    setStatus: (value) => update("status", value),
  };
}
