/**
 * Typed errors of the SDK.
 *
 * - `MiRotaractApiError`: the Kernel answered with Problem Details
 *   (RFC 9457), e.g. 403 "Fuera del alcance de esta app".
 * - `MiRotaractOAuthError`: the OAuth endpoints (`/oauth/*`) answered with an
 *   RFC 6749 error (`invalid_client`, `invalid_grant`, ...), or an ID/access
 *   token failed local verification (`invalid_token`), or the authorization
 *   callback carried `error=...`.
 * - `MiRotaractConfigError`: the SDK was configured in a way that is unsafe
 *   or impossible (e.g. a client secret in a browser).
 */
export class MiRotaractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MiRotaractError";
  }
}

export type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  instance?: string;
  traceId?: string;
  [key: string]: unknown;
};

export class MiRotaractApiError extends MiRotaractError {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly traceId: string | undefined;
  readonly type: string | undefined;
  readonly instance: string | undefined;
  /** Raw response body (parsed JSON when possible). */
  readonly body: unknown;

  constructor(
    status: number,
    problem: ProblemDetails | undefined,
    body?: unknown,
  ) {
    const code = problem?.code ?? `HTTP_${status}`;
    const title = problem?.title ?? `HTTP ${status}`;
    super(
      `${status} ${code}${problem?.detail ? `: ${problem.detail}` : ` ${title}`}`,
    );
    this.name = "MiRotaractApiError";
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = problem?.detail;
    this.traceId = problem?.traceId;
    this.type = problem?.type;
    this.instance = problem?.instance;
    this.body = body ?? problem;
  }
}

/**
 * 429: the app used up its quota (`code` `KERNEL_RATE_LIMITED`) or the
 * Kernel's per-IP limit. The SDK already retried what it safely could,
 * honoring `Retry-After`; this is what is left.
 */
export class MiRotaractRateLimitError extends MiRotaractApiError {
  /** Seconds the Kernel asked to wait (`Retry-After`), when it said. */
  readonly retryAfter: number | undefined;
  /** Raw `RateLimit-Policy` header, e.g. `"minute";q=100;w=60, "day";q=20000;w=86400`. */
  readonly rateLimitPolicy: string | undefined;
  /** Raw `RateLimit` header, e.g. `"minute";r=0;t=21, "day";r=19500;t=40210`. */
  readonly rateLimit: string | undefined;

  constructor(
    problem: ProblemDetails | undefined,
    body: unknown,
    info: {
      retryAfter?: number;
      rateLimitPolicy?: string;
      rateLimit?: string;
    } = {},
  ) {
    super(429, { code: "KERNEL_RATE_LIMITED", ...problem }, body);
    this.name = "MiRotaractRateLimitError";
    this.retryAfter = info.retryAfter;
    this.rateLimitPolicy = info.rateLimitPolicy;
    this.rateLimit = info.rateLimit;
  }
}

export class MiRotaractOAuthError extends MiRotaractError {
  /** RFC 6749 error code, e.g. `invalid_client`, `invalid_grant`, `invalid_token`. */
  readonly error: string;
  readonly errorDescription: string | undefined;
  /** HTTP status when the error came from the server; undefined for local checks. */
  readonly status: number | undefined;

  constructor(
    error: string,
    errorDescription?: string,
    status?: number,
    options?: { cause?: unknown },
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error, options);
    this.name = "MiRotaractOAuthError";
    this.error = error;
    this.errorDescription = errorDescription;
    this.status = status;
  }

  /** RFC 6749 spelling, for code ported from other OAuth libraries. */
  get error_description(): string | undefined {
    return this.errorDescription;
  }
}

export class MiRotaractConfigError extends MiRotaractError {
  constructor(message: string) {
    super(message);
    this.name = "MiRotaractConfigError";
  }
}
