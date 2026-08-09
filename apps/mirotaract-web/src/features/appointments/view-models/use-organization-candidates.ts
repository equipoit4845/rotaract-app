"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidates for the "switch organization scope" filter on
 * `/authorities`/`/appointments`. A single bounded list request (first
 * page, `status=ACTIVE`), never one request per candidate — duplicated
 * locally from Memberships' identical view-model per project convention.
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
