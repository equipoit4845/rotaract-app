import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreatePeriodRequest,
  InstitutionalPeriod,
  PeriodStatus,
  UpdatePeriodRequest,
} from "./periods.types";

export const periodsApi = {
  list: (
    organizationId: string,
    status?: PeriodStatus,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/periods", {
        params: { path: { organizationId }, query: { status } },
        signal: opts?.signal,
      }),
    ) as Promise<InstitutionalPeriod[]>,

  current: (organizationId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/periods/current", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<InstitutionalPeriod>,

  get: (periodId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/periods/{periodId}", {
        params: { path: { periodId } },
        signal: opts?.signal,
      }),
    ) as Promise<InstitutionalPeriod>,

  create: (organizationId: string, payload: CreatePeriodRequest) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/periods", {
        params: { path: { organizationId } },
        body: payload,
      }),
    ) as Promise<InstitutionalPeriod>,

  updateDraft: (periodId: string, payload: UpdatePeriodRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/periods/{periodId}", {
        params: { path: { periodId } },
        body: payload,
      }),
    ) as Promise<InstitutionalPeriod>,

  schedule: (periodId: string) =>
    apiRequest(() =>
      httpClient.POST("/periods/{periodId}/schedule", {
        params: { path: { periodId } },
      }),
    ) as Promise<InstitutionalPeriod>,

  activate: (periodId: string) =>
    apiRequest(() =>
      httpClient.POST("/periods/{periodId}/activate", {
        params: { path: { periodId } },
      }),
    ) as Promise<InstitutionalPeriod>,

  close: (periodId: string) =>
    apiRequest(() =>
      httpClient.POST("/periods/{periodId}/close", {
        params: { path: { periodId } },
      }),
    ) as Promise<InstitutionalPeriod>,

  cancel: (periodId: string) =>
    apiRequest(() =>
      httpClient.POST("/periods/{periodId}/cancel", {
        params: { path: { periodId } },
      }),
    ) as Promise<InstitutionalPeriod>,
};
