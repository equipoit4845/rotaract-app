import type { OrganizationStatus, OrganizationType } from "@/lib/api";

export type OrganizationListFilters = {
  type?: OrganizationType;
  status?: OrganizationStatus;
  query?: string;
};
