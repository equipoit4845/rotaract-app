import type { ModuleStatus } from "./modules.types";

export const moduleKeys = {
  all: ["modules"] as const,
  lists: () => [...moduleKeys.all, "list"] as const,
  list: (status?: ModuleStatus) =>
    [...moduleKeys.lists(), status ?? null] as const,
  detail: (id: string) => [...moduleKeys.all, "detail", id] as const,
  organizationInstallations: (organizationId: string) =>
    [...moduleKeys.all, "organizationInstallations", organizationId] as const,
  capabilities: (organizationId: string) =>
    [...moduleKeys.all, "capabilities", organizationId] as const,
};
