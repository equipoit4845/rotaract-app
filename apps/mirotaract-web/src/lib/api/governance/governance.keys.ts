export const governanceKeys = {
  all: ["governance"] as const,
  reviewQueue: (organizationId: string, status: string) =>
    [...governanceKeys.all, "review-queue", organizationId, status] as const,
  reviewHistory: (appId: string) =>
    [...governanceKeys.all, "review-history", appId] as const,
  quota: (appId: string) => [...governanceKeys.all, "quota", appId] as const,
  catalog: (organizationId: string) =>
    [...governanceKeys.all, "catalog", organizationId] as const,
  myApps: () => [...governanceKeys.all, "me", "apps"] as const,
  myAccess: () => [...governanceKeys.all, "me", "access"] as const,
  myAccessEvents: (appId: string) =>
    [...governanceKeys.all, "me", "access", appId] as const,
};
