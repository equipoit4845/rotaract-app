import createClient, { type Middleware } from "openapi-fetch";

import { KernelApiError } from "./api-error";
import { refreshManager } from "./refresh-manager";
import type { paths } from "./schema";
import { tokenManager } from "./token-manager";

const baseUrl = process.env.NEXT_PUBLIC_KERNEL_API_URL;
if (!baseUrl) {
  throw new Error("NEXT_PUBLIC_KERNEL_API_URL is not configured");
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * Requests currently in flight, keyed by openapi-fetch's per-call `id`.
 * Holds an unconsumed clone of the request exactly as sent (same
 * Idempotency-Key/X-Correlation-Id) so a 401 retry can replay the *same*
 * logical request instead of building a new one with fresh headers —
 * regenerating those headers on retry would defeat idempotency and break
 * correlation tracing (kernel-openapi.yaml `Idempotency-Key`/`X-Correlation-Id`).
 */
const inFlight = new Map<string, Request>();

const authMiddleware: Middleware = {
  async onRequest({ request, id }) {
    if (tokenManager.isExpiringSoon() && tokenManager.isAuthenticated()) {
      await refreshManager.refresh();
    }
    const token = tokenManager.getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);

    if (!request.headers.has("X-Correlation-Id")) {
      request.headers.set("X-Correlation-Id", crypto.randomUUID());
    }
    if (
      MUTATING_METHODS.has(request.method) &&
      !request.headers.has("Idempotency-Key")
    ) {
      request.headers.set("Idempotency-Key", crypto.randomUUID());
    }

    // Clone before the request body is consumed by the real fetch below.
    inFlight.set(id, request.clone());
    return request;
  },

  async onResponse({ response, id }) {
    const original = inFlight.get(id);
    inFlight.delete(id);

    if (response.status !== 401 || !original) return undefined;

    const refreshed = await refreshManager.refresh();
    if (!refreshed) return undefined;

    const token = tokenManager.getAccessToken();
    if (token) original.headers.set("Authorization", `Bearer ${token}`);
    // Bypasses the middleware pipeline entirely, so this can't retry itself again.
    return fetch(original);
  },

  async onError({ id }) {
    inFlight.delete(id);
  },
};

/** Direct client to the Institutional Kernel API. Only `client/*` and `<domain>.api.ts` files may import this. */
export const httpClient = createClient<paths>({ baseUrl });
httpClient.use(authMiddleware);

type FetchResult<T> = {
  data?: T;
  error?: unknown;
  response: Response;
};

/**
 * Unwraps an openapi-fetch call into `T`, or throws a normalized
 * `KernelApiError` — for both HTTP-level errors (openapi-fetch's `{error}`
 * result) and network-level failures (offline, DNS, CORS), which
 * openapi-fetch surfaces as a *rejected promise*, not an `{error}` result.
 * Components must never see a raw `TypeError`/`fetch` exception.
 */
export async function apiRequest<T>(
  call: () => Promise<FetchResult<T>>,
): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call();
  } catch (cause) {
    throw KernelApiError.network(cause);
  }
  if (result.error !== undefined) {
    throw KernelApiError.fromProblem(result.response, result.error);
  }
  return result.data as T;
}
