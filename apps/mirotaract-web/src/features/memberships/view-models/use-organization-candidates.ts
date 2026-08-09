"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidates for the "switch organization scope" filter on `/memberships`.
 * A single bounded list request (first page, `status=ACTIVE`), never one
 * request per candidate — same shape as `useParentCandidates`
 * (Organizations, US-ORG-04/08), duplicated locally on purpose (product
 * spec §32: both tracks can be active at once, a small duplicate here beats
 * importing from `features/organizations/**`).
 */
export function useOrganizationCandidates(): {
  candidates: Organization[];
  isLoading: boolean;
} {
  const query = useOrganizations({ status: "ACTIVE" });
  const candidates = (query.data?.pages ?? []).flatMap(
    (page) => page.items ?? [],
  );
  return { candidates, isLoading: query.isLoading };
}
