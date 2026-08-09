"use client";

import { useOrganizationMemberships } from "@/lib/api";
import { useEffect, useState } from "react";

import type { MembershipListFilters } from "../types";
import {
  toMembershipListItemViewModel,
  type MembershipListItemViewModel,
} from "./membership-list-item";

/**
 * Same shape as `useOrganizationListPage` (Organizations, US-ORG-01): the
 * Kernel only exposes a forward cursor (`MembershipPage.pageInfo` has
 * `nextCursor`/`hasMore`, never a backward one), so "Anterior" steps back
 * through pages the underlying `useInfiniteQuery` already holds in its own
 * cache — never a new request, never a fabricated numbered page —
 * "Siguiente" reuses a cached page if one exists, or fetches a new one via
 * the real cursor otherwise.
 */
export function useMembershipListPage(filters: MembershipListFilters): {
  items: MembershipListItemViewModel[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetchingNextPage: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
} {
  const query = useOrganizationMemberships(filters.organizationId, {
    status: filters.status,
  });
  const [pageIndex, setPageIndex] = useState(0);

  // A filter change means a different query key — a stale pageIndex left
  // over from the previous filtered result set could point past the end.
  useEffect(() => {
    setPageIndex(0);
  }, [filters.organizationId, filters.status]);

  const pages = query.data?.pages ?? [];
  const currentPage = pages[pageIndex];
  const items = (currentPage?.items ?? []).map(toMembershipListItemViewModel);

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
