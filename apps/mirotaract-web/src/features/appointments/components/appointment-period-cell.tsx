"use client";

import { usePeriod } from "@/lib/api";
import { Skeleton } from "@equipoit4845/ui";
import Link from "next/link";

/**
 * TEMPORARY_BOUNDED_JOIN — `Appointment` only carries `periodId`, never a
 * denormalized period name. Resolved with one bounded request per distinct
 * `periodId` on the current (already bounded, on-screen) list, deduped by
 * TanStack Query — same class as `AppointmentMembershipCell`.
 *
 * Links to `/periods/[periodId]` (Fase 6, cross-feature navigation only —
 * this component still never imports anything from `features/periods/**`).
 */
export function AppointmentPeriodCell({ periodId }: { periodId: string }) {
  const { data: period, isLoading } = usePeriod(periodId);

  if (isLoading) return <Skeleton style={{ height: "1rem", width: "6rem" }} />;
  if (!period) return <span>—</span>;
  return <Link href={`/periods/${periodId}`}>{period.name}</Link>;
}
