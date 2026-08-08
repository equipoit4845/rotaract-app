import type { TransferFilters } from "./transfers.types";

export const transferKeys = {
  all: ["membershipTransfers"] as const,
  lists: () => [...transferKeys.all, "list"] as const,
  list: (filters: TransferFilters) =>
    [...transferKeys.lists(), filters] as const,
  detail: (id: string) => [...transferKeys.all, "detail", id] as const,
};
