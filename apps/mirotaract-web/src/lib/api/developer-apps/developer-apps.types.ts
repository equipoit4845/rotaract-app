import type { components } from "../client/schema";

export type DeveloperApp = components["schemas"]["DeveloperApp"];
export type DeveloperAppType = components["schemas"]["DeveloperAppType"];
export type DeveloperAppStatus = components["schemas"]["DeveloperAppStatus"];
export type DeveloperAppGrantType = DeveloperApp["grantTypes"][number];
export type DeveloperAppSecretSummary =
  components["schemas"]["DeveloperAppSecretSummary"];
export type DeveloperAppSecretCreated =
  components["schemas"]["DeveloperAppSecretCreated"];
export type CreatedDeveloperApp = components["schemas"]["CreatedDeveloperApp"];
export type CreateDeveloperAppRequest =
  components["schemas"]["CreateDeveloperAppRequest"];
export type UpdateDeveloperAppRequest =
  components["schemas"]["UpdateDeveloperAppRequest"];
