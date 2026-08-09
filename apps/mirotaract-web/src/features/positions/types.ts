import type { OrganizationType } from "@/lib/api";

/**
 * Local shapes only — never a place to redefine what `@/lib/api` already
 * exports. `PositionDefinition` flows in as-is until an adapter narrows it
 * to something a Design System component actually accepts.
 */
export type PositionListFilters = {
  organizationType?: OrganizationType;
};
