import {
  UNMATCHED_ROUTE,
  appIdentity,
  buildEntry,
  markDeveloperAppRequest,
  resolveTraceId,
  routeTemplate,
  truncateIp,
} from "./request-log.context";

const headers =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

describe("request log redaction (E9.3)", () => {
  describe("truncateIp", () => {
    it("keeps only the /24 of an IPv4 address", () => {
      expect(truncateIp("181.120.34.77")).toBe("181.120.34.0");
    });
    it("unwraps IPv4-mapped IPv6", () => {
      expect(truncateIp("::ffff:10.1.2.3")).toBe("10.1.2.0");
    });
    it("keeps only the /48 of an IPv6 address", () => {
      expect(truncateIp("2800:a4:1234:5678:9abc::1")).toBe("2800:a4:1234::");
      expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::");
      expect(truncateIp("::1")).toBe("0:0:0::");
    });
    it("returns null for anything that is not an IP", () => {
      expect(truncateIp("")).toBeNull();
      expect(truncateIp(undefined)).toBeNull();
      expect(truncateIp("not-an-ip")).toBeNull();
    });
  });

  describe("routeTemplate", () => {
    it("strips the global prefix and replaces params with {name}", () => {
      expect(
        routeTemplate(
          "/api/kernel/v1/service/organizations/:organizationId/members",
        ),
      ).toBe("/service/organizations/{organizationId}/members");
    });
    it("never falls back to the raw URL (it could carry ids)", () => {
      expect(routeTemplate(undefined)).toBe(UNMATCHED_ROUTE);
      expect(routeTemplate("")).toBe(UNMATCHED_ROUTE);
    });
  });

  describe("resolveTraceId", () => {
    it("uses the trace-id of a valid traceparent", () => {
      expect(
        resolveTraceId(
          headers({
            traceparent:
              "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
            "x-correlation-id": "ignored",
          }),
        ),
      ).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    });
    it("falls back to a safe X-Correlation-Id", () => {
      expect(
        resolveTraceId(
          headers({
            traceparent: "garbage",
            "x-correlation-id": "app-asistencia-7f3a",
          }),
        ),
      ).toBe("app-asistencia-7f3a");
    });
    it("ignores unsafe correlation ids and generates one", () => {
      const id = resolveTraceId(
        headers({ "x-correlation-id": "<script>alert(1)</script>" }),
      );
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });
    it("rejects the all-zero trace-id", () => {
      expect(
        resolveTraceId(
          headers({
            traceparent:
              "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
          }),
        ),
      ).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("appIdentity", () => {
    it("recognizes service tokens, user tokens issued to an app and client auth", () => {
      expect(appIdentity({ service: { clientId: "mra_a" } })).toEqual({
        clientId: "mra_a",
      });
      expect(
        appIdentity({ oidc: { clientId: "mra_b", appId: "app_b" } }),
      ).toEqual({ clientId: "mra_b", appId: "app_b" });
      const request = {};
      markDeveloperAppRequest(request, { clientId: "mra_c", id: "app_c" });
      expect(appIdentity(request)).toEqual({
        clientId: "mra_c",
        appId: "app_c",
      });
    });
    it("ignores platform sessions and the dev x-service-api-key bypass", () => {
      expect(appIdentity({})).toBeUndefined();
      expect(appIdentity({ service: {} })).toBeUndefined();
    });
  });

  describe("buildEntry", () => {
    const base = {
      identity: { clientId: "mra_a" },
      method: "get",
      routePath: "/api/kernel/v1/service/persons/:personId",
      latencyMs: 12.6,
      traceId: "trace-1",
      ip: "181.120.34.77",
      at: new Date("2026-10-04T12:00:00Z"),
    };

    it("keeps only the allowed fields: no body, token, query or ids", () => {
      const entry = buildEntry({
        ...base,
        status: 403,
        problem: {
          code: "KERNEL_HTTP_403",
          type: "https://api.rotaract4845.com/errors/kernel_http_403",
        },
      });
      expect(Object.keys(entry).sort()).toEqual(
        [
          "appId",
          "clientId",
          "clientIp",
          "createdAt",
          "latencyMs",
          "method",
          "problemCode",
          "problemType",
          "route",
          "status",
          "traceId",
        ].sort(),
      );
      expect(entry).toMatchObject({
        method: "GET",
        route: "/service/persons/{personId}",
        status: 403,
        problemCode: "KERNEL_HTTP_403",
        latencyMs: 13,
        clientIp: "181.120.34.0",
      });
      expect(JSON.stringify(entry)).not.toMatch(/Bearer|eyJ|password/);
    });

    it("does not keep a problem on successful responses", () => {
      const entry = buildEntry({
        ...base,
        status: 200,
        problem: { code: "stale", type: "stale" },
      });
      expect(entry.problemCode).toBeNull();
      expect(entry.problemType).toBeNull();
    });
  });
});
