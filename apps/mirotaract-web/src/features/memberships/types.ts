import type { MembershipStatus } from "@/lib/api";

export type MembershipListFilters = {
  organizationId?: string;
  status?: MembershipStatus[];
};
