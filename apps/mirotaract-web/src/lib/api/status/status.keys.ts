import type { StatusIncidentFilter } from "./status.types";

export const statusKeys = {
  all: ["status"] as const,
  summary: () => [...statusKeys.all, "summary"] as const,
  incidents: () => [...statusKeys.all, "incidents"] as const,
  incidentList: (state: StatusIncidentFilter) =>
    [...statusKeys.incidents(), state] as const,
};
