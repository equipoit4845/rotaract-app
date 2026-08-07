import { DomainError } from "../shared/domain.error";

export function assertRotaryPeriod(start: Date, end: Date): void {
  const expectedEnd = new Date(Date.UTC(start.getUTCFullYear() + 1, 5, 30));
  if (
    start.getUTCMonth() !== 6 ||
    start.getUTCDate() !== 1 ||
    end.toISOString().slice(0, 10) !== expectedEnd.toISOString().slice(0, 10)
  )
    throw new DomainError(
      "INVALID_PERIOD_DATES",
      "A rotary period runs from July 1 through June 30 of the following year",
    );
}
export function assertDateRange(
  start: Date | null,
  end: Date | null,
  code = "INVALID_DATE_RANGE",
): void {
  if (start && end && start >= end)
    throw new DomainError(code, "Start must be before end");
}
export function assertScope(
  scope: string,
  organizationId?: string | null,
): void {
  if ((scope === "PLATFORM") !== !organizationId)
    throw new DomainError(
      "INVALID_SCOPE",
      "Platform scope cannot have organization; organizational scope requires one",
    );
}
export function assertActiveMembership(status: string): void {
  if (status !== "ACTIVE")
    throw new DomainError(
      "MEMBERSHIP_NOT_ACTIVE",
      "An active membership is required",
    );
}
export function assertNonArchived(archivedAt: Date | null): void {
  if (archivedAt)
    throw new DomainError(
      "PERSON_ARCHIVED",
      "Archived people cannot receive institutional assignments",
    );
}
export function assertNotExpired(expiresAt: Date | null, now: Date): void {
  if (expiresAt && expiresAt <= now)
    throw new DomainError("RESOURCE_EXPIRED", "The resource has expired");
}
export function assertDistrictMembership(
  positionType: string,
  appointmentOrganizationId: string,
  membershipOrganizationId: string,
  membershipOrganizationType: string,
  isDescendant: boolean,
): void {
  if (positionType === "CLUB" || positionType === "OTHER") {
    if (appointmentOrganizationId !== membershipOrganizationId)
      throw new DomainError(
        "INVALID_APPOINTMENT_MEMBERSHIP",
        "Club and other positions require membership in the exact organization",
      );
    return;
  }
  if (
    positionType === "DISTRICT" &&
    (membershipOrganizationType !== "CLUB" || !isDescendant)
  )
    throw new DomainError(
      "INVALID_APPOINTMENT_MEMBERSHIP",
      "District positions require a membership in a descendant club",
    );
}
