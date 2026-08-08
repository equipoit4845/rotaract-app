import type { PersonFilters } from "./persons.types";

export const personKeys = {
  all: ["persons"] as const,
  lists: () => [...personKeys.all, "list"] as const,
  list: (filters: Omit<PersonFilters, "cursor">) =>
    [...personKeys.lists(), filters] as const,
  detail: (id: string) => [...personKeys.all, "detail", id] as const,
  memberships: (id: string) =>
    [...personKeys.detail(id), "memberships"] as const,
};
