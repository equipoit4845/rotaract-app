import { apiRequest, httpClient } from "../client/http-client";
import type { RequestLogFilters, RequestLogPage } from "./request-logs.types";

/** Drops empty filters so they never reach the query string. */
export function requestLogQuery(
  filters: RequestLogFilters,
  cursor?: string,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters))
    if (typeof value === "string" && value.trim()) query[key] = value.trim();
  if (cursor) query.cursor = cursor;
  return query;
}

export const requestLogsApi = {
  list: (
    appId: string,
    filters: RequestLogFilters,
    cursor?: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps/{appId}/request-logs", {
        params: {
          path: { appId },
          query: { ...requestLogQuery(filters, cursor), limit: 50 },
        },
        signal: opts?.signal,
      }),
    ) as Promise<RequestLogPage>,
};
