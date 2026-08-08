import type { components } from "../client/schema";

export type Person = components["schemas"]["Person"];
export type PersonPage = components["schemas"]["PersonPage"];
export type CreatePersonRequest = components["schemas"]["CreatePersonRequest"];
export type UpdatePersonRequest = components["schemas"]["UpdatePersonRequest"];
export type AccountInvitation = components["schemas"]["AccountInvitation"];

export type PersonFilters = {
  query?: string;
  cursor?: string;
  limit?: number;
};
