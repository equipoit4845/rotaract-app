import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import request from "supertest";
import { parse, stringify } from "yaml";

import { RequestLogWriter } from "../src/application/request-logs/request-log.writer";
import { RequestLogsService } from "../src/application/request-logs/request-logs.service";
import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E9.3/E9.4 against the real stack (docs/16-developer-portal.md): an app
 * calls the Data API and /oauth/token, its requests show up in
 * GET /developer/apps/{appId}/request-logs filtered by traceId, status and
 * code, without personal data; the RDR of another district cannot read
 * them; old rows expire; Problem Details always carry the traceId; and an
 * operation marked deprecated in the contract answers with
 * Deprecation/Sunset/Link. Response validation against the contract is ON.
 */
describe("Request logs E2E (E9)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  let writer: RequestLogWriter;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const saved: Record<string, string | undefined> = {};
  let contractDir: string;

  let admin: string;
  let rdr: string;
  let otherRdr: string;
  let districtId: string;
  let clubA: string;
  let otherDistrictId: string;
  let appId: string;
  let clientId: string;
  let clientSecret: string;
  let serviceToken: string;

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post(`${base}/auth/register`)
      .send({ email, password, firstName: "E2E", lastName: label })
      .expect(201);
    await activateForTests(
      prisma,
      registered.body.id,
      registered.body.personId,
    );
    return {
      personId: registered.body.personId as string,
      login: async () =>
        (
          await request(http)
            .post(`${base}/auth/login`)
            .send({ email, password })
            .expect(200)
        ).body.accessToken as string,
    };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(http)
        .get(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(http)
        .post(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
  });

  async function organization(body: object) {
    const created = await as(admin).post("/organizations", body).expect(201);
    await as(admin)
      .post(`/organizations/${created.body.id}/activate`)
      .expect(201);
    return created.body.id as string;
  }

  const basic = (id: string, secret: string) =>
    `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;

  const logs = (token: string, query: Record<string, string> = {}) =>
    as(token).get(
      `/developer/apps/${appId}/request-logs?${new URLSearchParams(query)}`,
    );

  beforeAll(async () => {
    for (const key of [
      "KERNEL_OPENAPI_RUNTIME_VALIDATION",
      "KERNEL_OPENAPI_RESPONSE_VALIDATION",
      "KERNEL_OPENAPI_PATH",
      "KERNEL_REQUEST_LOGS_FLUSH_MS",
    ])
      saved[key] = process.env[key];
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    // Long interval: the test flushes explicitly, proving nothing is
    // written synchronously on the request path.
    process.env.KERNEL_REQUEST_LOGS_FLUSH_MS = "600000";
    // A copy of the real contract where the public event catalog is
    // deprecated, to exercise the Deprecation/Sunset headers end to end.
    const contract = parse(
      readFileSync(resolve(__dirname, "../../../kernel-openapi.yaml"), "utf8"),
    );
    Object.assign(contract.paths["/events/catalog"].get, {
      deprecated: true,
      "x-deprecated-at": "2026-10-04",
      "x-sunset": "2027-04-04",
    });
    contractDir = mkdtempSync(join(tmpdir(), "e9-contract-"));
    process.env.KERNEL_OPENAPI_PATH = join(contractDir, "kernel-openapi.yaml");
    writeFileSync(process.env.KERNEL_OPENAPI_PATH, stringify(contract));

    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();
    writer = app.get(RequestLogWriter);

    const superadmin = await account("admin");
    await prisma.userAccount.updateMany({
      where: { personId: superadmin.personId },
      data: { platformRole: "SUPERADMIN" },
    });
    admin = await superadmin.login();

    districtId = await organization({
      type: "DISTRICT",
      code: `D-${tag}`,
      name: `District ${tag}`,
      slug: `d-${tag}`,
    });
    clubA = await organization({
      type: "CLUB",
      code: `A-${tag}`,
      name: `Club A ${tag}`,
      slug: `a-${tag}`,
      parentId: districtId,
    });
    otherDistrictId = await organization({
      type: "DISTRICT",
      code: `D2-${tag}`,
      name: `Other district ${tag}`,
      slug: `d2-${tag}`,
    });

    const rdrAccount = await account("rdr");
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();

    const otherRdrAccount = await account("other-rdr");
    await grantRoleForTests(
      prisma,
      otherRdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      otherDistrictId,
    );
    otherRdr = await otherRdrAccount.login();

    const created = await as(rdr)
      .post("/developer/apps", {
        name: `Padrón ${tag}`,
        type: "CONFIDENTIAL",
        organizationId: clubA,
        grantTypes: ["client_credentials"],
        scopes: [
          "kernel.service.organizations.read",
          "kernel.service.memberships.read",
        ],
      })
      .expect(201);
    appId = created.body.app.id;
    clientId = created.body.app.clientId;
    clientSecret = created.body.clientSecret;
  });

  afterAll(async () => {
    const orgs = [clubA, districtId, otherDistrictId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    if (appId)
      await prisma.developerAppRequestLog.deleteMany({ where: { appId } });
    await prisma.developerApp.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
    });
    await prisma.kernelAuditLog.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [clubA].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [districtId, otherDistrictId].filter(Boolean) } },
    });
    await prisma.accountSession.deleteMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: accounts.map((a) => a.id) } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
    rmSync(contractDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });

  it("an app's calls are logged and can be found by traceId", async () => {
    const token = await request(http)
      .post(`${base}/oauth/token`)
      .set("authorization", basic(clientId, clientSecret))
      .set("x-correlation-id", `${tag}-token`)
      .type("form")
      .send({ grant_type: "client_credentials" })
      .expect(200);
    serviceToken = token.body.access_token;

    const ok = await request(http)
      .get(`${base}/service/organizations/${clubA}`)
      .set("authorization", `Bearer ${serviceToken}`)
      .set("x-correlation-id", `${tag}-ok`)
      .expect(200);
    expect(ok.headers["x-trace-id"]).toBe(`${tag}-ok`);

    // Outside the app's organization: 403, and the problem carries the traceId.
    const denied = await request(http)
      .get(`${base}/service/organizations/${otherDistrictId}`)
      .set("authorization", `Bearer ${serviceToken}`)
      .set(
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      )
      .expect(403);
    expect(denied.body.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(denied.headers["x-trace-id"]).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736",
    );

    // A scope the app does not have: an OAuth error, logged with its code.
    await request(http)
      .post(`${base}/oauth/token`)
      .set("authorization", basic(clientId, clientSecret))
      .set("x-correlation-id", `${tag}-scope`)
      .type("form")
      .send({
        grant_type: "client_credentials",
        scope: "kernel.service.persons.contact.read",
      })
      .expect(400);

    // Not the app's request (bad secret: the client never authenticated).
    await request(http)
      .post(`${base}/oauth/token`)
      .set("authorization", basic(clientId, "mrs_wrong"))
      .set("x-correlation-id", `${tag}-unauthenticated`)
      .type("form")
      .send({ grant_type: "client_credentials" })
      .expect(401);

    // Nothing is written on the request path: rows appear after the flush.
    expect(
      await prisma.developerAppRequestLog.count({ where: { appId } }),
    ).toBe(0);
    await writer.flush();

    const byTrace = await logs(rdr, {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    }).expect(200);
    expect(byTrace.body.items).toHaveLength(1);
    const [row] = byTrace.body.items;
    expect(row).toMatchObject({
      appId,
      method: "GET",
      route: "/service/organizations/{organizationId}",
      status: 403,
      code: "KERNEL_HTTP_403",
      type: "https://api.rotaract4845.com/errors/kernel_http_403",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    });
    expect(row.clientIp === null || /\.0$|::$/.test(row.clientIp)).toBe(true);
    // No ids, tokens or personal data anywhere in the row.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(otherDistrictId);
    expect(serialized).not.toContain(serviceToken);
    expect(serialized).not.toContain("example.test");

    const all = await logs(rdr).expect(200);
    const traces = all.body.items.map((item: any) => item.traceId);
    expect(traces).toEqual(
      expect.arrayContaining([
        `${tag}-token`,
        `${tag}-ok`,
        `${tag}-scope`,
        "4bf92f3577b34da6a3ce929d0e0e4736",
      ]),
    );
    expect(traces).not.toContain(`${tag}-unauthenticated`);
    // The RDR's own console calls are platform sessions, never logged as the app.
    expect(
      all.body.items.every((item: any) =>
        ["/oauth/token", "/service/organizations/{organizationId}"].includes(
          item.route,
        ),
      ),
    ).toBe(true);
  });

  it("filters by status class and error code", async () => {
    const ok = await logs(rdr, { status: "2xx" }).expect(200);
    expect(ok.body.items.map((item: any) => item.traceId).sort()).toEqual(
      [`${tag}-ok`, `${tag}-token`].sort(),
    );
    const errors = await logs(rdr, { status: "error" }).expect(200);
    expect(errors.body.items).toHaveLength(2);
    const scope = await logs(rdr, { code: "invalid_scope" }).expect(200);
    expect(scope.body.items).toEqual([
      expect.objectContaining({
        route: "/oauth/token",
        method: "POST",
        status: 400,
        type: "oauth",
        traceId: `${tag}-scope`,
      }),
    ]);
    const paged = await logs(rdr, { limit: "1" }).expect(200);
    expect(paged.body.pageInfo.hasMore).toBe(true);
    const next = await logs(rdr, {
      limit: "1",
      cursor: paged.body.pageInfo.nextCursor,
    }).expect(200);
    expect(next.body.items[0].id).not.toBe(paged.body.items[0].id);
    await logs(rdr, { status: "teapot" }).expect(400);
  });

  it("another district's admin cannot read them", async () => {
    const response = await logs(otherRdr, {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    }).expect(403);
    expect(response.body.traceId).toEqual(expect.any(String));
    // Not even by sending their own organization along.
    await as(otherRdr)
      .get(
        `/developer/apps/${appId}/request-logs?organizationId=${otherDistrictId}`,
      )
      .expect(403);
    await request(http)
      .get(`${base}/developer/apps/${appId}/request-logs`)
      .expect(401);
  });

  it("expires rows older than 30 days", async () => {
    const old = await prisma.developerAppRequestLog.create({
      data: {
        appId,
        method: "GET",
        route: "/service/organizations/{organizationId}",
        status: 200,
        latencyMs: 1,
        traceId: `${tag}-old`,
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
    });
    await app.get(RequestLogsService).purgeExpired();
    expect(
      await prisma.developerAppRequestLog.findUnique({ where: { id: old.id } }),
    ).toBeNull();
    expect(
      await prisma.developerAppRequestLog.count({ where: { appId } }),
    ).toBeGreaterThan(0);
  });

  it("operations marked deprecated answer with Deprecation, Sunset and Link", async () => {
    const response = await request(http)
      .get(`${base}/events/catalog`)
      .expect(200);
    expect(response.headers.deprecation).toBe(
      `@${Date.parse("2026-10-04") / 1000}`,
    );
    expect(response.headers.sunset).toBe("Sun, 04 Apr 2027 00:00:00 GMT");
    expect(response.headers.link).toBe(
      '<https://developers.rotaract4845.com/docs/deprecaciones#getEventCatalog>; rel="deprecation"; type="text/html"',
    );
    const other = await request(http)
      .get(`${base}/.well-known/openid-configuration`)
      .expect(200);
    expect(other.headers.deprecation).toBeUndefined();
  });
});
