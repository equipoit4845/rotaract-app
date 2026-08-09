"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidates for the "switch organization scope" filter on `/applications`.
 * A single bounded list request (first page, `status=ACTIVE`), never one
 * request per candidate — small deliberate duplicate of
 * `features/memberships/view-models/use-organization-candidates.ts`
 * (product spec §32: Fase 7 and Fase 8 both active at once, a small
 * duplicate here beats importing from `features/memberships/**`).
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
