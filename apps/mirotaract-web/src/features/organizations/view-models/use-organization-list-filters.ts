"use client";

import type { OrganizationStatus, OrganizationType } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { OrganizationListFilters } from "../types";

const TYPES: readonly OrganizationType[] = ["DISTRICT", "CLUB", "OTHER"];
const STATUSES: readonly OrganizationStatus[] = [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
];

function readType(value: string | null): OrganizationType | undefined {
  return value && (TYPES as readonly string[]).includes(value)
    ? (value as OrganizationType)
    : undefined;
}

function readStatus(value: string | null): OrganizationStatus | undefined {
  return value && (STATUSES as readonly string[]).includes(value)
    ? (value as OrganizationStatus)
    : undefined;
}

/**
 * Filters live only in the URL (`?type=&status=&query=`) — never
 * localStorage (product spec §5/§13). `router.replace` (not `push`) so
 * tweaking a filter doesn't spam the back-button history with one entry
 * per change.
 */
export function useOrganizationListFilters(): {
  filters: OrganizationListFilters;
  setType: (type: OrganizationType | undefined) => void;
  setStatus: (status: OrganizationStatus | undefined) => void;
  setQuery: (query: string) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo<OrganizationListFilters>(
    () => ({
      type: readType(searchParams.get("type")),
      status: readStatus(searchParams.get("status")),
      query: searchParams.get("query") ?? undefined,
    }),
    [searchParams],
  );

  const update = useCallback(
    (key: "type" | "status" | "query", value: string | undefined) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const queryString = next.toString();
      router.replace(
        queryString ? `/organizations?${queryString}` : "/organizations",
      );
    },
    [router, searchParams],
  );

  return {
    filters,
    setType: (type) => update("type", type),
    setStatus: (status) => update("status", status),
    setQuery: (query) => update("query", query || undefined),
  };
}
