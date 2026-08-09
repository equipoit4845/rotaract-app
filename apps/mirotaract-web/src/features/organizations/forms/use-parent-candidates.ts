"use client";

import { useOrganizations } from "@/lib/api";
import type { Organization } from "@/lib/api";

/**
 * Candidate parents for a new/moved organization. `constrainToType` filters
 * server-side so the dropdown never offers an obviously-incompatible
 * hierarchy where the contract already makes that call (product spec
 * §18/§28) — a `CLUB` only ever sees `DISTRICT`s (invariant 6.3.3).
 * `kernel-spec.md` doesn't constrain a valid parent type for `OTHER`, so
 * that case is left unfiltered rather than inventing a rule the contract
 * doesn't state. Either way this is a single bounded list request (first
 * page, `status=ACTIVE`), never one request per candidate; the Kernel
 * still validates the final choice (cycles, scope) regardless of what
 * this UI offers.
 */
export function useParentCandidates(constrainToType?: "DISTRICT"): {
  candidates: Organization[];
  isLoading: boolean;
} {
  const query = useOrganizations({
    type: constrainToType,
    status: "ACTIVE",
  });
  const candidates = (query.data?.pages ?? []).flatMap(
    (page) => page.items ?? [],
  );
  return { candidates, isLoading: query.isLoading };
}
