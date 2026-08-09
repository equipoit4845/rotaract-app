"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { appointmentKeys } from "../appointments/appointments.keys";
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
    // Broad on purpose: `MembershipTransfer` carries `membershipId`, not the
    // person's id, so there's no way to target
    // `membershipKeys.personList(personId)` directly without an extra fetch.
    // Invalidating the whole `memberships` prefix covers detail (origin
    // membership), organization lists (both sides), *and* the person's own
    // "Membresías" list (Persons feature, `usePersonMemberships`) in one
    // shot — same "amplia por dominio" trade-off already documented for
    // effective-permissions invalidation (docs/07-frontend-web.md). Without
    // this, completing a transfer would leave the transferred person's
    // Person-detail membership tab stale until an unrelated refetch.
    queryClient.invalidateQueries({ queryKey: membershipKeys.all });
    // The person gains permissions scoped to the destination org and loses
    // them in the origin org (CA-TRA-04/05).
    queryClient.invalidateQueries({
      queryKey: authorizationKeys.allEffectivePermissions(),
    });
    // Completing a transfer ends incompatible active appointments in the
    // origin organization as part of the same Kernel transaction
    // (invariant 6.9.5 — "finaliza cargos activos incompatibles"). This
    // was a real gap: the mutation invalidated memberships/permissions but
    // never the current-authorities/appointments caches, so a completed
    // transfer could leave a stale "vigente" authority on screen for the
    // origin organization until an unrelated refetch happened. Fixed here,
    // same criterion as the Fase 4 `useOrganizationMemberships` cursor fix
    // — completing a public hook's own documented contract, not a
    // redesign (see docs/09-administrative-web.md, Área 7 preflight).
    queryClient.invalidateQueries({
      queryKey: appointmentKeys.currentAuthorities(transfer.fromOrganizationId),
    });
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
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
