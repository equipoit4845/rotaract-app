import type { TransferStatus } from "@/lib/api";

/**
 * Filters this feature actually offers on `/transfers` (US-TRA-01):
 * `membership`/`from`/`to`/`status` in the URL. `requestedById` exists on
 * `TransferFilters` (`@/lib/api`) but has no UI filter here — it's not part
 * of the historia, so it's not surfaced.
 */
export type TransferListFilters = {
  membershipId?: string;
  fromOrganizationId?: string;
  toOrganizationId?: string;
  status?: TransferStatus;
};
