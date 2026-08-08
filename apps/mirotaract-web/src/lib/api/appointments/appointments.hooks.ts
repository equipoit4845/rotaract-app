"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { authorizationKeys } from "../authorization/authorization.keys";
import { appointmentsApi } from "./appointments.api";
import { appointmentKeys } from "./appointments.keys";
import type {
  Appointment,
  AppointmentFilters,
  CreateAppointmentRequest,
} from "./appointments.types";

export function useAppointments(
  organizationId: string | undefined,
  filters: AppointmentFilters = {},
) {
  return useQuery({
    queryKey: appointmentKeys.list(organizationId ?? "", filters),
    queryFn: ({ signal }) =>
      appointmentsApi.list(organizationId as string, filters, { signal }),
    enabled: Boolean(organizationId),
  });
}

/** `Appointment` is the only source of truth for who currently holds a position — no `isPresident` flags. */
export function useCurrentAuthorities(organizationId: string | undefined) {
  return useQuery({
    queryKey: appointmentKeys.currentAuthorities(organizationId ?? ""),
    queryFn: ({ signal }) =>
      appointmentsApi.currentAuthorities(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useAppointment(appointmentId: string | undefined) {
  return useQuery({
    queryKey: appointmentKeys.detail(appointmentId ?? ""),
    queryFn: ({ signal }) =>
      appointmentsApi.get(appointmentId as string, { signal }),
    enabled: Boolean(appointmentId),
  });
}

function invalidateAppointment(
  queryClient: QueryClient,
  appointment: Appointment,
) {
  queryClient.invalidateQueries({
    queryKey: appointmentKeys.detail(appointment.id),
  });
  queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
  queryClient.invalidateQueries({
    queryKey: appointmentKeys.currentAuthorities(appointment.organizationId),
  });
  // Activating/revoking an appointment can materialize or revoke a derived
  // RoleAssignment (kernel-openapi.yaml CA-APP-02/05), which changes what
  // `useCan`/`useEffectivePermissions` should report for the holder.
  queryClient.invalidateQueries({
    queryKey: authorizationKeys.allEffectivePermissions(),
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      payload,
    }: {
      organizationId: string;
      payload: CreateAppointmentRequest;
    }) => appointmentsApi.create(organizationId, payload),
    onSuccess: (appointment) => invalidateAppointment(queryClient, appointment),
  });
}

function useAppointmentTransitionMutation(
  fn: (appointmentId: string) => Promise<Appointment>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) => fn(appointmentId),
    onSuccess: (appointment) => invalidateAppointment(queryClient, appointment),
  });
}

export function useMarkAppointmentElected() {
  return useAppointmentTransitionMutation(appointmentsApi.markElected);
}

export function useActivateAppointment() {
  return useAppointmentTransitionMutation(appointmentsApi.activate);
}

export function useEndAppointment() {
  return useAppointmentTransitionMutation(appointmentsApi.end);
}

export function useRevokeAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      appointmentId,
      revokeReason,
    }: {
      appointmentId: string;
      revokeReason: string;
    }) => appointmentsApi.revoke(appointmentId, revokeReason),
    onSuccess: (appointment) => invalidateAppointment(queryClient, appointment),
  });
}
