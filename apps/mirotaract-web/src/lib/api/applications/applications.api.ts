import { apiRequest, httpClient } from "../client/http-client";
import type {
  ApplicationFilters,
  CreateMembershipApplicationRequest,
  MembershipApplication,
} from "./applications.types";

export const applicationsApi = {
  list: (filters: ApplicationFilters, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/membership-applications", {
        params: { query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipApplication[]>,

  get: (applicationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/membership-applications/{applicationId}", {
        params: { path: { applicationId } },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipApplication>,

  create: (payload: CreateMembershipApplicationRequest) =>
    apiRequest(() =>
      httpClient.POST("/membership-applications", { body: payload }),
    ) as Promise<MembershipApplication>,

  submit: (applicationId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-applications/{applicationId}/submit", {
        params: { path: { applicationId } },
      }),
    ) as Promise<MembershipApplication>,

  approve: (applicationId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-applications/{applicationId}/approve", {
        params: { path: { applicationId } },
      }),
    ) as Promise<MembershipApplication>,

  reject: (applicationId: string, rejectionReason: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-applications/{applicationId}/reject", {
        params: { path: { applicationId } },
        body: { rejectionReason },
      }),
    ) as Promise<MembershipApplication>,

  cancel: (applicationId: string) =>
    apiRequest(() =>
      httpClient.POST("/membership-applications/{applicationId}/cancel", {
        params: { path: { applicationId } },
      }),
    ) as Promise<MembershipApplication>,
};
