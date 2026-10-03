"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { requestLogsApi } from "./request-logs.api";
import { requestLogKeys } from "./request-logs.keys";
import type { RequestLogFilters } from "./request-logs.types";

/** An app's request logs (E9.3), newest first, 50 per page ("Ver más"). */
export function useRequestLogs(
  appId: string | undefined,
  filters: RequestLogFilters,
) {
  return useInfiniteQuery({
    queryKey: requestLogKeys.list(appId ?? "", filters),
    queryFn: ({ pageParam, signal }) =>
      requestLogsApi.list(appId as string, filters, pageParam, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.pageInfo.hasMore
        ? (page.pageInfo.nextCursor ?? undefined)
        : undefined,
    enabled: Boolean(appId),
  });
}
