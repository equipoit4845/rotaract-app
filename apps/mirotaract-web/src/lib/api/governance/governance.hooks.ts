"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { developerAppKeys } from "../developer-apps/developer-apps.keys";
import { oauthKeys } from "../oauth/oauth.keys";
import { governanceApi } from "./governance.api";
import { governanceKeys } from "./governance.keys";
import type {
  DeveloperAppReviewStatus,
  ReviewDeveloperAppRequest,
  UpdateAppListingRequest,
  UpdateDeveloperAppQuotaRequest,
} from "./governance.types";

/** Apps of the organization's tree in one review status (RDR). */
export function useReviewQueue(
  organizationId: string | undefined,
  status: DeveloperAppReviewStatus = "IN_REVIEW",
) {
  return useQuery({
    queryKey: governanceKeys.reviewQueue(organizationId ?? "", status),
    queryFn: ({ signal }) =>
      governanceApi.reviewQueue(organizationId as string, status, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useReviewHistory(appId: string | undefined) {
  return useQuery({
    queryKey: governanceKeys.reviewHistory(appId ?? ""),
    queryFn: ({ signal }) =>
      governanceApi.reviewHistory(appId as string, { signal }),
    enabled: Boolean(appId),
  });
}

/** Approve or reject; refreshes the app, its history and the queues. */
export function useReviewDeveloperApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      payload,
    }: {
      appId: string;
      payload: ReviewDeveloperAppRequest;
    }) => governanceApi.review(appId, payload),
    onSuccess: (_entry, { appId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: governanceKeys.all }),
        queryClient.invalidateQueries({
          queryKey: developerAppKeys.detail(appId),
        }),
        queryClient.invalidateQueries({ queryKey: developerAppKeys.lists() }),
      ]),
  });
}

export function useRequestDeveloperAppReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) => governanceApi.requestReview(appId),
    onSuccess: (_data, appId) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: governanceKeys.all }),
        queryClient.invalidateQueries({
          queryKey: developerAppKeys.detail(appId),
        }),
      ]),
  });
}

export function useDeveloperAppQuota(appId: string | undefined) {
  return useQuery({
    queryKey: governanceKeys.quota(appId ?? ""),
    queryFn: ({ signal }) => governanceApi.quota(appId as string, { signal }),
    enabled: Boolean(appId),
  });
}

export function useUpdateDeveloperAppQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      payload,
    }: {
      appId: string;
      payload: UpdateDeveloperAppQuotaRequest;
    }) => governanceApi.updateQuota(appId, payload),
    onSuccess: (quota, { appId }) => {
      queryClient.setQueryData(governanceKeys.quota(appId), quota);
      return queryClient.invalidateQueries({
        queryKey: developerAppKeys.detail(appId),
      });
    },
  });
}

/** Approved apps that can be shown to members (RDR). */
export function useAppCatalog(organizationId: string | undefined) {
  return useQuery({
    queryKey: governanceKeys.catalog(organizationId ?? ""),
    queryFn: ({ signal }) =>
      governanceApi.catalog(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useUpdateAppListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appId,
      payload,
    }: {
      appId: string;
      payload: UpdateAppListingRequest;
    }) => governanceApi.updateListing(appId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: governanceKeys.all }),
  });
}

/** The apps the district published for the signed-in person. */
export function useMyApps() {
  return useQuery({
    queryKey: governanceKeys.myApps(),
    queryFn: ({ signal }) => governanceApi.myApps({ signal }),
    staleTime: 5 * 60_000,
  });
}

/** Apps that reached the signed-in person's data. */
export function useMyAppAccess() {
  return useQuery({
    queryKey: governanceKeys.myAccess(),
    queryFn: ({ signal }) => governanceApi.myAccess({ signal }),
  });
}

export function useMyAppAccessEvents(appId: string | undefined) {
  return useInfiniteQuery({
    queryKey: governanceKeys.myAccessEvents(appId ?? ""),
    queryFn: ({ pageParam, signal }) =>
      governanceApi.myAccessEvents(appId as string, pageParam, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.pageInfo.hasMore
        ? (page.pageInfo.nextCursor ?? undefined)
        : undefined,
    enabled: Boolean(appId),
  });
}

/** Revoking a consent also changes the access list. */
export function useInvalidateMyAccess() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: governanceKeys.all }),
      queryClient.invalidateQueries({ queryKey: oauthKeys.consents() }),
    ]);
}
