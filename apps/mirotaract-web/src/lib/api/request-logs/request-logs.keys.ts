import type { RequestLogFilters } from "./request-logs.types";

export const requestLogKeys = {
  all: ["request-logs"] as const,
  list: (appId: string, filters: RequestLogFilters) =>
    [...requestLogKeys.all, appId, filters] as const,
};
