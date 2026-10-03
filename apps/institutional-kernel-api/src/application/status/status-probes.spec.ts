import {
  classifyWebhookBacklog,
  combineTargets,
  describeError,
  minuteBucket,
  probeHttp,
  probeHttpTargets,
  probeOidc,
  utcDay,
  withConfirmation,
  type FetchLike,
} from "./status-probes";
import { configuredComponents } from "./status-components";

/** A fake clock that advances by `latency` during each fetch. */
function fakeFetch(
  routes: Record<
    string,
    { status: number; body?: unknown; latency?: number } | Error
  >,
  clock: { t: number },
): FetchLike {
  return async (url) => {
    const route = routes[url];
    if (!route)
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ECONNREFUSED" },
      });
    if (route instanceof Error) throw route;
    clock.t += route.latency ?? 20;
    return { status: route.status, json: async () => route.body };
  };
}

function options(routes: Parameters<typeof fakeFetch>[0]) {
  const clock = { t: 1_000 };
  return {
    fetch: fakeFetch(routes, clock),
    timeoutMs: 1_000,
    degradedMs: 500,
    now: () => clock.t,
  };
}

describe("status probes (E12.1)", () => {
  it("HTTP: 2xx and redirects are UP, slow answers DEGRADED, errors DOWN", async () => {
    const o = options({
      "http://ok/": { status: 200, latency: 40 },
      "http://login/": { status: 307 },
      "http://slow/": { status: 200, latency: 900 },
      "http://broken/": { status: 503 },
      "http://missing/": { status: 404 },
    });
    expect(await probeHttp("http://ok/", o)).toEqual({
      result: "UP",
      latencyMs: 40,
      detail: null,
    });
    expect((await probeHttp("http://login/", o)).result).toBe("UP");
    expect(await probeHttp("http://slow/", o)).toEqual({
      result: "DEGRADED",
      latencyMs: 900,
      detail: "lento: 900 ms",
    });
    expect(await probeHttp("http://broken/", o)).toMatchObject({
      result: "DOWN",
      detail: "HTTP 503",
    });
    expect((await probeHttp("http://missing/", o)).result).toBe("DOWN");
    expect(await probeHttp("http://refused/", o)).toEqual({
      result: "DOWN",
      latencyMs: null,
      detail: "connection refused",
    });
  });

  it("network errors get short, stable reasons", () => {
    expect(
      describeError(Object.assign(new Error("x"), { name: "TimeoutError" })),
    ).toBe("timeout");
    expect(describeError({ cause: { code: "ENOTFOUND" } })).toBe(
      "host not found",
    );
    expect(describeError({ code: "ECONNRESET" })).toBe("connection reset");
    expect(describeError({ code: "EPIPE" })).toBe("epipe");
    expect(describeError(new Error("boom"))).toBe("request failed");
  });

  it("several targets: all down is DOWN, some down is DEGRADED (partial)", async () => {
    expect(
      combineTargets([
        {
          result: "DOWN",
          latencyMs: null,
          detail: "timeout",
          url: "http://a:1/",
        },
        {
          result: "DOWN",
          latencyMs: null,
          detail: "HTTP 502",
          url: "http://b:2/",
        },
      ]),
    ).toEqual({
      result: "DOWN",
      latencyMs: null,
      detail: "a:1: timeout; b:2: HTTP 502",
    });
    const partial = await probeHttpTargets(
      ["http://api/health", "http://web/"],
      options({ "http://api/health": { status: 200, latency: 30 } }),
    );
    expect(partial.result).toBe("DEGRADED");
    expect(partial.detail).toBe("web: connection refused");
    expect(combineTargets([]).result).toBe("DOWN");
    expect(
      combineTargets([
        { result: "UP", latencyMs: 10, detail: null },
        { result: "DEGRADED", latencyMs: 700, detail: "lento: 700 ms" },
      ]),
    ).toMatchObject({ result: "DEGRADED", latencyMs: 700 });
  });

  it("OIDC: discovery + JWKS with at least one key", async () => {
    const base = "http://api:3001/api/kernel/v1";
    const discovery = {
      issuer: "https://api.example/api/kernel/v1",
      jwks_uri: "https://api.example/api/kernel/v1/.well-known/jwks.json",
      token_endpoint: "https://api.example/api/kernel/v1/oauth/token",
    };
    const healthy = options({
      [`${base}/.well-known/openid-configuration`]: {
        status: 200,
        body: discovery,
      },
      [`${base}/.well-known/jwks.json`]: {
        status: 200,
        body: { keys: [{ kid: "k1" }] },
      },
    });
    expect((await probeOidc(base, healthy)).result).toBe("UP");

    const noKeys = options({
      [`${base}/.well-known/openid-configuration`]: {
        status: 200,
        body: discovery,
      },
      [`${base}/.well-known/jwks.json`]: { status: 200, body: { keys: [] } },
    });
    expect(await probeOidc(base, noKeys)).toMatchObject({
      result: "DOWN",
      detail: "jwks sin claves",
    });

    const incomplete = options({
      [`${base}/.well-known/openid-configuration`]: {
        status: 200,
        body: { issuer: "x" },
      },
    });
    expect((await probeOidc(`${base}/`, incomplete)).detail).toBe(
      "discovery incompleto",
    );

    const down = options({
      [`${base}/.well-known/openid-configuration`]: { status: 500 },
    });
    expect(await probeOidc(base, down)).toMatchObject({
      result: "DOWN",
      detail: "discovery HTTP 500",
    });
    expect((await probeOidc(base, options({}))).detail).toBe(
      "connection refused",
    );
  });

  it("webhooks: a backlog older than 5 min is DEGRADED, older than 15 min DOWN", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    expect(
      classifyWebhookBacklog(
        { oldestUnfannedAt: null, oldestOverdueAt: null },
        now,
      ).result,
    ).toBe("UP");
    expect(
      classifyWebhookBacklog(
        { oldestUnfannedAt: ago(1), oldestOverdueAt: ago(2) },
        now,
      ).result,
    ).toBe("UP");
    expect(
      classifyWebhookBacklog(
        { oldestUnfannedAt: ago(6), oldestOverdueAt: null },
        now,
      ),
    ).toEqual({
      result: "DEGRADED",
      latencyMs: null,
      detail: "cola demorada 6 min",
    });
    expect(
      classifyWebhookBacklog(
        { oldestUnfannedAt: ago(1), oldestOverdueAt: ago(20) },
        now,
      ).result,
    ).toBe("DOWN");
    // A future retry is not a backlog.
    expect(
      classifyWebhookBacklog(
        {
          oldestUnfannedAt: null,
          oldestOverdueAt: new Date(now.getTime() + 60_000),
        },
        now,
      ).result,
    ).toBe("UP");
  });

  it("a failure is confirmed once before it is recorded", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => void sleeps.push(ms);
    let calls = 0;
    const flaky = async () =>
      ++calls === 1
        ? { result: "DOWN" as const, latencyMs: null, detail: "timeout" }
        : { result: "UP" as const, latencyMs: 12, detail: null };
    expect((await withConfirmation(flaky, 2_000, sleep)).result).toBe("UP");
    expect(sleeps).toEqual([2_000]);

    calls = 0;
    const healthy = async () => ({
      result: "UP" as const,
      latencyMs: 5,
      detail: null,
    });
    await withConfirmation(healthy, 2_000, sleep);
    expect(sleeps).toHaveLength(1);

    const dead = async () => ({
      result: "DOWN" as const,
      latencyMs: null,
      detail: "x",
    });
    expect((await withConfirmation(dead, 10, sleep)).result).toBe("DOWN");
  });

  it("buckets: one per UTC minute, summaries per UTC day", () => {
    const t = new Date("2026-10-05T23:59:42.123Z");
    expect(minuteBucket(t).toISOString()).toBe("2026-10-05T23:59:00.000Z");
    expect(utcDay(t).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("components: production defaults, env overrides, `off`, sandbox only when set", () => {
    const defaults = configuredComponents({});
    expect(defaults.map((c) => c.key)).toEqual([
      "web",
      "api",
      "oidc",
      "webhooks",
      "meetings",
      "portal",
    ]);
    expect(defaults.find((c) => c.key === "meetings")!.urls).toHaveLength(2);
    const custom = configuredComponents({
      KERNEL_STATUS_PROBE_API_URLS: "http://127.0.0.1:55901/health/ready",
      KERNEL_STATUS_PROBE_MEETINGS_URLS: "off",
      KERNEL_STATUS_PROBE_SANDBOX_URLS:
        "https://api.sandbox.example/health/ready, ",
    });
    expect(custom.map((c) => c.key)).toEqual([
      "web",
      "api",
      "oidc",
      "webhooks",
      "portal",
      "sandbox",
    ]);
    expect(custom.find((c) => c.key === "api")!.urls).toEqual([
      "http://127.0.0.1:55901/health/ready",
    ]);
    expect(custom.find((c) => c.key === "sandbox")!.urls).toEqual([
      "https://api.sandbox.example/health/ready",
    ]);
  });
});
