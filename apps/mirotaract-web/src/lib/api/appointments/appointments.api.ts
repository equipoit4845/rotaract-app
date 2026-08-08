import { apiRequest, httpClient } from "../client/http-client";
import type {
  Appointment,
  AppointmentFilters,
  CreateAppointmentRequest,
} from "./appointments.types";

export const appointmentsApi = {
  list: (
    organizationId: string,
    filters: AppointmentFilters,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/appointments", {
        params: { path: { organizationId }, query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<Appointment[]>,

  currentAuthorities: (
    organizationId: string,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/organizations/{organizationId}/authorities/current", {
        params: { path: { organizationId } },
        signal: opts?.signal,
      }),
    ) as Promise<Appointment[]>,

  get: (appointmentId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/appointments/{appointmentId}", {
        params: { path: { appointmentId } },
        signal: opts?.signal,
      }),
    ) as Promise<Appointment>,

  create: (organizationId: string, payload: CreateAppointmentRequest) =>
    apiRequest(() =>
      httpClient.POST("/organizations/{organizationId}/appointments", {
        params: { path: { organizationId } },
        body: payload,
      }),
    ) as Promise<Appointment>,

  markElected: (appointmentId: string) =>
    apiRequest(() =>
      httpClient.POST("/appointments/{appointmentId}/elect", {
        params: { path: { appointmentId } },
      }),
    ) as Promise<Appointment>,

  activate: (appointmentId: string) =>
    apiRequest(() =>
      httpClient.POST("/appointments/{appointmentId}/activate", {
        params: { path: { appointmentId } },
      }),
    ) as Promise<Appointment>,

  end: (appointmentId: string) =>
    apiRequest(() =>
      httpClient.POST("/appointments/{appointmentId}/end", {
        params: { path: { appointmentId } },
      }),
    ) as Promise<Appointment>,

  revoke: (appointmentId: string, revokeReason: string) =>
    apiRequest(() =>
      httpClient.POST("/appointments/{appointmentId}/revoke", {
        params: { path: { appointmentId } },
        body: { revokeReason },
      }),
    ) as Promise<Appointment>,
};
