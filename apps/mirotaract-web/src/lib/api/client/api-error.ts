import type { components } from "./schema";

type ProblemDetails = components["schemas"]["Error"];

/**
 * Normalized error for every failed Kernel API call. Components read
 * `code`/`message`/`traceId` — never a raw fetch Response or Problem
 * Details body (kernel-openapi.yaml `Error` schema, RFC 9457).
 */
export class KernelApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly type?: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly traceId?: string;

  constructor(problem: Partial<ProblemDetails> & { status: number }) {
    super(problem.detail ?? problem.title ?? "Kernel API request failed");
    this.name = "KernelApiError";
    this.status = problem.status;
    this.code = problem.code ?? "UNKNOWN_ERROR";
    this.title = problem.title ?? "Unknown error";
    this.type = problem.type;
    this.detail = problem.detail;
    this.instance = problem.instance;
    this.traceId = problem.traceId;
  }

  /** `problem` is the already-parsed openapi-fetch `error` body (RFC 9457 Problem Details), if any. */
  static fromProblem(response: Response, problem: unknown): KernelApiError {
    if (isProblemDetails(problem)) {
      return new KernelApiError({ ...problem, status: response.status });
    }
    return new KernelApiError({
      status: response.status,
      title: response.statusText,
      code: `HTTP_${response.status}`,
    });
  }

  static network(cause: unknown): KernelApiError {
    return new KernelApiError({
      status: 0,
      code: "NETWORK_ERROR",
      title: "Network error",
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isInvalidTransition(): boolean {
    return this.code === "KERNEL_INVALID_TRANSITION";
  }

  /** Account locked after repeated failed logins (`POST /auth/login` 423 in kernel-openapi.yaml). */
  get isLocked(): boolean {
    return this.status === 423;
  }

  /** `x-rate-limited` endpoints (login, register, forgot-password, invitation accept) respond 429. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Single-use tokens (verify-email, reset-password) are `410 Gone` once consumed or expired. */
  get isGone(): boolean {
    return this.status === 410;
  }
}

function isProblemDetails(value: unknown): value is Partial<ProblemDetails> {
  return typeof value === "object" && value !== null && "code" in value;
}
