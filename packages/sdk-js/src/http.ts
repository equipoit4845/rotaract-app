import {
  MiRotaractApiError,
  MiRotaractError,
  MiRotaractOAuthError,
  MiRotaractRateLimitError,
  type ProblemDetails,
} from "./errors.ts";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpOptions = {
  /** Custom fetch (tests, proxies, instrumentation). Defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Retries after the first attempt for 429/502/503/504 and network errors. Default 2. */
  maxRetries?: number;
  /** Base of the exponential backoff, in ms. Default 300. */
  retryBaseDelayMs?: number;
  /** Longest wait the SDK accepts (Retry-After included); longer waits fail fast. Default 30 000. */
  maxRetryDelayMs?: number;
  /** Per-attempt timeout in ms. Default 30 000. 0 disables it. */
  timeoutMs?: number;
  /** Sent as User-Agent outside browsers. */
  userAgent?: string;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type QueryValue = string | number | boolean | Date | null | undefined;

export type HttpRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string | undefined>;
  /** Makes a POST retryable; sent as `Idempotency-Key`. */
  idempotencyKey?: string;
  /**
   * Retry this (non-idempotent) request on 429 only. For endpoints that
   * count the quota before doing anything, like `/oauth/token`.
   */
  retryOnRateLimit?: boolean;
  signal?: AbortSignal;
};

export type HttpResponse<T> = {
  status: number;
  headers: Headers;
  /** Parsed JSON body; undefined on 204/304 or empty bodies. */
  data: T;
  /** Weak or strong ETag, when the server sent one. */
  etag: string | undefined;
  /** True on `304 Not Modified` (only possible with `If-None-Match`). */
  notModified: boolean;
};

export const SDK_VERSION = "0.1.0";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isBrowserLike(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return typeof g.window !== "undefined" && typeof g.document !== "undefined";
}

export function buildUrl(
  url: string,
  query?: Record<string, QueryValue>,
): string {
  if (!query) return url;
  const target = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    target.searchParams.set(
      key,
      value instanceof Date ? value.toISOString() : String(value),
    );
  }
  return target.toString();
}

/** Seconds or HTTP-date (RFC 9110 §10.2.3) → milliseconds. */
export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 304) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function toError(
  status: number,
  body: unknown,
  headers?: Headers,
): MiRotaractError {
  if (status === 429) {
    const record =
      body && typeof body === "object"
        ? (body as ProblemDetails)
        : {
            status,
            detail:
              typeof body === "string" && body ? body.slice(0, 500) : undefined,
          };
    const retryAfterMs = parseRetryAfter(headers?.get("retry-after") ?? null);
    return new MiRotaractRateLimitError(record, body, {
      retryAfter:
        retryAfterMs === undefined ? undefined : Math.ceil(retryAfterMs / 1000),
      rateLimitPolicy: headers?.get("ratelimit-policy") ?? undefined,
      rateLimit: headers?.get("ratelimit") ?? undefined,
    });
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    // RFC 6749 §5.2 / RFC 6750 §3.1 shape: { error, error_description }.
    if (typeof record.error === "string" && typeof record.code !== "string")
      return new MiRotaractOAuthError(
        record.error,
        typeof record.error_description === "string"
          ? record.error_description
          : undefined,
        status,
      );
    return new MiRotaractApiError(status, record as ProblemDetails, body);
  }
  return new MiRotaractApiError(
    status,
    {
      status,
      detail: typeof body === "string" && body ? body.slice(0, 500) : undefined,
    },
    body,
  );
}

/**
 * fetch wrapper: JSON/form bodies, typed errors, retries with exponential
 * backoff + jitter on 429/502/503/504 honoring Retry-After. A POST/PATCH is
 * only retried when it carries an Idempotency-Key.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpOptions = {}) {
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl)
      throw new MiRotaractError(
        "No hay fetch disponible: usá Node 18+ o pasá la opción `fetch`.",
      );
    this.fetchImpl = fetchImpl;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.baseDelay = options.retryBaseDelayMs ?? 300;
    this.maxDelay = options.maxRetryDelayMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.userAgent = options.userAgent ?? `mirotaract-sdk-js/${SDK_VERSION}`;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const url = buildUrl(req.url, req.query);
    const headers = new Headers(req.headers);
    headers.set("accept", "application/json");
    if (!isBrowserLike() && !headers.has("user-agent"))
      headers.set("user-agent", this.userAgent);
    let body: string | undefined;
    if (req.form) {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(req.form))
        if (value !== undefined) form.set(key, value);
      body = form.toString();
      headers.set("content-type", "application/x-www-form-urlencoded");
    } else if (req.json !== undefined) {
      body = JSON.stringify(req.json);
      headers.set("content-type", "application/json");
    }
    if (req.idempotencyKey) headers.set("idempotency-key", req.idempotencyKey);
    const retryable =
      SAFE_METHODS.has(req.method) || Boolean(req.idempotencyKey);

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: req.method,
          headers,
          body,
          signal: this.signalFor(req.signal),
        });
      } catch (error) {
        if (req.signal?.aborted) throw error;
        if (retryable && attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt));
          continue;
        }
        throw new MiRotaractError(
          `No se pudo conectar con ${new URL(url).origin}: ${(error as Error)?.message ?? error}`,
          { cause: error },
        );
      }

      if (
        RETRYABLE_STATUS.has(response.status) &&
        (retryable || (response.status === 429 && req.retryOnRateLimit)) &&
        attempt < this.maxRetries
      ) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const wait = retryAfter ?? this.backoff(attempt);
        if (wait <= this.maxDelay) {
          await response.body?.cancel().catch(() => undefined);
          await this.sleep(wait);
          continue;
        }
      }

      const data = await readBody(response);
      if (response.status === 304)
        return {
          status: 304,
          headers: response.headers,
          data: undefined as T,
          etag: response.headers.get("etag") ?? undefined,
          notModified: true,
        };
      if (!response.ok) throw toError(response.status, data, response.headers);
      return {
        status: response.status,
        headers: response.headers,
        data: data as T,
        etag: response.headers.get("etag") ?? undefined,
        notModified: false,
      };
    }
  }

  private backoff(attempt: number): number {
    const exp = Math.min(this.maxDelay, this.baseDelay * 2 ** attempt);
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  }

  private signalFor(signal: AbortSignal | undefined): AbortSignal | undefined {
    if (!this.timeoutMs || typeof AbortSignal.timeout !== "function")
      return signal;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    if (!signal) return timeout;
    if (typeof AbortSignal.any === "function")
      return AbortSignal.any([signal, timeout]);
    return signal;
  }
}

/** RFC 6749 §2.3.1: each part form-urlencoded before base64. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${base64(
    `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`,
  )}`;
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
