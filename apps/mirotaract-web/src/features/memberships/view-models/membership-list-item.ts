import type { MembershipStatus, OrganizationMembership } from "@/lib/api";

export type MembershipListItemViewModel = {
  id: string;
  personId: string;
  memberNumber: string | null;
  status: MembershipStatus;
  joinedAt: string | null;
  endedAt: string | null;
  href: string;
};

/** Pure Kernel DTO → ViewModel mapping — no hooks here (same discipline as `toOrganizationListItemViewModel`). */
export function toMembershipListItemViewModel(
  membership: OrganizationMembership,
): MembershipListItemViewModel {
  return {
    id: membership.id,
    personId: membership.personId,
    memberNumber: membership.memberNumber ?? null,
    status: membership.status,
    joinedAt: membership.joinedAt ?? null,
    endedAt: membership.endedAt ?? null,
    href: `/memberships/${membership.id}`,
  };
}
