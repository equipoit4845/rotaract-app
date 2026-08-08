/**
 * Public surface of the Kernel API layer. Components import hooks and
 * domain types from here only — never from `client/*` (http client,
 * schema, token/refresh internals) or a `<domain>.api.ts` file directly.
 */

export { KernelApiError } from "./client/api-error";
export { useIsAuthenticated } from "./client/use-is-authenticated";
export { useAuthStatus } from "./client/use-auth-status";
export type { AuthStatus } from "./client/token-manager";

export * from "./auth/auth.hooks";
export * from "./auth/auth.keys";
export type * from "./auth/auth.types";

export * from "./persons/persons.hooks";
export * from "./persons/persons.keys";
export type * from "./persons/persons.types";

export * from "./organizations/organizations.hooks";
export * from "./organizations/organizations.keys";
export * from "./organizations/use-active-organization";
export type * from "./organizations/organizations.types";

export * from "./memberships/memberships.hooks";
export * from "./memberships/memberships.keys";
export type * from "./memberships/memberships.types";

export * from "./periods/periods.hooks";
export * from "./periods/periods.keys";
export type * from "./periods/periods.types";

export * from "./positions/positions.hooks";
export * from "./positions/positions.keys";
export type * from "./positions/positions.types";

export * from "./appointments/appointments.hooks";
export * from "./appointments/appointments.keys";
export type * from "./appointments/appointments.types";

export * from "./authorization/authorization.hooks";
export * from "./authorization/authorization.keys";
export type * from "./authorization/authorization.types";

export * from "./applications/applications.hooks";
export * from "./applications/applications.keys";
export type * from "./applications/applications.types";

export * from "./transfers/transfers.hooks";
export * from "./transfers/transfers.keys";
export type * from "./transfers/transfers.types";

export * from "./modules/modules.hooks";
export * from "./modules/modules.keys";
export type * from "./modules/modules.types";
