"use client";

import { useCurrentUser } from "@/lib/api";

export type OwnMembershipCandidate = {
  membershipId: string;
  organizationId: string;
};

/**
 * Candidates for "which of my own memberships do I want to transfer" on
 * `RequestTransferDialog` (US-TRA-03) — sourced from `useCurrentUser()`'s
 * own `UserContext.memberships` (the same field
 * `features/shell/use-organization-options.ts` already uses for "my
 * organizations"), filtered to `status === "ACTIVE"` (invariant 6.9.1 —
 * only an `ACTIVE` membership can be transferred). There is no
 * "listMyMemberships" endpoint beyond what `/auth/me` already returns, so
 * this never issues a membership-list request — `UserContext` already has
 * everything needed (`membershipId`, `organizationId`). Organization names
 * are resolved by the caller against `useTransferOrganizationCandidates()`
 * — never a per-candidate `useOrganization` call here (would be a
 * variable-length hook loop).
 */
export function useOwnActiveMemberships(): {
  candidates: OwnMembershipCandidate[];
  isLoading: boolean;
} {
  const { data: currentUser, isLoading } = useCurrentUser();

  const candidates = (currentUser?.memberships ?? [])
    .filter((membership) => membership.status === "ACTIVE")
    .map((membership) => ({
      membershipId: membership.membershipId,
      organizationId: membership.organizationId,
    }));

  return { candidates, isLoading };
}
