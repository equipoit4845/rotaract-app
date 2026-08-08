import type { OrganizationType } from "./positions.types";

export const positionKeys = {
  all: ["positions"] as const,
  lists: () => [...positionKeys.all, "list"] as const,
  list: (organizationType?: OrganizationType) =>
    [...positionKeys.lists(), organizationType ?? null] as const,
};
