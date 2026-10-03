import { apiRequest, httpClient } from "../client/http-client";
import type {
  AppCatalogItem,
  AppListing,
  DeveloperAppQuota,
  DeveloperAppReviewEntry,
  DeveloperAppReviewItem,
  DeveloperAppReviewStatus,
  MyApp,
  MyAppAccess,
  MyAppAccessEventPage,
  ReviewDeveloperAppRequest,
  UpdateAppListingRequest,
  UpdateDeveloperAppQuotaRequest,
} from "./governance.types";

/** Required header on the review commands (see developer-apps.api.ts). */
function idempotencyHeader() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

/** E11 — review, quotas, the district's app catalog and the person's own view. */
export const governanceApi = {
  reviewQueue: (
    organizationId: string,
    status: DeveloperAppReviewStatus,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/developer/app-reviews", {
        params: { query: { organizationId, status } },
        signal: opts?.signal,
      }),
    ) as Promise<DeveloperAppReviewItem[]>,

  reviewHistory: (appId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps/{appId}/reviews", {
        params: { path: { appId } },
        signal: opts?.signal,
      }),
    ) as Promise<DeveloperAppReviewEntry[]>,

  review: (appId: string, payload: ReviewDeveloperAppRequest) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/review", {
        params: { path: { appId }, header: idempotencyHeader() },
        body: payload,
      }),
    ) as Promise<DeveloperAppReviewEntry>,

  requestReview: (appId: string) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/review-request", {
        params: { path: { appId }, header: idempotencyHeader() },
      }),
    ),

  quota: (appId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps/{appId}/quota", {
        params: { path: { appId } },
        signal: opts?.signal,
      }),
    ) as Promise<DeveloperAppQuota>,

  updateQuota: (appId: string, payload: UpdateDeveloperAppQuotaRequest) =>
    apiRequest(() =>
      httpClient.PUT("/developer/apps/{appId}/quota", {
        params: { path: { appId } },
        body: payload,
      }),
    ) as Promise<DeveloperAppQuota>,

  catalog: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/app-catalog", {
        params: { query: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<AppCatalogItem[]>,

  updateListing: (appId: string, payload: UpdateAppListingRequest) =>
    apiRequest(() =>
      httpClient.PUT("/developer/apps/{appId}/listing", {
        params: { path: { appId } },
        body: payload,
      }),
    ) as Promise<AppListing>,

  myApps: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/me/apps", { signal: opts?.signal }),
    ) as Promise<MyApp[]>,

  myAccess: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/me/app-access", { signal: opts?.signal }),
    ) as Promise<MyAppAccess[]>,

  myAccessEvents: (
    appId: string,
    cursor: string | undefined,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/me/app-access/{appId}", {
        params: { path: { appId }, query: { cursor, limit: 20 } },
        signal: opts?.signal,
      }),
    ) as Promise<MyAppAccessEventPage>,
};
