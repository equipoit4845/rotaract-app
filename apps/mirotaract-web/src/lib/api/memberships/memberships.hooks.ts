"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { authorizationKeys } from "../authorization/authorization.keys";
import { membershipsApi } from "./memberships.api";
import { membershipKeys } from "./memberships.keys";
import type {
  CreateMembershipRequest,
  LeaveOrDeactivatePayload,
  MembershipFilters,
  OrganizationMembership,
  UpdateMembershipPayload,
} from "./memberships.types";

/**
 * `useInfiniteQuery`, not `useQuery` — the Kernel's `MembershipPage` carries
 * a real `nextCursor`/`hasMore` (kernel-openapi.yaml `MembershipPage`) and
 * this hook has to actually walk it, same pattern as `useOrganizations`.
 */
export function useOrganizationMemberships(
  organizationId: string | undefined,
  filters: Omit<MembershipFilters, "cursor"> = {},
) {
  return useInfiniteQuery({
    queryKey: membershipKeys.organizationList(organizationId ?? "", filters),
    queryFn: ({ pageParam, signal }) =>
      membershipsApi.listByOrganization(
        organizationId as string,
        { ...filters, cursor: pageParam },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasMore
        ? (lastPage.pageInfo?.nextCursor ?? undefined)
        : undefined,
    enabled: Boolean(organizationId),
  });
}

export function usePersonMemberships(personId: string | undefined) {
  return useQuery({
    queryKey: membershipKeys.personList(personId ?? ""),
    queryFn: ({ signal }) =>
      membershipsApi.listByPerson(personId as string, { signal }),
    enabled: Boolean(personId),
  });
}

export function useMembership(membershipId: string | undefined) {
  return useQuery({
    queryKey: membershipKeys.detail(membershipId ?? ""),
    queryFn: ({ signal }) =>
      membershipsApi.get(membershipId as string, { signal }),
    enabled: Boolean(membershipId),
  });
}

export function useMembershipHistory(membershipId: string | undefined) {
  return useQuery({
    queryKey: membershipKeys.history(membershipId ?? ""),
    queryFn: ({ signal }) =>
      membershipsApi.history(membershipId as string, { signal }),
    enabled: Boolean(membershipId),
  });
}

/** Invalidates every cache a membership mutation can affect, scoped to the affected membership. */
function invalidateMembership(
  queryClient: QueryClient,
  membership: OrganizationMembership,
) {
  queryClient.invalidateQueries({
    queryKey: membershipKeys.detail(membership.id),
  });
  queryClient.invalidateQueries({
    queryKey: membershipKeys.history(membership.id),
  });
  queryClient.invalidateQueries({
    queryKey: membershipKeys.organizationLists(),
  });
  queryClient.invalidateQueries({
    queryKey: membershipKeys.personList(membership.personId),
  });
  // Membership status gates authorization (e.g. an inactive membership can't
  // hold effective permissions in that organization) — kernel-openapi.yaml
  // MembershipStatus transitions.
  queryClient.invalidateQueries({
    queryKey: authorizationKeys.allEffectivePermissions(),
  });
}

export function useCreateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      payload,
    }: {
      organizationId: string;
      payload: CreateMembershipRequest;
    }) => membershipsApi.create(organizationId, payload),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

export function useUpdateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload: UpdateMembershipPayload;
    }) => membershipsApi.update(membershipId, payload),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

export function useActivateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      joinedAt,
    }: {
      membershipId: string;
      joinedAt?: string;
    }) => membershipsApi.activate(membershipId, joinedAt),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

export function usePutMembershipOnLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload?: LeaveOrDeactivatePayload;
    }) => membershipsApi.putOnLeave(membershipId, payload),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

export function useDeactivateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload?: LeaveOrDeactivatePayload;
    }) => membershipsApi.deactivate(membershipId, payload),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

function useSimpleMembershipMutation(
  fn: (membershipId: string) => Promise<OrganizationMembership>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => fn(membershipId),
    onSuccess: (membership) => invalidateMembership(queryClient, membership),
  });
}

export function useResumeMembership() {
  return useSimpleMembershipMutation(membershipsApi.resume);
}

export function useGraduateMembership() {
  return useSimpleMembershipMutation(membershipsApi.graduate);
}

export function useReactivateMembership() {
  return useSimpleMembershipMutation(membershipsApi.reactivate);
}
