import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server.js";

/** An MCP client connected in-process to a fresh server. */
export async function connect({ env = {}, fetch } = {}) {
  const { server, config } = await createServer({ env, fetch });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    config,
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args });
      return { ...result, text: result.content.map((c) => c.text).join("\n") };
    },
    close: () => client.close(),
  };
}

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/**
 * A fake local kernel with the synthetic district. `orgs` lets a test add a
 * non-synthetic organization; `calls` records every request.
 */
export function fakeKernel({ orgs, adminOk = true } = {}) {
  const calls = [];
  const organizations = orgs ?? [
    {
      id: "org_d",
      code: "SBX-D9999",
      name: "Distrito 9999 (sandbox)",
      type: "DISTRICT",
      slug: "distrito-9999-sandbox",
    },
    {
      id: "org_n",
      code: "SBX-NORTE",
      name: "Rotaract Club Sandbox Norte",
      type: "CLUB",
      slug: "sandbox-norte",
    },
  ];
  const apps = new Map();
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/kernel\/v1/, "");
    const body =
      init.body && init.headers?.["content-type"] === "application/json"
        ? JSON.parse(init.body)
        : init.body;
    calls.push({
      method: init.method ?? "GET",
      path,
      search: u.search,
      body,
      headers: init.headers ?? {},
    });
    if (path === "/auth/login") {
      if (
        !adminOk ||
        body.email !== "admin@example.org" ||
        body.password !== "sandbox-9999"
      )
        return json(401, { title: "Credenciales inválidas" });
      return json(200, {
        accessToken: "session-token",
        refreshToken: "r",
        tokenType: "Bearer",
        expiresIn: 600,
      });
    }
    if (path === "/organizations") {
      if (init.headers?.authorization !== "Bearer session-token")
        return json(401, {});
      const type = u.searchParams.get("type");
      return json(200, {
        items: organizations.filter((o) => !type || o.type === type),
        pageInfo: { hasMore: false, nextCursor: null },
      });
    }
    if (path === "/developer/apps" && init.method === "POST") {
      if (!init.headers?.["idempotency-key"])
        return json(400, { title: "Falta Idempotency-Key" });
      const app = {
        id: `app_${apps.size + 1}`,
        clientId: `mra_${"a".repeat(19)}${apps.size + 1}`,
        name: body.name,
        type: body.type,
        status: "ACTIVE",
        organizationId: body.organizationId,
        grantTypes: body.grantTypes,
        scopes: body.scopes,
        redirectUris: body.redirectUris,
        secrets: [],
      };
      const clientSecret =
        body.type === "CONFIDENTIAL" ? `mrs_secret_${app.id}` : null;
      apps.set(app.clientId, { app, clientSecret });
      return json(201, { app, clientSecret });
    }
    if (path === "/oauth/token") {
      const [id, secret] = Buffer.from(
        String(init.headers?.authorization ?? "").replace(/^Basic /, ""),
        "base64",
      )
        .toString()
        .split(":")
        .map(decodeURIComponent);
      const entry = apps.get(id);
      if (!entry || entry.clientSecret !== secret)
        return json(401, { error: "invalid_client" });
      const form = new URLSearchParams(init.body);
      const scope = form.get("scope") ?? entry.app.scopes.join(" ");
      if (scope.split(" ").some((s) => !entry.app.scopes.includes(s)))
        return json(400, { error: "invalid_scope" });
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const token = `${b64({ alg: "ES256", kid: "k1", typ: "JWT" })}.${b64({ iss: "http://localhost:54321/api/kernel/v1", aud: "institutional-kernel", sub: `app:${id}`, scope, token_use: "service" })}.sig`;
      return json(200, {
        access_token: token,
        token_type: "Bearer",
        expires_in: 600,
        scope,
      });
    }
    return json(404, { title: "no" });
  };
  return { fetch, calls };
}
