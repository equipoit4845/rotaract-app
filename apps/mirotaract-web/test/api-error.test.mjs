import assert from "node:assert/strict";
import test from "node:test";

const { KernelApiError } = await import("../src/lib/api/client/api-error.ts");

test("normalizes a Problem Details body into stable fields", () => {
  const response = new Response(null, { status: 409 });
  const problem = {
    type: "https://api.agendai.com.ar/errors/invalid-transition",
    title: "Invalid state transition",
    status: 409,
    code: "KERNEL_INVALID_TRANSITION",
    detail: "ACTIVE membership cannot transition directly to PENDING",
    instance: "/api/kernel/v1/memberships/mem_123/status",
    traceId: "trc_123",
  };

  const error = KernelApiError.fromProblem(response, problem);

  assert.equal(error.status, 409);
  assert.equal(error.code, "KERNEL_INVALID_TRANSITION");
  assert.equal(error.traceId, "trc_123");
  assert.equal(error.detail, problem.detail);
  assert.equal(error.isInvalidTransition, true);
  assert.equal(error.isForbidden, false);
});

test("isInvalidTransition depends only on the stable `code`, not the human-readable title/detail", () => {
  const response = new Response(null, { status: 409 });
  const error = KernelApiError.fromProblem(response, {
    code: "KERNEL_INVALID_TRANSITION",
    title: "algo completamente distinto en español",
    detail: undefined,
  });
  assert.equal(error.isInvalidTransition, true);
});

test("falls back to a synthesized error when the body isn't Problem Details shaped", () => {
  const response = new Response(null, {
    status: 500,
    statusText: "Internal Server Error",
  });
  const error = KernelApiError.fromProblem(response, "<html>not json</html>");
  assert.equal(error.status, 500);
  assert.equal(error.code, "HTTP_500");
});
