import type { components } from "../client/schema";

export type RequestLog = components["schemas"]["RequestLog"];
export type RequestLogPage = components["schemas"]["RequestLogPage"];

/** Filters of `GET /developer/apps/{appId}/request-logs` (all optional). */
export type RequestLogFilters = {
  /** `2xx` | `3xx` | `4xx` | `5xx` | `error` | an exact code. */
  status?: string;
  code?: string;
  traceId?: string;
  from?: string;
  to?: string;
};
