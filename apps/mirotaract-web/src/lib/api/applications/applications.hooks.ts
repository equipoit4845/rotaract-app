"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { authorizationKeys } from "../authorization/authorization.keys";
import { membershipKeys } from "../memberships/memberships.keys";
import { applicationsApi } from "./applications.api";
import { applicationKeys } from "./applications.keys";
import type {
  ApplicationFilters,
  CreateMembershipApplicationRequest,
  MembershipApplication,
} from "./applications.types";

export function useMembershipApplications(filters: ApplicationFilters = {}) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: ({ signal }) => applicationsApi.list(filters, { signal }),
  });
}

export function useMembershipApplication(applicationId: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(applicationId ?? ""),
    queryFn: ({ signal }) =>
      applicationsApi.get(applicationId as string, { signal }),
    enabled: Boolean(applicationId),
  });
}

function invalidateApplication(
  queryClient: QueryClient,
  application: MembershipApplication,
  { membershipsAffected = false }: { membershipsAffected?: boolean } = {},
) {
  queryClient.invalidateQueries({
    queryKey: applicationKeys.detail(application.id),
  });
  queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
  if (membershipsAffected) {
    queryClient.invalidateQueries({
      queryKey: membershipKeys.organizationLists(),
    });
    queryClient.invalidateQueries({
      queryKey: membershipKeys.personList(application.requesterPersonId),
    });
    // Approval creates/reactivates the applicant's membership (CA-SOL-02),
    // which can change their effective permissions in that organization.
    queryClient.invalidateQueries({
      queryKey: authorizationKeys.allEffectivePermissions(),
    });
  }
}

export function useCreateMembershipApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMembershipApplicationRequest) =>
      applicationsApi.create(payload),
    onSuccess: (application) => invalidateApplication(queryClient, application),
  });
}

export function useSubmitMembershipApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      applicationsApi.submit(applicationId),
    onSuccess: (application) => invalidateApplication(queryClient, application),
  });
}

/** Approving an application creates or reactivates the applicant's membership (kernel-openapi.yaml CA-SOL-02). */
export function useApproveMembershipApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      applicationsApi.approve(applicationId),
    onSuccess: (application) =>
      invalidateApplication(queryClient, application, {
        membershipsAffected: true,
      }),
  });
}

export function useRejectMembershipApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      rejectionReason,
    }: {
      applicationId: string;
      rejectionReason: string;
    }) => applicationsApi.reject(applicationId, rejectionReason),
    onSuccess: (application) => invalidateApplication(queryClient, application),
  });
}

export function useCancelMembershipApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      applicationsApi.cancel(applicationId),
    onSuccess: (application) => invalidateApplication(queryClient, application),
  });
}
