"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { PersonListFilters } from "../types";

/**
 * `PersonFilters` (the public type in `@/lib/api`) only supports `query` —
 * there's no `type`/`status` filter for persons in the contract, unlike
 * Organizations. Filters live only in the URL, never localStorage (§5/§13
 * of the product spec). `router.replace` (not `push`) so typing a search
 * doesn't spam the back-button history.
 */
export function usePersonListFilters(): {
  filters: PersonListFilters;
  setQuery: (query: string) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<PersonListFilters>(
    () => ({ query: searchParams.get("query") ?? undefined }),
    [searchParams],
  );

  const setQuery = useCallback(
    (query: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (query) next.set("query", query);
      else next.delete("query");
      const queryString = next.toString();
      router.replace(queryString ? `/persons?${queryString}` : "/persons");
    },
    [router, searchParams],
  );

  return { filters, setQuery };
}
