import type { OrganizationType } from "./positions.types";

export const positionKeys = {
  all: ["positions"] as const,
  lists: () => [...positionKeys.all, "list"] as const,
  list: (organizationType?: OrganizationType, applicableTo?: string) =>
    [
      ...positionKeys.lists(),
      organizationType ?? null,
      applicableTo ?? null,
    ] as const,
  permissions: (positionDefinitionId: string) =>
    [...positionKeys.all, "permissions", positionDefinitionId] as const,
};
