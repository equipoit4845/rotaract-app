import type { PeriodStatus } from "@/lib/api";

/**
 * Mirrors the real state machine (kernel-spec.md §7.4) exactly:
 * `DRAFT -> SCHEDULED`, `DRAFT -> CANCELLED`, `SCHEDULED -> ACTIVE`,
 * `SCHEDULED -> CANCELLED`, `ACTIVE -> CLOSED`. `CLOSED` and `CANCELLED`
 * are both terminal — nothing transitions out of either. This only
 * decides which action the UI *offers*; the Kernel re-validates every
 * transition server-side regardless (409 `KERNEL_INVALID_TRANSITION`
 * otherwise).
 */
export function canEditDraftPeriod(status: PeriodStatus): boolean {
  return status === "DRAFT";
}

export function canSchedulePeriod(status: PeriodStatus): boolean {
  return status === "DRAFT";
}

export function canActivatePeriod(status: PeriodStatus): boolean {
  return status === "SCHEDULED";
}

export function canClosePeriod(status: PeriodStatus): boolean {
  return status === "ACTIVE";
}

export function canCancelPeriod(status: PeriodStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED";
}
