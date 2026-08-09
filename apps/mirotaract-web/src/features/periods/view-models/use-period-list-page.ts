"use client";

import type { PeriodStatus } from "@/lib/api";
import { usePeriods } from "@/lib/api";

import {
  toPeriodListItemViewModel,
  type PeriodListItemViewModel,
} from "./period-list-item";

/**
 * `usePeriods` returns a plain `InstitutionalPeriod[]`, not a cursor page
 * (`listPeriods` in kernel-openapi.yaml has no `PageInfo` — unlike
 * Organizations/Memberships), so there's no pagination to walk here at
 * all — this view-model is a straight loading/error/items projection.
 */
export function usePeriodListPage(filters: {
  organizationId: string | undefined;
  status?: PeriodStatus;
}): {
  items: PeriodListItemViewModel[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
} {
  const query = usePeriods(filters.organizationId, filters.status);
  const items = (query.data ?? []).map(toPeriodListItemViewModel);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
