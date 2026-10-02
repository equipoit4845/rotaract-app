export const developerAppKeys = {
  all: ["developer-apps"] as const,
  lists: () => [...developerAppKeys.all, "list"] as const,
  list: (organizationId: string) =>
    [...developerAppKeys.lists(), organizationId] as const,
  details: () => [...developerAppKeys.all, "detail"] as const,
  detail: (appId: string) => [...developerAppKeys.details(), appId] as const,
};
