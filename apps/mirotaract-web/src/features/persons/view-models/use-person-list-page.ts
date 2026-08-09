"use client";

import { usePersons } from "@/lib/api";
import { useEffect, useState } from "react";

import type { PersonListFilters } from "../types";
import {
  toPersonListItemViewModel,
  type PersonListItemViewModel,
} from "./person-list-item";

/**
 * Same cursor-paging shape as Organizations' `useOrganizationListPage` —
 * the Kernel has no backward cursor (`PageInfo` only carries
 * `nextCursor`/`hasMore`), so "previous" steps back through pages already
 * held in the query's own cache instead of fabricating a numbered page.
 */
export function usePersonListPage(filters: PersonListFilters): {
  items: PersonListItemViewModel[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetchingNextPage: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
} {
  const query = usePersons(filters);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [filters.query]);

  const pages = query.data?.pages ?? [];
  const currentPage = pages[pageIndex];
  const items = (currentPage?.items ?? []).map(toPersonListItemViewModel);

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
