import type { OrganizationStatus } from "@/lib/api";

/**
 * Mirrors the real state machine (kernel-spec.md §7.2) exactly:
 * `DRAFT→ACTIVE`, `ACTIVE→INACTIVE`, `INACTIVE→ACTIVE`, `DRAFT→ARCHIVED`,
 * `INACTIVE→ARCHIVED`. There is no `ACTIVE→ARCHIVED` transition — an
 * active organization must be deactivated first. This only decides which
 * action the UI *offers*; the Kernel re-validates every transition
 * server-side regardless (409 `KERNEL_INVALID_TRANSITION` otherwise).
 */
export function canActivateOrganization(status: OrganizationStatus): boolean {
  return status === "DRAFT" || status === "INACTIVE";
}

export function canDeactivateOrganization(status: OrganizationStatus): boolean {
  return status === "ACTIVE";
}

export function canArchiveOrganization(status: OrganizationStatus): boolean {
  return status === "DRAFT" || status === "INACTIVE";
}

/** `ARCHIVED` is terminal (§7.2) — nothing further changes it, including its parent. */
export function canMoveOrganization(status: OrganizationStatus): boolean {
  return status !== "ARCHIVED";
}

export function canEditOrganization(status: OrganizationStatus): boolean {
  return status !== "ARCHIVED";
}
