import {
  DEPRECATION_POLICY_URL,
  deprecationHeaders,
  deprecationRules,
  findDeprecation,
} from "./deprecation.middleware";

const document = {
  paths: {
    "/service/organizations/{organizationId}/members": {
      get: {
        operationId: "serviceListMembers",
        deprecated: true,
        "x-deprecated-at": "2026-10-04",
        "x-sunset": "2027-04-04",
      },
      post: { operationId: "notDeprecated" },
    },
    "/service/persons/batch": {
      post: {
        operationId: "serviceBatchPersons",
        deprecated: true,
        "x-deprecated-at": "2026-10-04T00:00:00Z",
        "x-sunset": "2027-05-01",
        "x-deprecation-link": "https://example.org/migrar",
      },
    },
    "/health/live": { get: { operationId: "live" } },
  },
};

describe("Deprecation / Sunset headers (E9.4)", () => {
  const rules = deprecationRules(document);

  it("creates one rule per operation marked deprecated", () => {
    expect(rules.map((rule) => `${rule.method} ${rule.template}`)).toEqual([
      "GET /service/organizations/{organizationId}/members",
      "POST /service/persons/batch",
    ]);
  });

  it("matches the prefixed request path and method", () => {
    expect(
      findDeprecation(
        rules,
        "GET",
        "/api/kernel/v1/service/organizations/org_1/members",
      )?.template,
    ).toBe("/service/organizations/{organizationId}/members");
    expect(
      findDeprecation(
        rules,
        "POST",
        "/api/kernel/v1/service/organizations/org_1/members",
      ),
    ).toBeUndefined();
    expect(
      findDeprecation(
        rules,
        "GET",
        "/api/kernel/v1/service/organizations/org_1/members/extra",
      ),
    ).toBeUndefined();
  });

  it("formats Deprecation (RFC 9745), Sunset (RFC 8594) and Link", () => {
    const headers = deprecationHeaders(rules[0]);
    expect(headers).toEqual({
      Deprecation: `@${Date.parse("2026-10-04") / 1000}`,
      Sunset: "Sun, 04 Apr 2027 00:00:00 GMT",
      Link: `<${DEPRECATION_POLICY_URL}#serviceListMembers>; rel="deprecation"; type="text/html"`,
    });
    expect(deprecationHeaders(rules[1]).Link).toBe(
      '<https://example.org/migrar>; rel="deprecation"; type="text/html"',
    );
  });

  it("adds nothing when the contract has no deprecated operations", () => {
    expect(deprecationRules({ paths: {} })).toEqual([]);
    expect(deprecationRules(undefined)).toEqual([]);
    expect(findDeprecation([], "GET", "/anything")).toBeUndefined();
  });

  it("the real contract parses (no deprecated operations is valid)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require("yaml");
    const contract = parse(
      readFileSync(`${__dirname}/../../../../../kernel-openapi.yaml`, "utf8"),
    );
    for (const rule of deprecationRules(contract)) {
      expect(rule.deprecation).not.toBe("@0");
      expect(rule.sunset).toBeDefined();
    }
  });
});
