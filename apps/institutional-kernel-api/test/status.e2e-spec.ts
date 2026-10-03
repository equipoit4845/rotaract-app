import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import type { AddressInfo } from "net";
import request from "supertest";

import { StatusProbeService } from "../src/application/status/status-probe.service";
import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E12.1 against the real stack (docs/19-operations-e12.md): the worker's
 * probes hit real HTTP targets (this very kernel, listening on a random
 * port, plus a closed port), checks are deduplicated per minute and folded
 * into the daily summary, GET /status and GET /status/history are public,
 * cacheable and free of personal data, and only kernel.status.manage
 * (RDR / SUPERADMIN) manages incidents and maintenances, under the rules.
 * Response validation against the contract is ON.
 *
 * Meant for a disposable database: it marks pending outbox rows as fanned
 * out so the webhook probe is deterministic.
 */
describe("Status E2E (E12.1)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  let probes: StatusProbeService;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const saved: Record<string, string | undefined> = {};
  const touchedBuckets: Date[] = [];
  const incidentIds: string[] = [];

  let admin: string;
  let rdr: string;
  let member: string;
  let districtId: string;

  const ENV = [
    "KERNEL_OPENAPI_RESPONSE_VALIDATION",
    "KERNEL_STATUS_PROBE_API_URLS",
    "KERNEL_STATUS_PROBE_OIDC_URLS",
    "KERNEL_STATUS_PROBE_WEB_URLS",
    "KERNEL_STATUS_PROBE_MEETINGS_URLS",
    "KERNEL_STATUS_PROBE_PORTAL_URLS",
    "KERNEL_STATUS_PROBE_SANDBOX_URLS",
    "KERNEL_STATUS_PROBE_RETRY_MS",
    "KERNEL_STATUS_PROBE_TIMEOUT_MS",
  ];

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
    patch: (url: string, body: object = {}) =>
      request(http)
        .patch(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .send(body),
  });

  const inHours = (h: number) =>
    new Date(Date.now() + h * 3_600_000).toISOString();

  async function runProbes(now = new Date()) {
    const bucket = new Date(now.getTime());
    bucket.setUTCSeconds(0, 0);
    touchedBuckets.push(bucket);
    return probes.runOnce(now);
  }

  beforeAll(async () => {
    for (const key of ENV) saved[key] = process.env[key];
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    app = await createTestApp();
    await app.listen(0, "127.0.0.1");
    const port = (app.getHttpServer().address() as AddressInfo).port;
    http = app.getHttpServer();
    prisma = testPrisma();
    probes = app.get(StatusProbeService);

    // Real targets: this kernel for api/oidc, a closed port (55999) for the web,
    // and both for Reuniones (a partial outage).
    const kernel = `http://127.0.0.1:${port}`;
    process.env.KERNEL_STATUS_PROBE_API_URLS = `${kernel}/health/ready`;
    process.env.KERNEL_STATUS_PROBE_OIDC_URLS = `${kernel}/api/kernel/v1`;
    process.env.KERNEL_STATUS_PROBE_WEB_URLS = "http://127.0.0.1:55999/login";
    process.env.KERNEL_STATUS_PROBE_MEETINGS_URLS = `${kernel}/health/live,http://127.0.0.1:55999/`;
    process.env.KERNEL_STATUS_PROBE_PORTAL_URLS = "off";
    process.env.KERNEL_STATUS_PROBE_SANDBOX_URLS = "";
    process.env.KERNEL_STATUS_PROBE_RETRY_MS = "10";
    process.env.KERNEL_STATUS_PROBE_TIMEOUT_MS = "3000";
    await prisma.outboxMessage.updateMany({
      where: { webhooksFannedOutAt: null },
      data: { webhooksFannedOutAt: new Date() },
    });

    const superadmin = await account("admin");
    await prisma.userAccount.updateMany({
      where: { personId: superadmin.personId },
      data: { platformRole: "SUPERADMIN" },
    });
    admin = await superadmin.login();
    const district = await as(admin)
      .post("/organizations", {
        type: "DISTRICT",
        code: `D-${tag}`,
        name: `District ${tag}`,
        slug: `d-${tag}`,
      })
      .expect(201);
    districtId = district.body.id;
    const rdrAccount = await account("rdr");
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();
    member = await (await account("member")).login();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.statusIncident.deleteMany({
        where: { id: { in: incidentIds } },
      });
      await prisma.statusCheck.deleteMany({
        where: { bucket: { in: touchedBuckets } },
      });
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.statusDailySummary.deleteMany({
        where: { day: { gt: today } },
      });
      const accounts = await prisma.userAccount.findMany({
        where: { email: { contains: tag } },
        select: { personId: true },
      });
      await prisma.roleAssignment.deleteMany({
        where: { personId: { in: accounts.map((a) => a.personId) } },
      });
      await prisma.$disconnect();
    }
    for (const key of ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await app?.close();
  });

  it("GET /status is public, cacheable and readable from any origin", async () => {
    const res = await request(http).get(`${base}/status`).expect(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=30, stale-while-revalidate=60",
    );
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(Array.isArray(res.body.components)).toBe(true);
    expect(typeof res.body.description).toBe("string");
  });

  it("probes real targets, one check per component and minute, folded into the day", async () => {
    const now = new Date();
    const results = await runProbes(now);
    const byKey = Object.fromEntries(results.map((r) => [r.component, r]));
    expect(Object.keys(byKey).sort()).toEqual([
      "api",
      "meetings",
      "oidc",
      "web",
      "webhooks",
    ]);
    expect(byKey.api.outcome.result).toBe("UP");
    expect(byKey.oidc.outcome.result).toBe("UP");
    expect(byKey.web.outcome).toMatchObject({
      result: "DOWN",
      detail: "connection refused",
    });
    expect(byKey.meetings.outcome.result).toBe("DEGRADED");
    expect(byKey.webhooks.outcome.result).toBe("UP");
    expect(results.every((r) => r.recorded)).toBe(true);

    // Same minute again (another worker, a retry): nothing is double counted.
    const again = await probes.runOnce(now);
    expect(again.every((r) => !r.recorded)).toBe(true);
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    const checks = await prisma.statusCheck.count({
      where: { component: "api", bucket: touchedBuckets[0] },
    });
    expect(checks).toBe(1);
    const summary = await prisma.statusDailySummary.findUniqueOrThrow({
      where: { component_day: { component: "web", day } },
    });
    expect(summary.down).toBeGreaterThanOrEqual(1);
  });

  it("GET /status reflects the probes, with uptime and no personal data", async () => {
    const res = await request(http).get(`${base}/status`).expect(200);
    const byKey = Object.fromEntries(
      res.body.components.map((c: any) => [c.key, c]),
    );
    expect(byKey.api.status).toBe("OPERATIONAL");
    expect(byKey.oidc.status).toBe("OPERATIONAL");
    expect(byKey.web.status).toBe("MAJOR_OUTAGE");
    expect(byKey.meetings.status).toBe("DEGRADED");
    expect(byKey.api.name).toBe("API del kernel");
    expect(typeof byKey.api.uptime90d).toBe("number");
    expect(byKey.api.lastCheckedAt).toEqual(expect.any(String));
    expect(res.body.status).toBe("MAJOR_OUTAGE");
    expect(res.body.description).toBe("Hay una interrupción importante");
  });

  it("only kernel.status.manage manages incidents", async () => {
    const body = {
      kind: "INCIDENT",
      title: `Login caído ${tag}`,
      components: ["web"],
      message: "Investigando.",
    };
    await request(http).post(`${base}/status/incidents`).send(body).expect(401);
    await as(member).post("/status/incidents", body).expect(403);
    await as(member).get("/status/incidents").expect(403);
  });

  let incidentId: string;

  it("the RDR opens an incident; it shows on the page without its author", async () => {
    const created = await as(rdr)
      .post("/status/incidents", {
        kind: "INCIDENT",
        title: `La API devuelve errores ${tag}`,
        components: ["api"],
        impact: "CRITICAL",
        message: "Estamos investigando errores 500 en la API.",
      })
      .expect(201);
    incidentId = created.body.id;
    incidentIds.push(incidentId);
    expect(created.body).toMatchObject({
      kind: "INCIDENT",
      state: "INVESTIGATING",
      impact: "CRITICAL",
    });
    expect(created.body.updates).toHaveLength(1);
    expect(JSON.stringify(created.body)).not.toMatch(
      /createdById|personId|example\.test/,
    );

    const status = await request(http).get(`${base}/status`).expect(200);
    const api = status.body.components.find((c: any) => c.key === "api");
    expect(api.status).toBe("MAJOR_OUTAGE"); // probe is UP, the incident says CRITICAL
    const shown = status.body.incidents.find((i: any) => i.id === incidentId);
    expect(shown.title).toContain("La API devuelve errores");
    expect(JSON.stringify(status.body)).not.toMatch(
      /createdById|example\.test/,
    );
  });

  it("updates move the incident through its states; RESOLVED is final", async () => {
    await as(rdr)
      .post(`/status/incidents/${incidentId}/updates`, {
        state: "IDENTIFIED",
        message: "Encontramos la causa.",
      })
      .expect(201);
    const resolved = await as(rdr)
      .post(`/status/incidents/${incidentId}/updates`, {
        state: "RESOLVED",
        message: "Resuelto.",
      })
      .expect(201);
    expect(resolved.body.state).toBe("RESOLVED");
    expect(resolved.body.resolvedAt).toEqual(expect.any(String));
    expect(resolved.body.updates.map((u: any) => u.state)).toEqual([
      "RESOLVED",
      "IDENTIFIED",
      "INVESTIGATING",
    ]);
    const reopen = await as(rdr)
      .post(`/status/incidents/${incidentId}/updates`, {
        state: "INVESTIGATING",
        message: "Volvió.",
      })
      .expect(400);
    expect(reopen.body.code).toBe("KERNEL_STATUS_INVALID");
    // Closed: only the title can be fixed.
    await as(rdr)
      .patch(`/status/incidents/${incidentId}`, { components: ["web"] })
      .expect(400);
    const fixed = await as(rdr)
      .patch(`/status/incidents/${incidentId}`, {
        title: `Errores 500 en la API ${tag}`,
      })
      .expect(200);
    expect(fixed.body.title).toContain("Errores 500");
    const status = await request(http).get(`${base}/status`).expect(200);
    expect(
      status.body.components.find((c: any) => c.key === "api").status,
    ).toBe("OPERATIONAL");
    expect(
      status.body.incidents.find((i: any) => i.id === incidentId),
    ).toBeUndefined();
  });

  it("maintenances are announced in advance and the worker starts them on time", async () => {
    const tooSoon = await as(admin)
      .post("/status/incidents", {
        kind: "MAINTENANCE",
        title: `Mantenimiento ${tag}`,
        components: ["web"],
        message: "Actualización.",
        scheduledStart: inHours(2),
        scheduledEnd: inHours(3),
      })
      .expect(400);
    expect(tooSoon.body.code).toBe("KERNEL_STATUS_INVALID");
    expect(tooSoon.body.errors[0].path).toBe("/scheduledStart");

    const announced = await as(rdr)
      .post("/status/incidents", {
        kind: "MAINTENANCE",
        title: `Actualización de Mi Rotaract ${tag}`,
        components: ["web"],
        message: "La web puede no responder durante unos minutos.",
        scheduledStart: inHours(48),
        scheduledEnd: inHours(49),
      })
      .expect(201);
    const maintenanceId = announced.body.id;
    incidentIds.push(maintenanceId);
    expect(announced.body).toMatchObject({
      state: "SCHEDULED",
      impact: "MAINTENANCE",
    });
    let status = await request(http).get(`${base}/status`).expect(200);
    expect(status.body.scheduledMaintenances.map((m: any) => m.id)).toContain(
      maintenanceId,
    );

    // The window opens: the worker starts it and the web shows MAINTENANCE
    // even though its probe keeps failing.
    const inside = new Date(Date.now() + 48.5 * 3_600_000);
    await runProbes(inside);
    const started = await prisma.statusIncident.findUniqueOrThrow({
      where: { id: maintenanceId },
      include: { updates: true },
    });
    expect(started.state).toBe("IN_PROGRESS");
    expect(started.updates.map((u) => u.message)).toContain(
      "Comenzó el mantenimiento programado.",
    );
    const insideBucket = touchedBuckets[touchedBuckets.length - 1];
    const check = await prisma.statusCheck.findUniqueOrThrow({
      where: { component_bucket: { component: "web", bucket: insideBucket } },
    });
    expect(check.inMaintenance).toBe(true);
    const insideDay = new Date(inside);
    insideDay.setUTCHours(0, 0, 0, 0);
    const summary = await prisma.statusDailySummary.findUniqueOrThrow({
      where: { component_day: { component: "web", day: insideDay } },
    });
    expect(summary).toMatchObject({ maintenance: 1, down: 0 });

    status = await request(http).get(`${base}/status`).expect(200);
    expect(
      status.body.components.find((c: any) => c.key === "web").status,
    ).toBe("MAINTENANCE");
    expect(status.body.incidents.map((i: any) => i.id)).toContain(
      maintenanceId,
    );

    // ...and completes it when the window closes.
    await probes.advanceMaintenances(new Date(Date.now() + 50 * 3_600_000));
    const done = await prisma.statusIncident.findUniqueOrThrow({
      where: { id: maintenanceId },
    });
    expect(done.state).toBe("COMPLETED");
  });

  it("the admin list filters by open/closed", async () => {
    const all = await as(admin).get("/status/incidents?state=all").expect(200);
    expect(all.body.map((i: any) => i.id)).toEqual(
      expect.arrayContaining(incidentIds),
    );
    const open = await as(rdr).get("/status/incidents?state=open").expect(200);
    expect(open.body.map((i: any) => i.id)).not.toContain(incidentId);
    await as(rdr).get("/status/incidents?state=maybe").expect(400);
  });

  it("GET /status/history: one bar per day, window uptime and the past incidents", async () => {
    const res = await request(http)
      .get(`${base}/status/history?days=7`)
      .expect(200);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=300, stale-while-revalidate=600",
    );
    expect(res.body.days).toBe(7);
    const web = res.body.components.find((c: any) => c.key === "web");
    expect(web.days).toHaveLength(7);
    const today = web.days[6];
    expect(today.date).toBe(new Date().toISOString().slice(0, 10));
    expect(today.checks).toBeGreaterThanOrEqual(1);
    expect(today.downMinutes).toBeGreaterThanOrEqual(1);
    expect(["PARTIAL_OUTAGE", "MAJOR_OUTAGE"]).toContain(today.status);
    const api = res.body.components.find((c: any) => c.key === "api");
    expect(api.uptime7d).toEqual(expect.any(Number));
    expect(res.body.incidents.map((i: any) => i.id)).toContain(incidentId);
    expect(JSON.stringify(res.body)).not.toMatch(/createdById|example\.test/);

    await request(http).get(`${base}/status/history?days=0`).expect(400);
    await request(http).get(`${base}/status/history?days=91`).expect(400);
    const full = await request(http).get(`${base}/status/history`).expect(200);
    expect(full.body.days).toBe(90);
    expect(full.body.components[0].days).toHaveLength(90);
  });
});
