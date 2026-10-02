// A tiny HTTP server that speaks the E6/E7 contract the CLI depends on:
// - GET /openapi.yaml                                   (served contract)
// - GET /api/kernel/v1/events/catalog                   (public event catalog)
// - GET /api/kernel/v1/developer-apps/:appId/webhooks/stream
//     SSE, Basic auth with the app's client credentials; first `event: ready`
//     with `{ "secret": "whsec_…" }`, then `event: webhook` with
//     `{ "headers": {...}, "body": "<raw json>" }` signed with that secret.
// Run standalone: node test/support/mock-kernel.mjs [port]
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

export const APP = {
  id: "app_123",
  clientId: "mra_test",
  clientSecret: "mrs_test",
};

export const OPENAPI_YAML = `openapi: 3.1.0
info: { title: Mock kernel, version: 1.0.0 }
paths:
  /service/organizations/{organizationId}/members:
    get:
      operationId: serviceListMembers
      parameters:
        - { name: organizationId, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/MemberViewPage" }
components:
  schemas:
    MembershipStatus:
      type: string
      enum: [ACTIVE, ON_LEAVE, INACTIVE]
    PersonView:
      type: object
      required: [id, displayName]
      properties:
        id: { type: string }
        displayName: { type: string }
        email: { type: [string, "null"] }
    MemberView:
      type: object
      required: [membershipId, status, person]
      properties:
        membershipId: { type: string }
        status: { $ref: "#/components/schemas/MembershipStatus" }
        memberNumber: { type: string, nullable: true }
        person: { $ref: "#/components/schemas/PersonView" }
        "from": { type: string }
    MemberViewPage:
      type: object
      required: [items]
      properties:
        items: { type: array, items: { $ref: "#/components/schemas/MemberView" } }
        pageInfo:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }
`;

export const CATALOG = {
  items: [
    {
      type: "membership.activated.v1",
      version: 1,
      description: "Una membresía pasó a ACTIVE.",
      example: {
        id: "evt_example",
        type: "membership.activated.v1",
        createdAt: "2026-10-02T12:00:00.000Z",
        organizationId: "org_1",
        data: {
          membershipId: "mem_1",
          personId: "per_1",
          status: "ACTIVE",
          joinedAt: null,
        },
      },
    },
    {
      type: "appointment.activated.v1",
      version: 1,
      description: "Cargo asumido.",
      example: {
        appointmentId: "apt_1",
        positionCode: "CLUB_PRESIDENT",
        periodId: "per_2026",
      },
    },
    {
      type: "ping.v1",
      version: 1,
      description: "Evento de prueba.",
      example: {},
    },
  ],
};

export function sign(secret, timestamp, body) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/** A webhook exactly as it would be POSTed, wrapped for the stream. */
export function streamEvent(secret, type, data, organizationId = "org_1") {
  const id = `evt_${randomBytes(6).toString("hex")}`;
  const body = JSON.stringify({
    id,
    type,
    createdAt: new Date().toISOString(),
    organizationId,
    data,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    id,
    body,
    payload: {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MiRotaract-Webhooks/1",
        "MiRotaract-Webhook-Id": id,
        "MiRotaract-Webhook-Timestamp": String(timestamp),
        "MiRotaract-Signature": `v1=${sign(secret, timestamp, body)}`,
      },
      body,
    },
  };
}

/**
 * options.script(connectionIndex, send, end): drives each stream connection.
 * Defaults to: ready + two events, then keep open.
 */
export async function startMockKernel(options = {}) {
  const connections = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/openapi.yaml" && options.serveSpec !== false) {
      res.writeHead(200, { "content-type": "application/yaml" });
      res.end(OPENAPI_YAML);
      return;
    }
    if (
      url.pathname === "/api/kernel/v1/events/catalog" &&
      options.serveCatalog !== false
    ) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(options.catalog ?? CATALOG));
      return;
    }
    const match = url.pathname.match(
      /^\/api\/kernel\/v1\/developer-apps\/([^/]+)\/webhooks\/stream$/,
    );
    if (match) {
      const expected = `Basic ${Buffer.from(`${APP.clientId}:${APP.clientSecret}`).toString("base64")}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { "content-type": "application/problem+json" });
        res.end(
          JSON.stringify({
            title: "Unauthorized",
            detail: "Credenciales de la app inválidas",
          }),
        );
        return;
      }
      if (match[1] !== APP.id) {
        res.writeHead(404, { "content-type": "application/problem+json" });
        res.end(
          JSON.stringify({ title: "Not Found", detail: "App inexistente" }),
        );
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const index = connections.length;
      const info = { headers: req.headers, res };
      connections.push(info);
      const secret =
        options.secret ?? `whsec_${randomBytes(32).toString("base64url")}`;
      const send = (event, data, id) => {
        res.write(
          `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
        );
      };
      const script =
        options.script ??
        ((_, s) => {
          s("ready", { secret });
          s(
            "webhook",
            streamEvent(secret, "membership.activated.v1", {
              membershipId: "m1",
            }).payload,
          );
          s("webhook", streamEvent(secret, "ping.v1", {}).payload);
        });
      res.write(": hola\n\n");
      script(index, send, () => res.end(), secret);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ message: `Cannot ${req.method} ${url.pathname}` }),
    );
  });
  await new Promise((resolve) =>
    server.listen(options.port ?? 0, "127.0.0.1", resolve),
  );
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    baseUrl: `http://127.0.0.1:${port}/api/kernel/v1`,
    connections,
    close: () =>
      new Promise((resolve) => {
        for (const c of connections) c.res.destroy();
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMockKernel({ port: Number(process.argv[2] ?? 0) });
  console.log(
    `mock kernel en ${mock.baseUrl} (app ${APP.id} / ${APP.clientId} / ${APP.clientSecret})`,
  );
}
