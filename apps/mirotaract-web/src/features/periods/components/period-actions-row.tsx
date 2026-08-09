"use client";

import type { InstitutionalPeriod } from "@/lib/api";

import { ActivatePeriodDialog } from "../forms/activate-period-dialog";
import { CancelPeriodDialog } from "../forms/cancel-period-dialog";
import { ClosePeriodDialog } from "../forms/close-period-dialog";
import { EditDraftPeriodDialog } from "../forms/edit-draft-period-dialog";
import { SchedulePeriodDialog } from "../forms/schedule-period-dialog";

/**
 * Each action gates itself on `useCan()` + the real state machine and
 * renders nothing when not applicable — this row never hardcodes which
 * actions exist, it just lays out whatever the child components decide to
 * render (same pattern as Organizations' `OrganizationActionsRow`).
 */
export function PeriodActionsRow({ period }: { period: InstitutionalPeriod }) {
  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      <EditDraftPeriodDialog period={period} />
      <SchedulePeriodDialog period={period} />
      <ActivatePeriodDialog period={period} />
      <ClosePeriodDialog period={period} />
      <CancelPeriodDialog period={period} />
    </div>
  );
}
