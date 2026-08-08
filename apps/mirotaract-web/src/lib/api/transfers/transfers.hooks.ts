"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { authorizationKeys } from "../authorization/authorization.keys";
import { membershipKeys } from "../memberships/memberships.keys";
import { transfersApi } from "./transfers.api";
import { transferKeys } from "./transfers.keys";
import type {
  MembershipTransfer,
  RequestMembershipTransferRequest,
  TransferFilters,
} from "./transfers.types";

export function useMembershipTransfers(filters: TransferFilters = {}) {
  return useQuery({
    queryKey: transferKeys.list(filters),
    queryFn: ({ signal }) => transfersApi.list(filters, { signal }),
  });
}

export function useMembershipTransfer(transferId: string | undefined) {
  return useQuery({
    queryKey: transferKeys.detail(transferId ?? ""),
    queryFn: ({ signal }) => transfersApi.get(transferId as string, { signal }),
    enabled: Boolean(transferId),
  });
}

function invalidateTransfer(
  queryClient: QueryClient,
  transfer: MembershipTransfer,
  { membershipsAffected = false }: { membershipsAffected?: boolean } = {},
) {
  queryClient.invalidateQueries({ queryKey: transferKeys.detail(transfer.id) });
  queryClient.invalidateQueries({ queryKey: transferKeys.lists() });
  if (membershipsAffected) {
    queryClient.invalidateQueries({
      queryKey: membershipKeys.detail(transfer.membershipId),
    });
    queryClient.invalidateQueries({
      queryKey: membershipKeys.organizationLists(),
    });
    // The person gains permissions scoped to the destination org and loses
    // them in the origin org (CA-TRA-04/05).
    queryClient.invalidateQueries({
      queryKey: authorizationKeys.allEffectivePermissions(),
    });
  }
}

export function useRequestMembershipTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RequestMembershipTransferRequest) =>
      transfersApi.request(payload),
    onSuccess: (transfer) => invalidateTransfer(queryClient, transfer),
  });
}

export function useAcceptTransferByDestination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) =>
      transfersApi.acceptByDestination(transferId),
    onSuccess: (transfer) => invalidateTransfer(queryClient, transfer),
  });
}

export function useConfirmTransferByOrigin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) =>
      transfersApi.confirmByOrigin(transferId),
    onSuccess: (transfer) => invalidateTransfer(queryClient, transfer),
  });
}

/** Moves the membership between organizations in one transaction (kernel-openapi.yaml CA-TRA-04/05). */
export function useCompleteMembershipTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => transfersApi.complete(transferId),
    onSuccess: (transfer) =>
      invalidateTransfer(queryClient, transfer, { membershipsAffected: true }),
  });
}

export function useRejectMembershipTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transferId,
      rejectionReason,
    }: {
      transferId: string;
      rejectionReason: string;
    }) => transfersApi.reject(transferId, rejectionReason),
    onSuccess: (transfer) => invalidateTransfer(queryClient, transfer),
  });
}

export function useCancelMembershipTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transferId: string) => transfersApi.cancel(transferId),
    onSuccess: (transfer) => invalidateTransfer(queryClient, transfer),
  });
}
