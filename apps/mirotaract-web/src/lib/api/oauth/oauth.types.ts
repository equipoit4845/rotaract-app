import type { components, operations } from "../client/schema";

export type AuthorizationContext =
  components["schemas"]["AuthorizationContext"];
export type AuthorizationContextQuery =
  operations["getAuthorizationContext"]["parameters"]["query"];
export type AuthorizeRequest = components["schemas"]["AuthorizeRequest"];
export type AuthorizeResponse = components["schemas"]["AuthorizeResponse"];
export type AuthorizeDecision = AuthorizeRequest["decision"];
export type PublicDeveloperApp = components["schemas"]["PublicDeveloperApp"];
export type OAuthConsent = components["schemas"]["OAuthConsent"];
export type ScopeDescription = components["schemas"]["ScopeDescription"];
