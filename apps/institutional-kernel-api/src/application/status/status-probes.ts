/**
 * E12.1 — probes run by the worker every minute (docs/19-operations-e12.md).
 * Pure functions with an injectable `fetch`, so the classification rules are
 * unit-tested without a network.
 */
export type ProbeResult = "UP" | "DEGRADED" | "DOWN";

export type ProbeOutcome = {
  result: ProbeResult;
  latencyMs: number | null;
  /** Short technical reason, never personal data (max 200 chars). */
  detail: string | null;
};

export type FetchLike = (
  url: string,
  init: {
    method: string;
    redirect: "manual";
    signal: AbortSignal;
    headers?: Record<string, string>;
  },
) => Promise<{ status: number; json?: () => Promise<unknown> }>;

export type ProbeOptions = {
  fetch: FetchLike;
  /** Hard limit per request. */
  timeoutMs: number;
  /** A healthy answer slower than this is DEGRADED. */
  degradedMs: number;
  now?: () => number;
};

export const DEFAULT_PROBE_TIMEOUT_MS = 10_000;
export const DEFAULT_DEGRADED_MS = 3_000;

const RANK: Record<ProbeResult, number> = { UP: 0, DEGRADED: 1, DOWN: 2 };

export function worst(results: ProbeResult[]): ProbeResult {
  return results.reduce<ProbeResult>(
    (acc, r) => (RANK[r] > RANK[acc] ? r : acc),
    "UP",
  );
}

function clip(text: string): string {
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

/** Turns a network error into a short, stable reason. */
export function describeError(error: unknown): string {
  const e = error as {
    name?: string;
    code?: string;
    cause?: { code?: string };
  };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  const code = e?.cause?.code ?? e?.code;
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host not found";
  if (code === "ECONNRESET") return "connection reset";
  if (code) return String(code).toLowerCase();
  return "request failed";
}

/** Healthy = 2xx or a redirect (a login page may redirect). */
export function isHealthyStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

/** One HTTP target: UP, DEGRADED (slow) or DOWN (error / 4xx / 5xx). */
export async function probeHttp(
  url: string,
  options: ProbeOptions,
): Promise<ProbeOutcome & { body?: unknown }> {
  const now = options.now ?? Date.now;
  const started = now();
  try {
    const response = await options.fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { "user-agent": "mirotaract-status-probe/1" },
    });
    const latencyMs = Math.max(0, Math.round(now() - started));
    if (!isHealthyStatus(response.status))
      return { result: "DOWN", latencyMs, detail: `HTTP ${response.status}` };
    if (latencyMs > options.degradedMs)
      return {
        result: "DEGRADED",
        latencyMs,
        detail: `lento: ${latencyMs} ms`,
      };
    return { result: "UP", latencyMs, detail: null };
  } catch (error) {
    return {
      result: "DOWN",
      latencyMs: null,
      detail: clip(describeError(error)),
    };
  }
}

/**
 * Several targets of one component (e.g. Reuniones = API + web). All down
 * is DOWN; some down is DEGRADED (partial outage); otherwise the worst.
 */
