import type { OrganizationFilters } from "./organizations.types";

export const organizationKeys = {
  all: ["organizations"] as const,
  lists: () => [...organizationKeys.all, "list"] as const,
  list: (filters: Omit<OrganizationFilters, "cursor">) =>
    [...organizationKeys.lists(), filters] as const,
  detail: (id: string) => [...organizationKeys.all, "detail", id] as const,
  children: (id: string) =>
    [...organizationKeys.detail(id), "children"] as const,
  ancestors: (id: string) =>
    [...organizationKeys.detail(id), "ancestors"] as const,
  descendants: (id: string) =>
    [...organizationKeys.detail(id), "descendants"] as const,
};
