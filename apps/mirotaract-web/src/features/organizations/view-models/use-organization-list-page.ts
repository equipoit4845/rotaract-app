"use client";

import { useOrganizations } from "@/lib/api";
import { useEffect, useState } from "react";

import type { OrganizationListFilters } from "../types";
import {
  toOrganizationListItemViewModel,
  type OrganizationListItemViewModel,
} from "./organization-list-item";

/**
 * `useOrganizations` is a real cursor `useInfiniteQuery` — the Kernel has
 * no backward cursor (`PageInfo` only carries `nextCursor`/`hasMore`).
 * "Previous" here steps back through pages already held in the query's
 * own cache (never a new request, never a fabricated numbered page);
 * "Next" reuses a cached page if one exists, or fetches a new one via
 * the real cursor otherwise (product spec §7).
 */
export function useOrganizationListPage(filters: OrganizationListFilters): {
  items: OrganizationListItemViewModel[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetchingNextPage: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
} {
  const query = useOrganizations(filters);
  const [pageIndex, setPageIndex] = useState(0);

  // A filter change means a different query key — a stale pageIndex left
  // over from the previous filtered result set could point past the end.
  useEffect(() => {
    setPageIndex(0);
  }, [filters.type, filters.status, filters.query]);

  const pages = query.data?.pages ?? [];
  const currentPage = pages[pageIndex];
  const items = (currentPage?.items ?? []).map(toOrganizationListItemViewModel);

  const hasPrevious = pageIndex > 0;
  const hasNext = pageIndex < pages.length - 1 || Boolean(query.hasNextPage);

  function goPrevious() {
    setPageIndex((index) => Math.max(0, index - 1));
  }

  function goNext() {
    if (pageIndex < pages.length - 1) {
      setPageIndex((index) => index + 1);
      return;
    }
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage().then(() => {
        setPageIndex((index) => index + 1);
      });
    }
  }

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasPrevious,
    hasNext,
    goPrevious,
    goNext,
  };
}
