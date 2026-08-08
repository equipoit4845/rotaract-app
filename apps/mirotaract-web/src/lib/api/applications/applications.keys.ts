import type { ApplicationFilters } from "./applications.types";

export const applicationKeys = {
  all: ["membershipApplications"] as const,
  lists: () => [...applicationKeys.all, "list"] as const,
  list: (filters: ApplicationFilters) =>
    [...applicationKeys.lists(), filters] as const,
  detail: (id: string) => [...applicationKeys.all, "detail", id] as const,
};
