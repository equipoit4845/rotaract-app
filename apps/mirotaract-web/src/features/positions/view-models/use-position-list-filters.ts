"use client";

import type { OrganizationType } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const TYPES: readonly OrganizationType[] = ["DISTRICT", "CLUB", "OTHER"];

function readType(value: string | null): OrganizationType | undefined {
  return value && (TYPES as readonly string[]).includes(value)
    ? (value as OrganizationType)
    : undefined;
}

/**
 * Filters live only in the URL (`?organizationType=`) — never localStorage,
 * same convention as `useOrganizationListFilters`. `router.replace` (not
 * `push`) so changing the filter doesn't spam browser history.
 */
export function usePositionListFilters(): {
  organizationType: OrganizationType | undefined;
  setOrganizationType: (type: OrganizationType | undefined) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationType = useMemo(
    () => readType(searchParams.get("organizationType")),
    [searchParams],
  );

  const setOrganizationType = useCallback(
    (type: OrganizationType | undefined) => {
      const next = new URLSearchParams(searchParams.toString());
      if (type) next.set("organizationType", type);
      else next.delete("organizationType");
      const queryString = next.toString();
      router.replace(queryString ? `/positions?${queryString}` : "/positions");
    },
    [router, searchParams],
  );

  return { organizationType, setOrganizationType };
}
