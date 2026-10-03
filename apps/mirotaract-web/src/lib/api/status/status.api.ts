import { apiRequest, httpClient } from "../client/http-client";
import type {
  AddStatusIncidentUpdateRequest,
  CreateStatusIncidentRequest,
  StatusIncident,
  StatusIncidentFilter,
  StatusSummary,
  UpdateStatusIncidentRequest,
} from "./status.types";

/** E12.1 — `GET /status` (public) and the incident administration. */
export const statusApi = {
  summary: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/status", { signal: opts?.signal }),
    ) as Promise<StatusSummary>,

  listIncidents: (
    state: StatusIncidentFilter,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/status/incidents", {
        params: { query: { state } },
        signal: opts?.signal,
      }),
    ) as Promise<StatusIncident[]>,

  create: (payload: CreateStatusIncidentRequest) =>
    apiRequest(() =>
      httpClient.POST("/status/incidents", { body: payload }),
    ) as Promise<StatusIncident>,

  update: (incidentId: string, payload: UpdateStatusIncidentRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/status/incidents/{incidentId}", {
        params: { path: { incidentId } },
        body: payload,
      }),
    ) as Promise<StatusIncident>,

  addUpdate: (incidentId: string, payload: AddStatusIncidentUpdateRequest) =>
    apiRequest(() =>
      httpClient.POST("/status/incidents/{incidentId}/updates", {
        params: { path: { incidentId } },
        body: payload,
      }),
    ) as Promise<StatusIncident>,
};
