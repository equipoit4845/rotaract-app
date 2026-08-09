import type { ApplicationStatus } from "@/lib/api";

/**
 * Mirrors the real state machine (kernel-spec.md §7.6) exactly:
 *
 *   DRAFT     -> SUBMITTED
 *   DRAFT     -> CANCELLED
 *   SUBMITTED -> APPROVED
 *   SUBMITTED -> REJECTED
 *   SUBMITTED -> CANCELLED
 *   SUBMITTED -> EXPIRED
 *
 * `EXPIRED` is a real `ApplicationStatus` enum value, but
 * `kernel-openapi.yaml` defines no manual transition operation into it —
 * no `POST /membership-applications/{id}/expire` exists. This adapter
 * therefore has no `canExpireApplication`, and no dialog/button in this
 * feature ever offers "Expirar" — `EXPIRED` is only ever something the UI
 * *displays* if the Kernel reports it, never something it drives.
 *
 * This only decides which action the UI *offers*; the Kernel re-validates
 * every transition server-side regardless (409 `KERNEL_INVALID_TRANSITION`
 * otherwise — same rule as `features/memberships/adapters/
 * membership-lifecycle.ts`).
 */
export function canSubmitApplication(status: ApplicationStatus): boolean {
  return status === "DRAFT";
}

export function canApproveApplication(status: ApplicationStatus): boolean {
  return status === "SUBMITTED";
}

export function canRejectApplication(status: ApplicationStatus): boolean {
  return status === "SUBMITTED";
}

/** Invariant 6.8.6 — cancel only applies from DRAFT or SUBMITTED, never from a terminal status. */
export function canCancelApplication(status: ApplicationStatus): boolean {
  return status === "DRAFT" || status === "SUBMITTED";
}
