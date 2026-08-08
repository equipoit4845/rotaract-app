import type { components } from "../client/schema";

export type MembershipTransfer = components["schemas"]["MembershipTransfer"];
export type RequestMembershipTransferRequest =
  components["schemas"]["RequestMembershipTransferRequest"];
export type TransferStatus = components["schemas"]["TransferStatus"];

export type TransferFilters = {
  membershipId?: string;
  fromOrganizationId?: string;
  toOrganizationId?: string;
  status?: TransferStatus;
  requestedById?: string;
};
