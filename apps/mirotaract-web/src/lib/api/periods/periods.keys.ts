import type { PeriodStatus } from "./periods.types";

export const periodKeys = {
  all: ["periods"] as const,
  lists: () => [...periodKeys.all, "list"] as const,
  list: (organizationId: string, status?: PeriodStatus) =>
    [...periodKeys.lists(), organizationId, status ?? null] as const,
  current: (organizationId: string) =>
    [...periodKeys.all, "current", organizationId] as const,
  detail: (id: string) => [...periodKeys.all, "detail", id] as const,
};
