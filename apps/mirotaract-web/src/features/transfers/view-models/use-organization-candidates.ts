"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidates for `RequestTransferDialog`'s origin-name lookup and
 * destination-organization picker (US-TRA-03). A single bounded list
 * request (first page, `status=ACTIVE`), never one request per candidate —
 * same shape as `features/memberships/view-models/use-organization-candidates.ts`,
 * duplicated locally on purpose (product spec §32: both tracks can be
 * active at once, a small duplicate here beats importing from
 * `features/memberships/**`).
 */
export function useTransferOrganizationCandidates(): {
  candidates: Organization[];
  isLoading: boolean;
} {
  const query = useOrganizations({ status: "ACTIVE" });
  const candidates = (query.data?.pages ?? []).flatMap(
    (page) => page.items ?? [],
  );
  return { candidates, isLoading: query.isLoading };
}
