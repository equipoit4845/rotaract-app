import type { MembershipStatus } from "@/lib/api";

/**
 * Mirrors the real state machine (kernel-spec.md §7.3) exactly:
 *
 *   PENDING  -> ACTIVE
 *   PENDING  -> INACTIVE
 *   ACTIVE   -> ON_LEAVE
 *   ON_LEAVE -> ACTIVE
 *   ACTIVE   -> INACTIVE
 *   ACTIVE   -> GRADUATED
 *   ACTIVE   -> TRANSFERRED
 *   INACTIVE -> ACTIVE
 *
 * "Graduar" and "Reactivar" are NOT a pair — `GRADUATED`/`TRANSFERRED` are
 * terminal, no outgoing transition is documented for them.
 * `reactivateMembership` (kernel-openapi.yaml) only applies from
 * `INACTIVE` — it never appears for a `GRADUATED` membership.
 * `ACTIVE -> TRANSFERRED` has no dedicated `/memberships/:id/*` endpoint —
 * it's driven by the `MembershipTransfer` aggregate (Fase 8), out of scope
 * here.
 *
 * This only decides which action the UI *offers*; the Kernel re-validates
 * every transition server-side regardless (409 `KERNEL_INVALID_TRANSITION`
 * otherwise — product spec §16/§19).
 */
export function canActivateMembership(status: MembershipStatus): boolean {
  return status === "PENDING";
}

export function canPutMembershipOnLeave(status: MembershipStatus): boolean {
  return status === "ACTIVE";
}

export function canResumeMembership(status: MembershipStatus): boolean {
  return status === "ON_LEAVE";
}

export function canDeactivateMembership(status: MembershipStatus): boolean {
  return status === "PENDING" || status === "ACTIVE";
}

export function canGraduateMembership(status: MembershipStatus): boolean {
  return status === "ACTIVE";
}

export function canReactivateMembership(status: MembershipStatus): boolean {
  return status === "INACTIVE";
}

export type MembershipAction =
  "activate" | "leave" | "resume" | "deactivate" | "graduate" | "reactivate";

/** Presentation-only helper (product spec §16) — never used to decide server-side authority. */
export function getAvailableMembershipActions(
  status: MembershipStatus,
): MembershipAction[] {
  const actions: MembershipAction[] = [];
  if (canActivateMembership(status)) actions.push("activate");
  if (canPutMembershipOnLeave(status)) actions.push("leave");
  if (canResumeMembership(status)) actions.push("resume");
  if (canDeactivateMembership(status)) actions.push("deactivate");
  if (canGraduateMembership(status)) actions.push("graduate");
  if (canReactivateMembership(status)) actions.push("reactivate");
  return actions;
}
