"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { statusApi } from "./status.api";
import { statusKeys } from "./status.keys";
import type {
  AddStatusIncidentUpdateRequest,
  CreateStatusIncidentRequest,
  StatusIncidentFilter,
  UpdateStatusIncidentRequest,
} from "./status.types";

/** Live status (what the public page shows), refreshed every minute. */
export function useStatusSummary() {
  return useQuery({
    queryKey: statusKeys.summary(),
    queryFn: ({ signal }) => statusApi.summary({ signal }),
    refetchInterval: 60_000,
  });
}

export function useStatusIncidents(state: StatusIncidentFilter) {
  return useQuery({
    queryKey: statusKeys.incidentList(state),
    queryFn: ({ signal }) => statusApi.listIncidents(state, { signal }),
  });
}

function useRefreshStatus() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: statusKeys.all });
}

export function useCreateStatusIncident() {
  const refresh = useRefreshStatus();
  return useMutation({
    mutationFn: (payload: CreateStatusIncidentRequest) =>
      statusApi.create(payload),
    onSuccess: () => refresh(),
  });
}

export function useUpdateStatusIncident() {
  const refresh = useRefreshStatus();
  return useMutation({
    mutationFn: ({
      incidentId,
      payload,
    }: {
      incidentId: string;
      payload: UpdateStatusIncidentRequest;
    }) => statusApi.update(incidentId, payload),
    onSuccess: () => refresh(),
  });
}

export function useAddStatusIncidentUpdate() {
  const refresh = useRefreshStatus();
  return useMutation({
    mutationFn: ({
      incidentId,
      payload,
    }: {
      incidentId: string;
      payload: AddStatusIncidentUpdateRequest;
    }) => statusApi.addUpdate(incidentId, payload),
    onSuccess: () => refresh(),
  });
}