export function combineTargets(
  outcomes: Array<ProbeOutcome & { url?: string }>,
): ProbeOutcome {
  if (outcomes.length === 0)
    return { result: "DOWN", latencyMs: null, detail: "sin destinos" };
  const down = outcomes.filter((o) => o.result === "DOWN");
  const latencies = outcomes
    .map((o) => o.latencyMs)
    .filter((l): l is number => typeof l === "number");
  const latencyMs = latencies.length ? Math.max(...latencies) : null;
  const details = outcomes
    .filter((o) => o.detail)
    .map((o) =>
      outcomes.length > 1 && o.url
        ? `${hostOf(o.url)}: ${o.detail}`
        : o.detail!,
    );
  const detail = details.length ? clip(details.join("; ")) : null;
  if (down.length === outcomes.length)
    return { result: "DOWN", latencyMs, detail };
  if (down.length > 0) return { result: "DEGRADED", latencyMs, detail };
  return { result: worst(outcomes.map((o) => o.result)), latencyMs, detail };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function probeHttpTargets(
  urls: string[],
  options: ProbeOptions,
): Promise<ProbeOutcome> {
  const outcomes = await Promise.all(
    urls.map(async (url) => ({ ...(await probeHttp(url, options)), url })),
  );
  return combineTargets(outcomes);
}

/**
 * "Ingresar con Mi Rotaract": the discovery document must answer and name
 * the JWKS and token endpoints, and the JWKS must publish at least one key.
 * `baseUrl` is the kernel's API base (…/api/kernel/v1) reachable from the
 * worker; the JWKS is read at the same base (the discovery document holds
 * the public URL, which may not be reachable from inside the network).
 */
export async function probeOidc(
  baseUrl: string,
  options: ProbeOptions,
): Promise<ProbeOutcome> {
  const base = baseUrl.replace(/\/$/, "");
  const now = options.now ?? Date.now;
  const started = now();
  try {
    const discovery = await options.fetch(
      `${base}/.well-known/openid-configuration`,
      {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      },
    );
    if (discovery.status !== 200)
      return {
        result: "DOWN",
        latencyMs: Math.round(now() - started),
        detail: `discovery HTTP ${discovery.status}`,
      };
    const document = (await discovery.json?.()) as Record<string, unknown>;
    if (
      !document ||
      typeof document.issuer !== "string" ||
      typeof document.jwks_uri !== "string" ||
      typeof document.token_endpoint !== "string"
    )
      return {
        result: "DOWN",
        latencyMs: Math.round(now() - started),
        detail: "discovery incompleto",
      };
    const jwks = await options.fetch(`${base}/.well-known/jwks.json`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const latencyMs = Math.round(now() - started);
    if (jwks.status !== 200)
      return { result: "DOWN", latencyMs, detail: `jwks HTTP ${jwks.status}` };
    const keys = ((await jwks.json?.()) as { keys?: unknown[] })?.keys;
    if (!Array.isArray(keys) || keys.length === 0)
      return { result: "DOWN", latencyMs, detail: "jwks sin claves" };
    if (latencyMs > options.degradedMs)
      return {
        result: "DEGRADED",
        latencyMs,
        detail: `lento: ${latencyMs} ms`,
      };
    return { result: "UP", latencyMs, detail: null };
  } catch (error) {
    return { result: "DOWN", latencyMs: null, detail: describeError(error) };
  }
}

export type WebhookBacklog = {
  /** Oldest outbox event not yet handed to the webhook fan-out. */
  oldestUnfannedAt: Date | null;
  /** Oldest delivery that is due and claimable but still waiting. */
  oldestOverdueAt: Date | null;
};

export const WEBHOOK_DEGRADED_LAG_MS = 5 * 60_000;
export const WEBHOOK_DOWN_LAG_MS = 15 * 60_000;

/**
 * The webhook pipeline is healthy while events and due deliveries leave the
 * queue quickly (the dispatcher runs every 5 s). A backlog older than 5 min
 * is DEGRADED, older than 15 min DOWN. Failing receivers do not count:
 * a delivery waiting for its next retry is not overdue.
 */
export function classifyWebhookBacklog(
  backlog: WebhookBacklog,
  now: Date,
  thresholds = {
    degradedMs: WEBHOOK_DEGRADED_LAG_MS,
    downMs: WEBHOOK_DOWN_LAG_MS,
  },
): ProbeOutcome {
  const lags = [backlog.oldestUnfannedAt, backlog.oldestOverdueAt]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => now.getTime() - d.getTime());
  const lag = lags.length ? Math.max(0, ...lags) : 0;
  const minutes = Math.round(lag / 60_000);
  if (lag > thresholds.downMs)
    return {
      result: "DOWN",
      latencyMs: null,
      detail: `cola demorada ${minutes} min`,
    };
  if (lag > thresholds.degradedMs)
    return {
      result: "DEGRADED",
      latencyMs: null,
      detail: `cola demorada ${minutes} min`,
    };
  return { result: "UP", latencyMs: null, detail: null };
}

/**
 * A single failed check is retried once after `delayMs` before it is
 * recorded: one dropped packet should not paint the page red.
 */
export async function withConfirmation(
  probe: () => Promise<ProbeOutcome>,
  delayMs: number,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ProbeOutcome> {
  const first = await probe();
  if (first.result !== "DOWN") return first;
  await sleep(delayMs);
  return probe();
}

/** Start of the UTC minute: one check per component and minute. */
export function minuteBucket(date: Date): Date {
  const d = new Date(date.getTime());
  d.setUTCSeconds(0, 0);
  return d;
}

/** UTC day (00:00) a check is summarised under. */
export function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
