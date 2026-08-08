import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_KERNEL_API_URL = "https://kernel.test/api/kernel/v1";

// openapi-fetch resolves `globalThis.fetch` once, at `createClient()` time
// (module load below) — install an indirection shim first so each test can
// swap the underlying handler afterward instead of being stuck with
// whatever `fetch` looked like at import time.
let currentFetch = () => {
  throw new Error("no fetch handler installed for this test");
};
globalThis.fetch = (...args) => currentFetch(...args);

const { httpClient, apiRequest } =
  await import("../src/lib/api/client/http-client.ts");
const { tokenManager } = await import("../src/lib/api/client/token-manager.ts");

function mockFetch({ refreshOutcome = "success" } = {}) {
  const calls = { refresh: 0, kernel: [] };

  currentFetch = async (input, init) => {
    // The refresh-manager calls `fetch("/api/auth/refresh")` with a relative
    // URL, which `new Request()` can't resolve without a browser document
    // base — check the raw input before normalizing to a `Request`.
    const rawUrl = typeof input === "string" ? input : input.url;
    if (rawUrl.includes("/api/auth/refresh")) {
      calls.refresh += 1;
      if (refreshOutcome !== "success") {
        return new Response(JSON.stringify({ code: "INVALID_REFRESH" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          accessToken: "new-token",
          tokenType: "Bearer",
          expiresIn: 600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const req = input instanceof Request ? input : new Request(input, init);
    const entry = {
      auth: req.headers.get("Authorization"),
      idempotencyKey: req.headers.get("Idempotency-Key"),
      correlationId: req.headers.get("X-Correlation-Id"),
    };
    calls.kernel.push(entry);

    if (entry.auth === "Bearer old-token") {
      return new Response(
        JSON.stringify({ code: "UNAUTHORIZED", status: 401, title: "expired" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ id: "org_1" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  return calls;
}

test("concurrent 401s trigger exactly one refresh (single-flight) and each request retries exactly once, preserving Idempotency-Key and X-Correlation-Id", async () => {
  tokenManager.setSession("old-token", 600);
  const calls = mockFetch();

  const requests = [1, 2, 3].map(() =>
    apiRequest(() =>
      httpClient.POST("/organizations", { body: { name: "x" } }),
    ),
  );
  const results = await Promise.all(requests);

  assert.equal(
    calls.refresh,
    1,
    "refresh must be single-flight across concurrent 401s",
  );
  assert.equal(
    calls.kernel.length,
    6,
    "each of the 3 requests should be attempted, then retried once",
  );
  assert.deepEqual(
    results.map((r) => r.id),
    ["org_1", "org_1", "org_1"],
  );

  const attempts = calls.kernel.filter((c) => c.auth === "Bearer old-token");
  const retries = calls.kernel.filter((c) => c.auth === "Bearer new-token");
  assert.equal(attempts.length, 3);
  assert.equal(retries.length, 3);

  const key = (c) => `${c.idempotencyKey}::${c.correlationId}`;
  const attemptKeys = new Set(attempts.map(key));
  const retryKeys = new Set(retries.map(key));
  assert.equal(
    attemptKeys.size,
    3,
    "idempotency/correlation ids must be unique per logical request",
  );
  assert.deepEqual(
    attemptKeys,
    retryKeys,
    "the retry must reuse the exact same Idempotency-Key and X-Correlation-Id as the original attempt",
  );

  tokenManager.clearSession();
});

test("a request is retried at most once even if the refreshed token is still rejected", async () => {
  tokenManager.setSession("old-token", 600);
  let kernelCallCount = 0;
  currentFetch = async (input, init) => {
    const rawUrl = typeof input === "string" ? input : input.url;
    if (rawUrl.includes("/api/auth/refresh")) {
      return new Response(
        JSON.stringify({
          accessToken: "new-token",
          tokenType: "Bearer",
          expiresIn: 600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Every kernel call fails with 401, regardless of token, to prove there's no retry loop.
    kernelCallCount += 1;
    return new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  await assert.rejects(
    () => apiRequest(() => httpClient.GET("/organizations")),
    (error) => error.status === 401,
  );
  assert.equal(
    kernelCallCount,
    2,
    "exactly one attempt plus one retry — never an infinite refresh loop",
  );

  tokenManager.clearSession();
});

test("when refresh itself fails, the session is cleared and the original 401 propagates", async () => {
  tokenManager.setSession("old-token", 600);
  mockFetch({ refreshOutcome: "failure" });

  await assert.rejects(
    () => apiRequest(() => httpClient.GET("/organizations")),
    (error) => error.status === 401,
  );
  assert.equal(
    tokenManager.isAuthenticated(),
    false,
    "a failed refresh must clear the session",
  );
});

test("a network failure (offline/DNS/CORS) is normalized into a KernelApiError, never a raw fetch exception", async () => {
  const { KernelApiError } = await import("../src/lib/api/client/api-error.ts");
  currentFetch = async () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(
    () => apiRequest(() => httpClient.GET("/organizations")),
    (error) => {
      assert.ok(
        error instanceof KernelApiError,
        "must be a KernelApiError, not a raw TypeError",
      );
      assert.equal(error.status, 0);
      assert.equal(error.code, "NETWORK_ERROR");
      return true;
    },
  );
});
