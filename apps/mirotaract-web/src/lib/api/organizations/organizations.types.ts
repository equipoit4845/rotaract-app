import type { components } from "../client/schema";

export type Organization = components["schemas"]["Organization"];
export type OrganizationPage = components["schemas"]["OrganizationPage"];
export type CreateOrganizationRequest =
  components["schemas"]["CreateOrganizationRequest"];
export type UpdateOrganizationRequest =
  components["schemas"]["UpdateOrganizationRequest"];
export type OrganizationType = components["schemas"]["OrganizationType"];
export type OrganizationStatus = components["schemas"]["OrganizationStatus"];

export type OrganizationFilters = {
  type?: OrganizationType;
  status?: OrganizationStatus;
  parentId?: string;
  query?: string;
  cursor?: string;
  limit?: number;
};
