import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "http";
import type { AddressInfo } from "net";
import { resolve } from "path";
import { pathToFileURL } from "url";
import request from "supertest";

import { WebhookDispatcherService } from "../src/application/webhooks/webhook-dispatcher.service";
import { verifyWebhookSignature } from "../src/application/webhooks/signing";
import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E7 against the real stack (docs/13-events-and-webhooks.md): an app gets
 * an endpoint pointing to a local receiver, a membership activation in its
 * club arrives signed and verifies with the Kernel, the JS SDK and the
 * Python SDK; a failing receiver is retried with the same event id and can
 * be redelivered from the console API; the development stream emits the
 * same events. Response validation against kernel-openapi.yaml is ON.
 */
type Received = { headers: IncomingHttpHeaders; body: string };

describe("Webhooks E2E (E7)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  let baseUrl: string;
  let dispatcher: WebhookDispatcherService;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const saved: Record<string, string | undefined> = {};

  let admin: string;
  let rdr: string;
  let president: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;
  let appId: string;
  let clientId: string;
  let clientSecret: string;
  let endpointId: string;
  let webhookSecret: string;

  // --- local receiver --------------------------------------------------------
  let receiver: Server;
  let receiverUrl: string;
  let mode: "ok" | "fail" = "ok";
  const received: Received[] = [];

  // --- SDKs ---------------------------------------------------------------------
  let jsVerify: (options: {
    payload: string;
    headers: Record<string, unknown>;
    secret: string | string[];
  }) => Promise<{ id: string; type: string; data: any }>;

  function pythonVerify(
    body: string,
    headers: IncomingHttpHeaders,
    secret: string,
  ) {
    const python = process.env.MR_PYTHON ?? "python3";
    const script = [
      "import json, sys",
      "from mirotaract import verify_webhook",
      "args = json.load(sys.stdin)",
      "event = verify_webhook(args['body'].encode('utf-8'), args['headers'], args['secret'])",
      "print(json.dumps({'id': event['id'], 'type': event['type']}))",
    ].join("\n");
    const run = spawnSync(python, ["-c", script], {
      input: JSON.stringify({ body, headers, secret }),
      env: {
        ...process.env,
        PYTHONPATH: resolve(__dirname, "../../../sdks/python/src"),
      },
      encoding: "utf8",
    });
    if (
      run.status !== 0 &&
      /ModuleNotFoundError: No module named '(httpx|jwt)'/.test(run.stderr) &&
      process.env.MR_REQUIRE_PYTHON !== "true"
    ) {
      console.warn(
        "Python SDK dependencies missing: set MR_PYTHON to a venv with httpx and PyJWT",
      );
      return null;
    }
    if (run.status !== 0) throw new Error(run.stderr || run.stdout);
    return JSON.parse(run.stdout) as { id: string; type: string };
  }

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
    patch: (url: string, body: object) =>
      request(http)
        .patch(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
    delete: (url: string) =>
      request(http)
        .delete(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
  });

  async function organization(body: object) {
    const created = await as(admin).post("/organizations", body).expect(201);
    await as(admin)
      .post(`/organizations/${created.body.id}/activate`)
      .expect(201);
    return created.body.id as string;
  }

  /** Creates a person + PENDING membership in the club and activates it. */
  async function activateNewMember(organizationId: string, lastName: string) {
    const person = await as(admin)
      .post("/persons", { firstName: "Socia", lastName })
      .expect(201);
    const membership = await as(admin)
      .post(`/organizations/${organizationId}/memberships`, {
        personId: person.body.id,
      })
      .expect(201);
    await as(admin)
      .post(`/memberships/${membership.body.id}/activate`)
      .expect(201);
    return {
      personId: person.body.id as string,
      membershipId: membership.body.id as string,
    };
  }

  const hooks = () => `/developer/apps/${appId}/webhooks`;
  const ofType = (type: string) =>
    received.filter((item) => JSON.parse(item.body).type === type);

  beforeAll(async () => {
    for (const key of [
      "KERNEL_OPENAPI_RUNTIME_VALIDATION",
      "KERNEL_OPENAPI_RESPONSE_VALIDATION",
      "KERNEL_WEBHOOKS_ALLOW_INSECURE",
      "KERNEL_WEBHOOK_STREAM_ENABLED",
    ])
      saved[key] = process.env[key];
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    process.env.KERNEL_WEBHOOKS_ALLOW_INSECURE = "true";
    process.env.KERNEL_WEBHOOK_STREAM_ENABLED = "true";

    receiver = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        if (mode === "ok") res.writeHead(200).end("ok");
        else res.writeHead(500).end("receiver is down");
      });
    });
    await new Promise<void>((done) => receiver.listen(0, "127.0.0.1", done));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks/mirotaract`;

    app = await createTestApp();
    await app.listen(0, "127.0.0.1");
    http = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}${base}`;
    prisma = testPrisma();
    dispatcher = app.get(WebhookDispatcherService);
    // Drain whatever earlier suites left in the outbox, so each runOnce
    // below only sees this suite's events.
    await dispatcher.runOnce();

    const importEsm = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<any>;
    ({ verifyWebhook: jsVerify } = await importEsm(
      pathToFileURL(
        resolve(__dirname, "../../../packages/sdk-js/dist/esm/index.js"),
      ).href,
    ));

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
    const club = (label: string) =>
      organization({
        type: "CLUB",
        code: `${label}-${tag}`,
        name: `Club ${label} ${tag}`,
        slug: `${label.toLowerCase()}-${tag}`,
        parentId: districtId,
      });
    clubA = await club("A");
    clubB = await club("B");

    const rdrAccount = await account("rdr");
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();

    const presidentAccount = await account("president");
    await grantRoleForTests(
      prisma,
      presidentAccount.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubA,
    );
    president = await presidentAccount.login();

    const created = await as(rdr)
      .post("/developer/apps", {
        name: `Padrón ${tag}`,
        type: "CONFIDENTIAL",
        organizationId: clubA,
        grantTypes: ["client_credentials"],
        scopes: [
          "kernel.service.memberships.read",
          "kernel.service.authorities.read",
        ],
      })
      .expect(201);
    appId = created.body.app.id;
    clientId = created.body.app.clientId;
    clientSecret = created.body.clientSecret;
  });

  afterAll(async () => {
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId: { in: orgs } },
      select: { personId: true },
    });
    const personIds = [
      ...new Set([
        ...accounts.map((a) => a.personId),
        ...memberships.map((m) => m.personId),
      ]),
    ];
    // endpoints and deliveries cascade with the app
    await prisma.developerApp.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
    });
    await prisma.membershipTransition.deleteMany({
      where: { membership: { organizationId: { in: orgs } } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.kernelAuditLog.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [clubA, clubB].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({ where: { id: districtId } });
    await prisma.accountSession.deleteMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: accounts.map((a) => a.id) } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
    await new Promise((done) => {
      receiver.closeAllConnections();
      receiver.close(done);
    });
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });

  it("serves the public event catalog", async () => {
    const response = await request(http)
      .get(`${base}/events/catalog`)
      .expect(200);
    const types = response.body.events.map((event: any) => event.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "membership.activated.v1",
        "appointment.activated.v1",
        "ping.v1",
      ]),
    );
    const activated = response.body.events.find(
      (e: any) => e.type === "membership.activated.v1",
    );
    expect(activated.scope).toBe("kernel.service.memberships.read");
    expect(activated.example).toMatchObject({
      id: expect.stringMatching(/^evt_/),
      type: "membership.activated.v1",
    });
  });

  it("rejects unsafe URLs and events the app has no scope for", async () => {
    process.env.KERNEL_WEBHOOKS_ALLOW_INSECURE = "false";
    try {
      for (const url of [
        receiverUrl,
        "https://127.0.0.1/hook",
        "https://169.254.169.254/latest/meta-data",
        "https://localhost/hook",
      ]) {
        const response = await as(rdr)
          .post(hooks(), { url, eventTypes: ["membership.activated.v1"] })
          .expect(400);
        expect(JSON.stringify(response.body)).toMatch(/https|privada|local/);
      }
    } finally {
      process.env.KERNEL_WEBHOOKS_ALLOW_INSECURE = "true";
    }
    const scope = await as(rdr)
      .post(hooks(), { url: receiverUrl, eventTypes: ["period.created.v1"] })
      .expect(400);
    expect(JSON.stringify(scope.body)).toContain("kernel.service.periods.read");
  });

  it("creates an endpoint and shows its secret once; audits it", async () => {
    const created = await as(rdr)
      .post(hooks(), {
        url: receiverUrl,
        eventTypes: ["membership.activated.v1", "membership.ended.v1"],
        description: "Receptor local de la prueba",
      })
      .expect(201);
    expect(created.body.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.body.endpoint).toMatchObject({
      appId,
      url: receiverUrl,
      status: "ENABLED",
      secretHint: created.body.secret.slice(-4),
    });
    endpointId = created.body.endpoint.id;
    webhookSecret = created.body.secret;

    const listed = await as(rdr).get(hooks()).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(webhookSecret);
    const stored = await prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(stored.secretEnc).not.toContain(webhookSecret.slice(6));

    const audit = await prisma.kernelAuditLog.findMany({
      where: { resourceId: endpointId },
    });
    expect(audit.map((entry) => entry.action)).toContain(
      "createWebhookEndpoint",
    );
    expect(JSON.stringify(audit)).not.toContain(webhookSecret);
  });

  it("forbids people without kernel.app.manage / read on the app", async () => {
    await as(president).get(hooks()).expect(403);
    await as(president)
      .post(hooks(), {
        url: receiverUrl,
        eventTypes: ["membership.activated.v1"],
      })
      .expect(403);
    await as(president).post(`${hooks()}/${endpointId}/test`).expect(403);
  });

  it("delivers a signed membership.activated.v1 that verifies with the Kernel, the JS SDK and the Python SDK", async () => {
    received.length = 0;
    const inScope = await activateNewMember(clubA, `Activa ${tag}`);
    await activateNewMember(clubB, `Afuera ${tag}`); // other club: not in the app's tree

    const stats = await dispatcher.runOnce();
    expect(stats.succeeded).toBeGreaterThanOrEqual(1);
    const activations = ofType("membership.activated.v1");
    expect(activations).toHaveLength(1);
    const [delivery] = activations;
    const body = JSON.parse(delivery.body);
    expect(body).toMatchObject({
      id: expect.stringMatching(/^evt_/),
      type: "membership.activated.v1",
      organizationId: clubA,
      data: {
        membership: {
          membershipId: inScope.membershipId,
          personId: inScope.personId,
          status: "ACTIVE",
          person: { displayName: `Socia Activa ${tag}` },
        },
        previousStatus: "PENDING",
      },
    });
    expect(body.data.membership.person).not.toHaveProperty("email");
    expect(delivery.headers["mirotaract-webhook-id"]).toBe(body.id);
    expect(delivery.headers["user-agent"]).toBe("MiRotaract-Webhooks/1");
    expect(delivery.headers["content-type"]).toBe("application/json");
    expect(delivery.headers["mirotaract-signature"]).toMatch(
      /^v1=[0-9a-f]{64}$/,
    );

    expect(
      verifyWebhookSignature({
        secret: webhookSecret,
        timestamp: String(delivery.headers["mirotaract-webhook-timestamp"]),
        body: delivery.body,
        signature: String(delivery.headers["mirotaract-signature"]),
      }),
    ).toBe(true);
    const jsEvent = await jsVerify({
      payload: delivery.body,
      headers: delivery.headers as Record<string, unknown>,
      secret: webhookSecret,
    });
    expect(jsEvent).toMatchObject({
      id: body.id,
      type: "membership.activated.v1",
    });
    await expect(
      jsVerify({
        payload: delivery.body,
        headers: delivery.headers as any,
        secret: "whsec_wrong",
      }),
    ).rejects.toMatchObject({ code: "invalid_signature" });
    const pyEvent = pythonVerify(
      delivery.body,
      delivery.headers,
      webhookSecret,
    );
    if (pyEvent)
      expect(pyEvent).toEqual({ id: body.id, type: "membership.activated.v1" });

    const deliveries = await as(rdr)
      .get(`${hooks()}/${endpointId}/deliveries`)
      .expect(200);
    expect(deliveries.body.items[0]).toMatchObject({
      eventId: body.id,
      eventType: "membership.activated.v1",
      status: "SUCCEEDED",
      attempts: 1,
      lastResponseStatus: 200,
      lastLatencyMs: expect.any(Number),
    });
    expect(deliveries.body.items[0]).not.toHaveProperty("payload");

    // A second pass never sends it again.
    received.length = 0;
    await dispatcher.runOnce();
    expect(received).toHaveLength(0);
  });

  let failedDeliveryId: string;
  let failedEventId: string;

  it("retries a failing receiver with backoff and the same event id", async () => {
    received.length = 0;
    mode = "fail";
    const member = await activateNewMember(clubA, `Baja ${tag}`);
    await as(admin)
      .post(`/memberships/${member.membershipId}/deactivate`)
      .expect(201);
    await dispatcher.runOnce();
    const failedAttempts = received.filter(
      (r) => JSON.parse(r.body).type === "membership.ended.v1",
    );
    expect(failedAttempts).toHaveLength(1);
    failedEventId = JSON.parse(failedAttempts[0].body).id;
    expect(JSON.parse(failedAttempts[0].body).data).toMatchObject({
      reason: "INACTIVE",
      previousStatus: "ACTIVE",
    });

    const pending = await as(rdr)
      .get(`${hooks()}/${endpointId}/deliveries?status=PENDING`)
      .expect(200);
    const delivery = pending.body.items.find(
      (item: any) => item.eventId === failedEventId,
    );
    expect(delivery).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastResponseStatus: 500,
      lastResponseBody: "receiver is down",
    });
    failedDeliveryId = delivery.id;
    const wait =
      new Date(delivery.nextAttemptAt).getTime() -
      new Date(delivery.lastAttemptAt).getTime();
    expect(wait).toBeGreaterThanOrEqual(54_000); // 1 min − 10 % jitter
    expect(wait).toBeLessThanOrEqual(66_000);

    // Not due yet: nothing is sent.
    received.length = 0;
    await dispatcher.runOnce();
    expect(ofType("membership.ended.v1")).toHaveLength(0);

    const endpoint = await as(rdr).get(`${hooks()}/${endpointId}`).expect(200);
    expect(endpoint.body.consecutiveFailures).toBeGreaterThanOrEqual(1);
    expect(endpoint.body.failingSince).not.toBeNull();

    // Time passes (the receiver comes back).
    await prisma.webhookDelivery.update({
      where: { id: failedDeliveryId },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) },
    });
    mode = "ok";
    await dispatcher.runOnce();
    const retried = ofType("membership.ended.v1");
    expect(retried).toHaveLength(1);
    expect(retried[0].headers["mirotaract-webhook-id"]).toBe(failedEventId);
    expect(JSON.parse(retried[0].body).id).toBe(failedEventId);
    const done = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: failedDeliveryId },
    });
    expect(done).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
    const healthy = await prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
    });
    expect(healthy).toMatchObject({
      failingSince: null,
      consecutiveFailures: 0,
    });
  });

  it("marks a delivery FAILED once the 72 h window is over", async () => {
    mode = "fail";
    const member = await activateNewMember(clubA, `Ventana ${tag}`);
    await dispatcher.runOnce();
    const row = await prisma.webhookDelivery.findFirstOrThrow({
      where: {
        endpointId,
        eventType: "membership.activated.v1",
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(row.payload).data.membership.membershipId).toBe(
      member.membershipId,
    );
    await prisma.webhookDelivery.update({
      where: { id: row.id },
      data: {
        nextAttemptAt: new Date(Date.now() - 1_000),
        retryUntil: new Date(Date.now() - 1_000),
      },
    });
    await dispatcher.runOnce();
    const failed = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      attempts: 2,
      nextAttemptAt: null,
    });
    mode = "ok";
  });

  it("redelivers from the console: same id and body, one attempt", async () => {
    received.length = 0;
    const original = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: failedDeliveryId },
    });
    const redelivered = await as(rdr)
      .post(`${hooks()}/${endpointId}/deliveries/${failedDeliveryId}/redeliver`)
      .expect(202);
    expect(redelivered.body).toMatchObject({
      id: failedDeliveryId,
      status: "PENDING",
    });
    await dispatcher.runOnce();
    const again = ofType("membership.ended.v1");
    expect(again).toHaveLength(1);
    expect(again[0].body).toBe(original.payload);
    expect(again[0].headers["mirotaract-webhook-id"]).toBe(failedEventId);

    // A failed manual redelivery goes straight back to FAILED (no new schedule).
    mode = "fail";
    await as(rdr)
      .post(`${hooks()}/${endpointId}/deliveries/${failedDeliveryId}/redeliver`)
      .expect(202);
    await dispatcher.runOnce();
    const after = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { id: failedDeliveryId },
    });
    expect(after).toMatchObject({
      status: "FAILED",
      lastResponseStatus: 500,
      nextAttemptAt: null,
    });
    mode = "ok";

    const audit = await prisma.kernelAuditLog.findMany({
      where: { resourceId: endpointId },
    });
    expect(audit.map((entry) => entry.action)).toContain("redeliverWebhook");
  });

  it("sends a test ping, once, even with two workers racing", async () => {
    received.length = 0;
    const first = await as(rdr)
      .post(`${hooks()}/${endpointId}/test`)
      .expect(202);
    const second = await as(rdr)
      .post(`${hooks()}/${endpointId}/test`)
      .expect(202);
    expect(first.body).toMatchObject({
      eventType: "ping.v1",
      status: "PENDING",
    });
    await Promise.all([
      dispatcher.runOnce(),
      dispatcher.runOnce(),
      dispatcher.runOnce(),
    ]);
    const pings = ofType("ping.v1");
    expect(pings).toHaveLength(2);
    expect(new Set(pings.map((p) => JSON.parse(p.body).id))).toEqual(
      new Set([first.body.eventId, second.body.eventId]),
    );
    expect(JSON.parse(pings[0].body).data).toMatchObject({ appId, endpointId });
  });

  it("rotates the secret: both signatures for 24 h, the new one shown once", async () => {
    const rotated = await as(rdr)
      .post(`${hooks()}/${endpointId}/rotate-secret`)
      .expect(201);
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect(rotated.body.secret).not.toBe(webhookSecret);
    expect(rotated.body.endpoint.previousSecretExpiresAt).not.toBeNull();
    received.length = 0;
    await as(rdr).post(`${hooks()}/${endpointId}/test`).expect(202);
    await dispatcher.runOnce();
    const [ping] = ofType("ping.v1");
    const signature = String(ping.headers["mirotaract-signature"]);
    expect(signature.split(",")).toHaveLength(2);
    for (const secret of [rotated.body.secret, webhookSecret])
      await expect(
        jsVerify({ payload: ping.body, headers: ping.headers as any, secret }),
      ).resolves.toMatchObject({ type: "ping.v1" });
    const py = pythonVerify(ping.body, ping.headers, rotated.body.secret);
    if (py) expect(py.type).toBe("ping.v1");
    webhookSecret = rotated.body.secret;
  });

  it("stops delivering while disabled and auto-disables after 72 h of failures", async () => {
    await as(rdr)
      .patch(`${hooks()}/${endpointId}`, { status: "DISABLED" })
      .expect(200);
    received.length = 0;
    await activateNewMember(clubA, `Pausa ${tag}`);
    await dispatcher.runOnce();
    expect(received).toHaveLength(0);
    const enabled = await as(rdr)
      .patch(`${hooks()}/${endpointId}`, { status: "ENABLED" })
      .expect(200);
    expect(enabled.body).toMatchObject({
      status: "ENABLED",
      disabledReason: null,
    });
    // Events that happened while it was disabled are not queued for it
    // (docs: resync with the Data API's updatedSince).
    await dispatcher.runOnce();
    expect(received).toHaveLength(0);

    mode = "fail";
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { failingSince: new Date(Date.now() - 73 * 3_600_000) },
    });
    await as(rdr).post(`${hooks()}/${endpointId}/test`).expect(202);
    await dispatcher.runOnce();
    const disabled = await as(rdr).get(`${hooks()}/${endpointId}`).expect(200);
    expect(disabled.body).toMatchObject({
      status: "DISABLED",
      disabledReason: "AUTO_FAILURES",
    });
    const audit = await prisma.kernelAuditLog.findMany({
      where: { resourceId: endpointId, action: "autoDisableWebhookEndpoint" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorType).toBe("SYSTEM");
    mode = "ok";
    await as(rdr)
      .patch(`${hooks()}/${endpointId}`, { status: "ENABLED" })
      .expect(200);
  });

  it("streams the same signed events to `mirotaract webhooks listen`", async () => {
    const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const unauthorized = await fetch(
      `${baseUrl.replace("/api/kernel/v1", "")}/api/kernel/v1/developer-apps/${appId}/webhooks/stream`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:nope`).toString("base64")}`,
        },
      },
    );
    expect(unauthorized.status).toBe(401);

    const controller = new AbortController();
    const response = await fetch(
      `${baseUrl}/developer-apps/${appId}/webhooks/stream?events=membership.activated.v1`,
      {
        headers: { authorization: basic, accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const nextEvent = async (timeoutMs = 10_000) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const split = buffer.indexOf("\n\n");
        if (split >= 0) {
          const raw = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          if (raw.startsWith(":")) continue;
          const event = /^event: (.*)$/m.exec(raw)?.[1];
          const data = /^data: (.*)$/m.exec(raw)?.[1];
          return { event, data: data ? JSON.parse(data) : undefined };
        }
        if (Date.now() > deadline) throw new Error("no SSE event in time");
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("timeout")),
              deadline - Date.now(),
            ),
          ),
        ]);
        if (chunk.done) throw new Error("stream closed");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    };
    try {
      const ready = await nextEvent();
      expect(ready.event).toBe("ready");
      expect(ready.data).toMatchObject({
        appId,
        events: ["membership.activated.v1"],
      });
      const streamSecret = ready.data.secret as string;
      expect(streamSecret).toMatch(/^whsec_/);

      const member = await activateNewMember(clubA, `Stream ${tag}`);
      const webhook = await nextEvent(15_000);
      expect(webhook.event).toBe("webhook");
      const event = await jsVerify({
        payload: webhook.data.body,
        headers: webhook.data.headers,
        secret: streamSecret,
      });
      expect(event).toMatchObject({
        type: "membership.activated.v1",
        data: { membership: { membershipId: member.membershipId } },
      });
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }

    process.env.KERNEL_WEBHOOK_STREAM_ENABLED = "false";
    const off = await fetch(
      `${baseUrl}/developer/apps/${appId}/webhooks/stream`,
      {
        headers: { authorization: basic },
      },
    );
    expect(off.status).toBe(404);
    process.env.KERNEL_WEBHOOK_STREAM_ENABLED = "true";
  });

  it("deletes the endpoint and its deliveries", async () => {
    await as(rdr).delete(`${hooks()}/${endpointId}`).expect(204);
    await as(rdr).get(`${hooks()}/${endpointId}`).expect(404);
    expect(await prisma.webhookDelivery.count({ where: { endpointId } })).toBe(
      0,
    );
    const audit = await prisma.kernelAuditLog.findMany({
      where: { resourceId: endpointId },
    });
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "createWebhookEndpoint",
        "updateWebhookEndpoint",
        "rotateWebhookSecret",
        "sendWebhookTest",
        "deleteWebhookEndpoint",
      ]),
    );
  });
});
