import type { components } from "../client/schema";

export type MembershipApplication =
  components["schemas"]["MembershipApplication"];
export type CreateMembershipApplicationRequest =
  components["schemas"]["CreateMembershipApplicationRequest"];
export type ApplicationStatus = components["schemas"]["ApplicationStatus"];

export type ApplicationFilters = {
  organizationId?: string;
  personId?: string;
  status?: ApplicationStatus;
};
