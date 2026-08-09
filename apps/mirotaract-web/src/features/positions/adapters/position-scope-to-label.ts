import type { OrganizationType } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

/**
 * Local to Positions, deliberately not imported from
 * `features/organizations/adapters/organization-type-to-label.ts` (every
 * phase keeps its own minimal copy off the public DTO rather than reaching
 * into another feature's folder).
 */
const LABEL: Record<OrganizationType, string> = {
  DISTRICT: "Distrito",
  CLUB: "Club",
  OTHER: "Otra",
};

export function positionScopeToLabel(type: OrganizationType): string {
  return LABEL[type];
}

export function positionScopeToTone(type: OrganizationType): MrStateTone {
  switch (type) {
    case "DISTRICT":
      return "info";
    case "CLUB":
      return "success";
    case "OTHER":
      return "neutral";
  }
}
