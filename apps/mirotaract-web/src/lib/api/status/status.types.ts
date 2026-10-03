import type { components } from "../client/schema";

/** E12.1 — status page (docs/19-operations-e12.md). */
export type StatusSummary = components["schemas"]["StatusSummary"];
export type StatusComponentState = components["schemas"]["StatusComponent"];
export type StatusLevel = components["schemas"]["StatusLevel"];
export type StatusComponentKey = components["schemas"]["StatusComponentKey"];
export type StatusIncident = components["schemas"]["StatusIncident"];
export type StatusIncidentState = components["schemas"]["StatusIncidentState"];
export type StatusIncidentImpact =
  components["schemas"]["StatusIncidentImpact"];
export type CreateStatusIncidentRequest =
  components["schemas"]["CreateStatusIncidentRequest"];
export type UpdateStatusIncidentRequest =
  components["schemas"]["UpdateStatusIncidentRequest"];
export type AddStatusIncidentUpdateRequest =
  components["schemas"]["AddStatusIncidentUpdateRequest"];
export type StatusIncidentFilter = "open" | "closed" | "all";
