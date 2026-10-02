"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { oauthApi } from "./oauth.api";
import { oauthKeys } from "./oauth.keys";
import type {
  AuthorizationContextQuery,
  AuthorizeRequest,
} from "./oauth.types";

/**
 * Validates an `/oauth/authorize` request and describes the app asking for
 * access. A 400 means the request itself is invalid (unknown app,
 * unregistered redirect URI…) — never retried, and the caller must show it
 * instead of redirecting anywhere.
 */
export function useAuthorizationContext(
  query: AuthorizationContextQuery | undefined,
) {
  return useQuery({
    queryKey: oauthKeys.authorizationContext(
      query ?? ({} as AuthorizationContextQuery),
    ),
    queryFn: ({ signal }) =>
      oauthApi.authorizationContext(query as AuthorizationContextQuery, {
        signal,
      }),
    enabled: Boolean(query),
    retry: false,
    staleTime: Infinity,
  });
}

/** Approve or deny; the response's `redirectTo` is where the browser goes next. */
export function useAuthorizeOAuthRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AuthorizeRequest) => oauthApi.authorize(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: oauthKeys.consents() }),
  });
}

/** Apps the signed-in person gave access to. */
export function useOAuthConsents() {
  return useQuery({
    queryKey: oauthKeys.consents(),
    queryFn: ({ signal }) => oauthApi.listConsents({ signal }),
  });
}

export function useRevokeOAuthConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) => oauthApi.revokeConsent(appId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: oauthKeys.consents() }),
  });
}
