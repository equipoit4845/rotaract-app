"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidate owner districts for a new configurable `PositionDefinition`
 * (invariant 6.6.1.1: `ownerOrganizationId` must be an `ACTIVE` `DISTRICT`).
 * A single bounded list request (first page, `type=DISTRICT`,
 * `status=ACTIVE`), never one request per candidate — same shape as
 * `useParentCandidates` (Organizations) / `useOrganizationCandidates`
 * (Memberships), duplicated locally on purpose (every phase keeps its own
 * copy rather than importing another feature's folder).
 */
export function useDistrictCandidates(): {
  candidates: Organization[];
  isLoading: boolean;
} {
  const query = useOrganizations({ type: "DISTRICT", status: "ACTIVE" });
  const candidates = (query.data?.pages ?? []).flatMap(
    (page) => page.items ?? [],
  );
  return { candidates, isLoading: query.isLoading };
}
