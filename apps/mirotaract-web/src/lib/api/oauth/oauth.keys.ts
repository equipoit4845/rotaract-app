import type { AuthorizationContextQuery } from "./oauth.types";

export const oauthKeys = {
  all: ["oauth"] as const,
  authorizationContext: (query: AuthorizationContextQuery) =>
    [...oauthKeys.all, "authorization-context", query] as const,
  consents: () => [...oauthKeys.all, "consents"] as const,
};
