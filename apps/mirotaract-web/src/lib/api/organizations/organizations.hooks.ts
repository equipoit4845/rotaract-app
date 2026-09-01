"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { organizationsApi } from "./organizations.api";
import { organizationKeys } from "./organizations.keys";
import type {
  CreateOrganizationRequest,
  OrganizationFilters,
  UpdateOrganizationRequest,
} from "./organizations.types";

export function useOrganizations(
  filters: Omit<OrganizationFilters, "cursor"> = {},
  options: { enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: organizationKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      organizationsApi.list({ ...filters, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasMore
        ? (lastPage.pageInfo?.nextCursor ?? undefined)
        : undefined,
    enabled: options.enabled,
  });
}

/** Loads every cursor page for administrative directories without replacing the Kernel cursor contract. */
export function useAllOrganizations(
  filters: Omit<OrganizationFilters, "cursor"> = {},
  options: { enabled?: boolean } = {},
) {
  const query = useOrganizations(
    { ...filters, limit: filters.limit ?? 100 },
    options,
  );

  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items ?? []) ?? [],
  };
}

export function useOrganization(organizationId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.detail(organizationId ?? ""),
    queryFn: ({ signal }) =>
      organizationsApi.get(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationChildren(organizationId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.children(organizationId ?? ""),
    queryFn: ({ signal }) =>
      organizationsApi.children(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationAncestors(organizationId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.ancestors(organizationId ?? ""),
    queryFn: ({ signal }) =>
      organizationsApi.ancestors(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationDescendants(organizationId: string | undefined) {
  return useQuery({
    queryKey: organizationKeys.descendants(organizationId ?? ""),
    queryFn: ({ signal }) =>
      organizationsApi.descendants(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrganizationRequest) =>
      organizationsApi.create(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() }),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      payload,
    }: {
      organizationId: string;
      payload: UpdateOrganizationRequest;
    }) => organizationsApi.update(organizationId, payload),
    onSuccess: (_data, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

function useOrganizationStatusMutation(
  fn: (organizationId: string) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, organizationId) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: organizationKeys.lists() });
    },
  });
}

export function useActivateOrganization() {
  return useOrganizationStatusMutation(organizationsApi.activate);
}

export function useDeactivateOrganization() {
  return useOrganizationStatusMutation(organizationsApi.deactivate);
}

export function useArchiveOrganization() {
  return useOrganizationStatusMutation(organizationsApi.archive);
}

export function useMoveOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      newParentId,
    }: {
      organizationId: string;
      newParentId: string | null;
    }) => organizationsApi.move(organizationId, newParentId),
    onSuccess: (_data, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.detail(organizationId),
      });
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}
