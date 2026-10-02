export const webhookKeys = {
  all: ["webhooks"] as const,
  catalog: () => [...webhookKeys.all, "catalog"] as const,
  lists: () => [...webhookKeys.all, "list"] as const,
  list: (appId: string) => [...webhookKeys.lists(), appId] as const,
  deliveries: (appId: string, endpointId: string) =>
    [...webhookKeys.all, "deliveries", appId, endpointId] as const,
};
