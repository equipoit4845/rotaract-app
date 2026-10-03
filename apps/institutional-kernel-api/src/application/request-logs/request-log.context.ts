import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

/**
 * E9.3 — what a request log row may contain, and nothing else
 * (docs/16-developer-portal.md §Registros). Everything here is pure so the
 * redaction rules are unit-tested in isolation: no bodies, no tokens, no
 * query strings, no ids in the route, a truncated IP.
 */

/** What the request carries once a guard has authenticated it as an app. */
export type AppRequestMarks = {
  /** ServiceApiGuard: service token (client_credentials). */
  service?: { clientId?: string };
  /** OidcAccessGuard: user token issued to an app (`client_id`/`azp`). */
  oidc?: { clientId?: string; appId?: string };
  /** OAuthController: client authenticated at /oauth/token or /oauth/revoke. */
  developerAppRequest?: { clientId: string; appId?: string };
};

/** Problem details written by ProblemFilter / the OAuth error path. */
export type ProblemMark = { code?: string; type?: string };

export type RequestLogEntry = {
  clientId: string;
  appId?: string;
  method: string;
  route: string;
  status: number;
  problemCode: string | null;
  problemType: string | null;
  latencyMs: number;
  traceId: string;
  clientIp: string | null;
  createdAt: Date;
};

export const UNMATCHED_ROUTE = "(sin ruta)";
const GLOBAL_PREFIX = /^\/api\/kernel\/v1(?=\/|$)/;
const TRACEPARENT = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}(-.*)?$/i;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:\-]{1,128}$/;

/** Marks a request as made by an app (used where no guard sets `service`/`oidc`). */
export function markDeveloperAppRequest(
  request: object,
  app: { clientId: string; id?: string },
): void {
  (request as AppRequestMarks).developerAppRequest = {
    clientId: app.clientId,
    appId: app.id,
  };
}

/**
 * The app behind a request, or undefined if it was not authenticated as an
 * app. The development `x-service-api-key` bypass has no client and is not
 * logged.
 */
export function appIdentity(
  request: AppRequestMarks,
): { clientId: string; appId?: string } | undefined {
  if (request.developerAppRequest?.clientId) return request.developerAppRequest;
  if (request.oidc?.clientId)
    return { clientId: request.oidc.clientId, appId: request.oidc.appId };
  if (request.service?.clientId) return { clientId: request.service.clientId };
  return undefined;
}

/**
 * The request's trace id, also returned as `traceId` in Problem Details and
 * in `X-Trace-Id`: the trace-id of a valid W3C `traceparent`, else a safe
 * `X-Correlation-Id`, else a fresh 32-hex id.
 */
export function resolveTraceId(
  header: (name: string) => string | undefined,
): string {
  const traceparent = header("traceparent")?.trim();
  const fromTraceparent = traceparent?.match(TRACEPARENT)?.[1];
  if (fromTraceparent && !/^0+$/.test(fromTraceparent))
    return fromTraceparent.toLowerCase();
  const correlation = header("x-correlation-id")?.trim();
  if (correlation && SAFE_CORRELATION_ID.test(correlation)) return correlation;
  return randomBytes(16).toString("hex");
}

/** IPv4 → /24, IPv6 → /48 (zeroed host part). Anything else → null. */
export function truncateIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) return null;
    return `${groups.slice(0, 3).join(":")}::`;
  }
  return null;
}

function expandIpv6(ip: string): string[] | undefined {
  const withoutZone = ip.split("%")[0];
  const [head, tail] = withoutZone.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  if (withoutZone.includes("::")) {
    const missing = 8 - left.length - right.length;
    if (missing < 0) return undefined;
    return [...left, ...Array(missing).fill("0"), ...right].map(normalize);
  }
  return left.length === 8 ? left.map(normalize) : undefined;
}

function normalize(group: string): string {
  return (group || "0").replace(/^0+(?=.)/, "").toLowerCase();
}

/**
 * Route template without the global prefix and with `{param}` instead of
 * values (Express keeps the matched route's pattern in `req.route.path`).
 * Unmatched requests never fall back to the raw URL: it could carry ids.
 */
export function routeTemplate(routePath: unknown): string {
  if (typeof routePath !== "string" || !routePath) return UNMATCHED_ROUTE;
  const template = routePath
    .replace(GLOBAL_PREFIX, "")
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\*([A-Za-z0-9_]+)/g, "{$1}");
  return template || "/";
}

export function buildEntry(input: {
  identity: { clientId: string; appId?: string };
  method: string;
  routePath: unknown;
  status: number;
  problem: ProblemMark | undefined;
  latencyMs: number;
  traceId: string;
  ip: string | undefined;
  at: Date;
}): RequestLogEntry {
  const failed = input.status >= 400;
  return {
    clientId: input.identity.clientId,
    appId: input.identity.appId,
    method: input.method.toUpperCase().slice(0, 10),
    route: routeTemplate(input.routePath).slice(0, 300),
    status: input.status,
    problemCode: failed ? clip(input.problem?.code, 128) : null,
    problemType: failed ? clip(input.problem?.type, 300) : null,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    traceId: input.traceId.slice(0, 128),
    clientIp: truncateIp(input.ip),
    createdAt: input.at,
  };
}

function clip(value: string | undefined, max: number): string | null {
  return value ? value.slice(0, max) : null;
}
