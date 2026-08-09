"use client";

import type { Organization } from "@/lib/api";
import { useOrganizations } from "@/lib/api";

/**
 * Candidates for the "switch organization scope" filter on `/periods`. A
 * single bounded list request (first page, `status=ACTIVE`), never one
 * request per candidate — same shape as Memberships'
 * `useOrganizationCandidates` (Fase 4), duplicated locally on purpose
 * (both tracks can be active at once; a small duplicate here beats
 * importing from `features/memberships/**` or `features/organizations/**`).
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
