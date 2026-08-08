import { apiRequest, httpClient } from "../client/http-client";
import type {
  MembershipTransfer,
  RequestMembershipTransferRequest,
  TransferFilters,
} from "./transfers.types";

export const transfersApi = {
  list: (filters: TransferFilters, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/membership-transfers", {
        params: { query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipTransfer[]>,

  get: (transferId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/membership-transfers/{transferId}", {
        params: { path: { transferId } },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipTransfer>,

  request: (payload: RequestMembershipTransferRequest) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers", { body: payload }),
    ) as Promise<MembershipTransfer>,

  acceptByDestination: (transferId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers/{transferId}/accept", {
        params: { path: { transferId } },
      }),
    ) as Promise<MembershipTransfer>,

  confirmByOrigin: (transferId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers/{transferId}/confirm", {
        params: { path: { transferId } },
      }),
    ) as Promise<MembershipTransfer>,

  complete: (transferId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers/{transferId}/complete", {
        params: { path: { transferId } },
      }),
    ) as Promise<MembershipTransfer>,

  reject: (transferId: string, rejectionReason: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers/{transferId}/reject", {
        params: { path: { transferId } },
        body: { rejectionReason },
      }),
    ) as Promise<MembershipTransfer>,

  cancel: (transferId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-transfers/{transferId}/cancel", {
        params: { path: { transferId } },
      }),
    ) as Promise<MembershipTransfer>,
};
