import type { components } from "../client/schema";

export type OrganizationMembership =
  components["schemas"]["OrganizationMembership"];
export type MembershipPage = components["schemas"]["MembershipPage"];
export type CreateMembershipRequest =
  components["schemas"]["CreateMembershipRequest"];
export type MembershipTransition =
  components["schemas"]["MembershipTransition"];
export type MembershipStatus = components["schemas"]["MembershipStatus"];

export type MembershipFilters = {
  status?: MembershipStatus[];
  cursor?: string;
  limit?: number;
};

export type UpdateMembershipPayload = {
  memberNumber?: string | null;
  internalNotes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LeaveOrDeactivatePayload = {
  reasonCode?: string | null;
  reasonText?: string | null;
};
