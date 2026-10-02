import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MiRotaractApiError,
  MiRotaractError,
  MiRotaractOAuthError,
} from "./errors.ts";
import { HttpClient, parseRetryAfter } from "./http.ts";

type Step =
  { status: number; body?: unknown; headers?: Record<string, string> } | Error;

function scripted(steps: Step[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return new Response(
      step.body === undefined ? null : JSON.stringify(step.body),
      {
        status: step.status,
        headers: { "content-type": "application/json", ...step.headers },
      },
    );
  };
  const waits: number[] = [];
  const sleep = async (ms: number) => {
    waits.push(ms);
  };
  return { calls, fetch, waits, sleep };
}

test("GET is retried on 503 and succeeds", async () => {
  const s = scripted([
    { status: 503 },
    { status: 502 },
    { status: 200, body: { ok: true } },
  ]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  const res = await http.request<{ ok: boolean }>({
    method: "GET",
    url: "https://x.test/a",
  });
  assert.deepEqual(res.data, { ok: true });
  assert.equal(s.calls.length, 3);
  assert.equal(s.waits.length, 2);
});

test("Retry-After (seconds) is honored", async () => {
  const s = scripted([
    { status: 429, headers: { "retry-after": "2" } },
    { status: 200, body: {} },
  ]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await http.request({ method: "GET", url: "https://x.test/a" });
  assert.deepEqual(s.waits, [2000]);
});

test("Retry-After longer than maxRetryDelayMs fails fast", async () => {
  const s = scripted([
    {
      status: 429,
      headers: { "retry-after": "120" },
      body: { status: 429, code: "RATE" },
    },
  ]);
  const http = new HttpClient({
    fetch: s.fetch,
    sleep: s.sleep,
    maxRetryDelayMs: 5000,
  });
  await assert.rejects(
    http.request({ method: "GET", url: "https://x.test/a" }),
    MiRotaractApiError,
  );
  assert.equal(s.calls.length, 1);
});

test("parseRetryAfter understands HTTP dates", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(parseRetryAfter("Thu, 01 Jan 2026 00:00:03 GMT", now), 3000);
  assert.equal(parseRetryAfter("nonsense"), undefined);
});

test("POST without Idempotency-Key is never retried", async () => {
  const s = scripted([
    { status: 503, body: { status: 503, code: "KERNEL_HTTP_503" } },
    { status: 200, body: {} },
  ]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await assert.rejects(
    http.request({ method: "POST", url: "https://x.test/a", json: {} }),
    (e: unknown) => {
      assert.ok(e instanceof MiRotaractApiError);
      assert.equal(e.status, 503);
      return true;
    },
  );
  assert.equal(s.calls.length, 1);
});

test("POST with Idempotency-Key is retried and keeps the same key", async () => {
  const s = scripted([{ status: 504 }, { status: 200, body: { done: 1 } }]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await http.request({
    method: "POST",
    url: "https://x.test/a",
    json: {},
    idempotencyKey: "k-1",
  });
  assert.equal(s.calls.length, 2);
  for (const call of s.calls)
    assert.equal(new Headers(call.init?.headers).get("idempotency-key"), "k-1");
});

test("gives up after maxRetries", async () => {
  const s = scripted([{ status: 503, body: { status: 503, code: "X" } }]);
  const http = new HttpClient({
    fetch: s.fetch,
    sleep: s.sleep,
    maxRetries: 3,
  });
  await assert.rejects(
    http.request({ method: "GET", url: "https://x.test/a" }),
    MiRotaractApiError,
  );
  assert.equal(s.calls.length, 4);
});

test("network errors are retried for GET and wrapped when persistent", async () => {
  const s = scripted([
    new TypeError("fetch failed"),
    { status: 200, body: { ok: 1 } },
  ]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  assert.deepEqual(
    (await http.request({ method: "GET", url: "https://x.test/a" })).data,
    { ok: 1 },
  );
  const p = scripted([new TypeError("fetch failed")]);
  const failing = new HttpClient({
    fetch: p.fetch,
    sleep: p.sleep,
    maxRetries: 1,
  });
  await assert.rejects(
    failing.request({ method: "GET", url: "https://x.test/a" }),
    MiRotaractError,
  );
  assert.equal(p.calls.length, 2);
});

test("Problem Details become MiRotaractApiError with all fields", async () => {
  const problem = {
    type: "https://api.rotaract4845.com/errors/kernel_http_403",
    title: "Request failed",
    status: 403,
    code: "KERNEL_HTTP_403",
    detail: "Fuera del alcance de esta app",
    instance: "/api/kernel/v1/service/organizations/x",
    traceId: "trc_1",
  };
  const s = scripted([{ status: 403, body: problem }]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await assert.rejects(
    http.request({ method: "GET", url: "https://x.test/a" }),
    (e: unknown) => {
      assert.ok(e instanceof MiRotaractApiError);
      assert.equal(e.status, 403);
      assert.equal(e.code, "KERNEL_HTTP_403");
      assert.equal(e.detail, "Fuera del alcance de esta app");
      assert.equal(e.traceId, "trc_1");
      assert.equal(e.title, "Request failed");
      return true;
    },
  );
});

test("RFC 6749 errors become MiRotaractOAuthError", async () => {
  const s = scripted([
    {
      status: 401,
      body: { error: "invalid_client", error_description: "nope" },
    },
  ]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await assert.rejects(
    http.request({ method: "POST", url: "https://x.test/token", form: {} }),
    (e: unknown) => {
      assert.ok(e instanceof MiRotaractOAuthError);
      assert.equal(e.error, "invalid_client");
      assert.equal(e.error_description, "nope");
      assert.equal(e.status, 401);
      return true;
    },
  );
});

test("304 is surfaced as notModified, with the ETag", async () => {
  const s = scripted([{ status: 304, headers: { etag: 'W/"abc"' } }]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  const res = await http.request({
    method: "GET",
    url: "https://x.test/a",
    headers: { "if-none-match": 'W/"abc"' },
  });
  assert.equal(res.notModified, true);
  assert.equal(res.etag, 'W/"abc"');
  assert.equal(res.data, undefined);
});

test("query values are serialized and undefined ones dropped", async () => {
  const s = scripted([{ status: 200, body: {} }]);
  const http = new HttpClient({ fetch: s.fetch, sleep: s.sleep });
  await http.request({
    method: "GET",
    url: "https://x.test/a",
    query: {
      a: 1,
      b: undefined,
      c: true,
      d: new Date("2026-01-01T00:00:00Z"),
      e: null,
    },
  });
  assert.equal(
    new URL(s.calls[0].url).search,
    "?a=1&c=true&d=2026-01-01T00%3A00%3A00.000Z",
  );
});
