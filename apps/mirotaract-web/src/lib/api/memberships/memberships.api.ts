import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreateMembershipRequest,
  LeaveOrDeactivatePayload,
  MembershipFilters,
  MembershipPage,
  MembershipTransition,
  OrganizationMembership,
  UpdateMembershipPayload,
} from "./memberships.types";

export const membershipsApi = {
  listByOrganization: (
    organizationId: string,
    filters: MembershipFilters,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/memberships", {
        params: { path: { organizationId }, query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipPage>,

  listByPerson: (personId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/persons/{personId}/memberships", {
        params: { path: { personId } },
        signal: opts?.signal,
      }),
    ) as Promise<OrganizationMembership[]>,

  get: (membershipId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/memberships/{membershipId}", {
        params: { path: { membershipId } },
        signal: opts?.signal,
      }),
    ) as Promise<OrganizationMembership>,

  history: (membershipId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/memberships/{membershipId}/history", {
        params: { path: { membershipId } },
        signal: opts?.signal,
      }),
    ) as Promise<MembershipTransition[]>,

  create: (organizationId: string, payload: CreateMembershipRequest) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/memberships", {
        params: { path: { organizationId } },
        body: payload,
      }),
    ) as Promise<OrganizationMembership>,

  update: (membershipId: string, payload: UpdateMembershipPayload) =>
    apiRequest(() =>
      httpClient.PATCH("/memberships/{membershipId}", {
        params: { path: { membershipId } },
        // `as never`: openapi-typescript types untyped `metadata: object` schemas as `{}`,
        // narrower than the actual free-form JSON the Kernel accepts.
        body: payload as never,
      }),
    ) as Promise<OrganizationMembership>,

  activate: (membershipId: string, joinedAt?: string) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/activate", {
        params: { path: { membershipId } },
        body: joinedAt ? { joinedAt } : undefined,
      }),
    ) as Promise<OrganizationMembership>,

  putOnLeave: (membershipId: string, payload?: LeaveOrDeactivatePayload) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/leave", {
        params: { path: { membershipId } },
        body: payload,
      }),
    ) as Promise<OrganizationMembership>,

  resume: (membershipId: string) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/resume", {
        params: { path: { membershipId } },
      }),
    ) as Promise<OrganizationMembership>,

  deactivate: (membershipId: string, payload?: LeaveOrDeactivatePayload) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/deactivate", {
        params: { path: { membershipId } },
        body: payload,
      }),
    ) as Promise<OrganizationMembership>,

  graduate: (membershipId: string) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/graduate", {
        params: { path: { membershipId } },
      }),
    ) as Promise<OrganizationMembership>,

  reactivate: (membershipId: string) =>
    apiRequest(() =>
      httpClient.POST("/memberships/{membershipId}/reactivate", {
        params: { path: { membershipId } },
      }),
    ) as Promise<OrganizationMembership>,
};
