import type { AuthorizationContextQuery, AuthorizeRequest } from "@/lib/api";

export type AuthorizeParams = {
  context: AuthorizationContextQuery;
  state: string | null;
  nonce: string | null;
};

const REQUIRED = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "code_challenge",
  "code_challenge_method",
] as const;

/**
 * Reads the `/oauth/authorize` query. Returns `null` when a required
 * parameter is missing — the page then explains the problem instead of
 * asking the Kernel. Values are passed through untouched: the Kernel
 * validates them (and never redirects to an unregistered URI).
 */
export function readAuthorizeParams(
  searchParams: URLSearchParams,
): AuthorizeParams | null {
  if (REQUIRED.some((name) => !searchParams.get(name))) return null;
  return {
    context: {
      response_type: searchParams.get(
        "response_type",
      ) as AuthorizationContextQuery["response_type"],
      client_id: searchParams.get("client_id") as string,
      redirect_uri: searchParams.get("redirect_uri") as string,
      scope: searchParams.get("scope") as string,
      code_challenge: searchParams.get("code_challenge") as string,
      code_challenge_method: searchParams.get(
        "code_challenge_method",
      ) as AuthorizationContextQuery["code_challenge_method"],
    },
    state: searchParams.get("state"),
    nonce: searchParams.get("nonce"),
  };
}

export function toAuthorizeRequest(
  params: AuthorizeParams,
  decision: AuthorizeRequest["decision"],
): AuthorizeRequest {
  return {
    clientId: params.context.client_id,
    redirectUri: params.context.redirect_uri,
    scope: params.context.scope,
    codeChallenge: params.context.code_challenge,
    codeChallengeMethod: params.context.code_challenge_method,
    state: params.state,
    nonce: params.nonce,
    decision,
  };
}
