import type { ApplicationStatus } from "@/lib/api";

/**
 * Local filters shape for this feature's views. Deliberately not the same
 * type as `@/lib/api`'s `ApplicationFilters` (which also carries
 * `personId`) — see `view-models/use-application-list-filters.ts` for why
 * `personId` isn't exposed as a toolbar control in this phase.
 */
export type ApplicationListFilters = {
  organizationId?: string;
  status?: ApplicationStatus;
};
