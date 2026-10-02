import { apiRequest, httpClient } from "../client/http-client";
import type {
  AuthorizationContext,
  AuthorizationContextQuery,
  AuthorizeRequest,
  AuthorizeResponse,
  OAuthConsent,
} from "./oauth.types";

/**
 * Browser side of "Ingresar con Mi Rotaract": the consent screen and the
 * person's own list of connected apps. Token exchange (`/oauth/token`,
 * `/oauth/revoke`, `/oauth/userinfo`) is for the apps themselves and is
 * deliberately not exposed here.
 */
export const oauthApi = {
  authorizationContext: (
    query: AuthorizationContextQuery,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET("/oauth/authorize/context", {
        params: { query },
        signal: opts?.signal,
      }),
    ) as Promise<AuthorizationContext>,

  authorize: (payload: AuthorizeRequest) =>
    apiRequest(() =>
      httpClient.POST("/oauth/authorize", { body: payload }),
    ) as Promise<AuthorizeResponse>,

  listConsents: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/oauth/consents", { signal: opts?.signal }),
    ) as Promise<OAuthConsent[]>,

  revokeConsent: (appId: string) =>
    apiRequest(() =>
      httpClient.DELETE("/oauth/consents/{appId}", {
        params: { path: { appId } },
      }),
    ),
};
