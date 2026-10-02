/**
 * RFC 6749 §5.2 error. The token and revocation endpoints answer with
 * `{ error, error_description }` instead of Problem Details, because that
 * is what every OAuth client library expects.
 */
export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope"
  | "invalid_token"
  | "access_denied";

export class OAuthError extends Error {
  constructor(
    readonly error: OAuthErrorCode,
    readonly description?: string,
    /** 401 for client authentication failures, 400 otherwise. */
    readonly status: 400 | 401 = error === "invalid_client" ||
    error === "invalid_token"
      ? 401
      : 400,
  ) {
    super(description ?? error);
  }

  toJSON(): { error: OAuthErrorCode; error_description?: string } {
    return this.description
      ? { error: this.error, error_description: this.description }
      : { error: this.error };
  }
}
