"use client";

import { createContext, useContext } from "react";

import type { RequestLogFilters } from "@/lib/api";

/**
 * Lets a panel of the app detail page jump to the "Registros" tab with
 * filters (e.g. from a failed webhook delivery). Absent outside the detail
 * page, in which case those links are simply not shown.
 */
export const AppNavigationContext = createContext<{
  showRequestLogs: (filters: RequestLogFilters) => void;
} | null>(null);

export function useAppNavigation() {
  return useContext(AppNavigationContext);
}
