import type { MembershipFilters } from "./memberships.types";

export const membershipKeys = {
  all: ["memberships"] as const,
  organizationLists: () => [...membershipKeys.all, "byOrganization"] as const,
  organizationList: (
    organizationId: string,
    filters: Omit<MembershipFilters, "cursor">,
  ) =>
    [...membershipKeys.organizationLists(), organizationId, filters] as const,
  personLists: () => [...membershipKeys.all, "byPerson"] as const,
  personList: (personId: string) =>
    [...membershipKeys.personLists(), personId] as const,
  detail: (id: string) => [...membershipKeys.all, "detail", id] as const,
  history: (id: string) => [...membershipKeys.detail(id), "history"] as const,
};
