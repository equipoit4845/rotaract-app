"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { appointmentKeys } from "../appointments/appointments.keys";
import { authorizationKeys } from "../authorization/authorization.keys";
import { periodsApi } from "./periods.api";
import { periodKeys } from "./periods.keys";
import type {
  CreatePeriodRequest,
  InstitutionalPeriod,
  PeriodStatus,
  UpdatePeriodRequest,
} from "./periods.types";

export function usePeriods(
  organizationId: string | undefined,
  status?: PeriodStatus,
) {
  return useQuery({
    queryKey: periodKeys.list(organizationId ?? "", status),
    queryFn: ({ signal }) =>
      periodsApi.list(organizationId as string, status, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useCurrentPeriod(organizationId: string | undefined) {
  return useQuery({
    queryKey: periodKeys.current(organizationId ?? ""),
    queryFn: ({ signal }) =>
      periodsApi.current(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function usePeriod(periodId: string | undefined) {
  return useQuery({
    queryKey: periodKeys.detail(periodId ?? ""),
    queryFn: ({ signal }) => periodsApi.get(periodId as string, { signal }),
    enabled: Boolean(periodId),
  });
}

/** A period mutation invalidates its own detail plus the owning organization's lists and current-period cache. */
function invalidatePeriod(
  queryClient: ReturnType<typeof useQueryClient>,
  period: InstitutionalPeriod,
) {
  queryClient.invalidateQueries({ queryKey: periodKeys.detail(period.id) });
  queryClient.invalidateQueries({ queryKey: periodKeys.lists() });
  queryClient.invalidateQueries({
    queryKey: periodKeys.current(period.organizationId),
  });
}

export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      payload,
    }: {
      organizationId: string;
      payload: CreatePeriodRequest;
    }) => periodsApi.create(organizationId, payload),
    onSuccess: (period) => invalidatePeriod(queryClient, period),
  });
}

export function useUpdateDraftPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      periodId,
      payload,
    }: {
      periodId: string;
      payload: UpdatePeriodRequest;
    }) => periodsApi.updateDraft(periodId, payload),
    onSuccess: (period) => invalidatePeriod(queryClient, period),
  });
}

function usePeriodTransitionMutation(
  fn: (periodId: string) => Promise<InstitutionalPeriod>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => fn(periodId),
    onSuccess: (period) => {
      invalidatePeriod(queryClient, period);
      // Activating/closing a period changes who holds active appointments
      // (close ends active appointments in the same transaction, CA-PER-04)
      // and therefore what they're authorized to do.
      queryClient.invalidateQueries({
        queryKey: appointmentKeys.currentAuthorities(period.organizationId),
      });
      queryClient.invalidateQueries({
        queryKey: authorizationKeys.allEffectivePermissions(),
      });
    },
  });
}

export function useSchedulePeriod() {
  return usePeriodTransitionMutation(periodsApi.schedule);
}

export function useActivatePeriod() {
  return usePeriodTransitionMutation(periodsApi.activate);
}

export function useClosePeriod() {
  return usePeriodTransitionMutation(periodsApi.close);
}

export function useCancelPeriod() {
  return usePeriodTransitionMutation(periodsApi.cancel);
}
