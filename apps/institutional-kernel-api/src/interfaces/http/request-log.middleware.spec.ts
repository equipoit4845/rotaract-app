import { EventEmitter } from "node:events";

import type { RequestLogEntry } from "../../application/request-logs/request-log.context";
import type { RequestLogWriter } from "../../application/request-logs/request-log.writer";
import { RequestLogMiddleware, setProblemMark } from "./request-log.middleware";

function fakeExchange(
  marks: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const request = {
    method: "GET",
    ip: "203.0.113.9",
    headers: { authorization: "Bearer eyJsecret", ...headers },
    header: (name: string) => headers[name.toLowerCase()],
    route: { path: "/api/kernel/v1/service/persons/:personId" },
    originalUrl: "/api/kernel/v1/service/persons/per_123?email=x@y.z",
    body: { secret: "never" },
    ...marks,
  };
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    locals: {} as Record<string, unknown>,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  });
  return { request, response };
}

function middleware() {
  const recorded: RequestLogEntry[] = [];
  const writer = {
    record: (entry: RequestLogEntry) => recorded.push(entry),
  } as unknown as RequestLogWriter;
  return { mw: new RequestLogMiddleware(writer), recorded };
}

describe("RequestLogMiddleware (E9.3)", () => {
  it("gives every response an X-Trace-Id and the request a traceId", () => {
    const { mw } = middleware();
    const { request, response } = fakeExchange();
    const next = jest.fn();
    mw.use(request as any, response as any, next);
    expect(next).toHaveBeenCalled();
    expect(response.headers["X-Trace-Id"]).toMatch(/^[0-9a-f]{32}$/);
    expect((request as any).traceId).toBe(response.headers["X-Trace-Id"]);
  });

  it("records an app request once, with the problem and without secrets", () => {
    const { mw, recorded } = middleware();
    const { request, response } = fakeExchange(
      { service: { clientId: "mra_a" } },
      { "x-correlation-id": "corr-1" },
    );
    mw.use(request as any, response as any, () => undefined);
    response.statusCode = 403;
    setProblemMark(response, { code: "KERNEL_HTTP_403", type: "t" });
    response.emit("finish");
    response.emit("close");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      clientId: "mra_a",
      route: "/service/persons/{personId}",
      status: 403,
      problemCode: "KERNEL_HTTP_403",
      traceId: "corr-1",
      clientIp: "203.0.113.0",
    });
    const serialized = JSON.stringify(recorded[0]);
    expect(serialized).not.toContain("eyJsecret");
    expect(serialized).not.toContain("per_123");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("never");
  });

  it("does not record platform-session or anonymous requests", () => {
    const { mw, recorded } = middleware();
    const { request, response } = fakeExchange({
      user: { personId: "per_1" },
    });
    mw.use(request as any, response as any, () => undefined);
    response.emit("finish");
    expect(recorded).toHaveLength(0);
  });

  it("records aborted requests too (close without finish)", () => {
    const { mw, recorded } = middleware();
    const { request, response } = fakeExchange({
      oidc: { clientId: "mra_b", appId: "app_b" },
    });
    mw.use(request as any, response as any, () => undefined);
    response.emit("close");
    expect(recorded).toHaveLength(1);
    expect(recorded[0].appId).toBe("app_b");
  });
});
