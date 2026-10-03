import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { validateManifestLocal, validateModuleManifest } from "../src/manifest.js";
import { isLocalKernel } from "../src/sandbox.js";
import { resolveConfig } from "../src/server.js";
import { connect, fakeKernel } from "./support.mjs";

const TOOLS = [
  "create_test_app",
  "describe_operation",
  "generate_types",
  "issue_test_token",
  "list_events",
  "list_permissions",
  "read_doc",
  "search_docs",
  "validate_module_manifest",
];

const GOOD_MANIFEST = {
  $schema: "https://developers.rotaract4845.com/schemas/module-manifest.v1.json",
  id: "reuniones",
  name: "Reuniones",
  description: "Asistencia y votaciones.",
  version: "1.0.0",
  contractVersion: 1,
  permissions: [{ code: "reuniones.meeting.manage", name: "Gestionar reuniones", scopeType: "ORGANIZATION" }],
  events: { subscribes: ["membership.activated.v1"], emits: [] },
  configurationSchema: { type: "object", properties: { quorum: { type: "integer" } }, additionalProperties: false },
  ui: { entryUrl: "https://reuniones.example.org", navLabel: "Reuniones", icon: "calendar" },
  oauth: { scopes: ["openid", "profile", "kernel.service.memberships.read"] },
};

describe("MCP tools (in-process client)", () => {
  let mcp;
  before(async () => {
    mcp = await connect({ env: {} });
  });
  after(() => mcp.close());

  test("lists every tool, with descriptions and read-only hints on the docs tools", async () => {
    const { tools } = await mcp.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);
    for (const t of tools) assert.ok(t.description.length > 40, t.name);
    assert.equal(tools.find((t) => t.name === "search_docs").annotations.readOnlyHint, true);
    assert.equal(tools.find((t) => t.name === "create_test_app").annotations.readOnlyHint, false);
    const info = mcp.client.getServerVersion();
    assert.equal(info.name, "mirotaract");
    assert.match(mcp.client.getInstructions(), /localStorage/);
  });

  test("search_docs finds the id_token verification section", async () => {
    const r = await mcp.call("search_docs", { query: "verificar id_token nonce jwks" });
    assert.match(r.text, /docs\/developers\/ingresar-con-mi-rotaract\.md/);
    const w = await mcp.call("search_docs", { query: "firma webhook timestamp", limit: 3 });
    assert.match(w.text.split("\n## 2.")[0], /webhooks\.md/);
    const none = await mcp.call("search_docs", { query: "zzzzqqq" });
    assert.match(none.text, /Sin resultados/);
  });

  test("read_doc returns a guide or one section", async () => {
    const full = await mcp.call("read_doc", { slug: "seguridad" });
    assert.match(full.text, /^# Seguridad/);
    const section = await mcp.call("read_doc", { slug: "webhooks", section: "3. Verificar la firma (obligatorio)" });
    assert.match(section.text, /cuerpo crudo/);
    const missing = await mcp.call("read_doc", { slug: "nope" });
    assert.equal(missing.isError, true);
  });

  test("describe_operation: scope, params and TS/Python/curl examples", async () => {
    const r = await mcp.call("describe_operation", { operationId: "serviceListMembers" });
    assert.match(r.text, /`GET \/service\/organizations\/\{organizationId\}\/members`/);
    assert.match(r.text, /kernel\.service\.memberships\.read/);
    assert.match(r.text, /\| `organizationId` \| path \| sí \|/);
    assert.match(r.text, /```ts\n[\s\S]*client\.members\.list/);
    assert.match(r.text, /```python\n[\s\S]*client\.members\.list/);
    assert.match(r.text, /```bash\n[\s\S]*grant_type=client_credentials[\s\S]*curl -s -X GET/);
  });

  test("describe_operation by concrete path; scope from the docs table; suggestions", async () => {
    const byPath = await mcp.call("describe_operation", { method: "GET", path: "/api/kernel/v1/service/persons/cm123" });
    assert.match(byPath.text, /serviceGetPerson/);
    assert.match(byPath.text, /kernel\.service\.persons\.read/);
    const person = await mcp.call("describe_operation", { operationId: "createMembership" });
    assert.match(person.text, /permiso `kernel\.membership\.create`/);
    const guess = await mcp.call("describe_operation", { operationId: "Members" });
    assert.equal(guess.isError, true);
    assert.match(guess.text, /serviceListMembers/);
  });

  test("list_permissions: kernel permissions with roles, service and OIDC scopes", async () => {
    const r = await mcp.call("list_permissions", {});
    assert.match(r.text, /\| `kernel\.membership\.read` \| Ver el padrón de socios \| .*MEMBER/);
    assert.match(r.text, /`kernel\.service\.persons\.contact\.read`/);
    assert.match(r.text, /`GET \/service\/organizations\/\{organizationId\}\/members`/);
    assert.match(r.text, /`openid`/);
    const filtered = await mcp.call("list_permissions", { kind: "service", query: "padrón" });
    assert.match(filtered.text, /kernel\.service\.memberships\.read/);
    assert.doesNotMatch(filtered.text, /kernel\.service\.periods\.read/);
  });

  test("list_events: table and one type with schema and example", async () => {
    const all = await mcp.call("list_events", {});
    assert.match(all.text, /`membership\.activated\.v1`/);
    assert.match(all.text, /HMAC-SHA256/);
    const one = await mcp.call("list_events", { type: "membership.ended.v1" });
    assert.match(one.text, /JSON Schema de `data`/);
    assert.match(one.text, /"type": "membership\.ended\.v1"/);
    assert.equal((await mcp.call("list_events", { type: "x.v1" })).isError, true);
  });

  test("validate_module_manifest accepts a good manifest and explains a bad one", async () => {
    const ok = JSON.parse((await mcp.call("validate_module_manifest", { manifest: GOOD_MANIFEST })).text);
    assert.equal(ok.ok, true, JSON.stringify(ok.errors));
    assert.match(ok.validator, /local|module-manifest/);
    const bad = JSON.parse(
      (
        await mcp.call("validate_module_manifest", {
          manifest: JSON.stringify({ ...GOOD_MANIFEST, permissions: [{ code: "kernel.membership.read", name: "x", scopeType: "CLUB" }], events: { subscribes: ["membership.ended.v1", "nope.v1"] }, oauth: { scopes: ["openid"] } }),
        })
      ).text,
    );
    assert.equal(bad.ok, false);
    const paths = bad.errors.map((e) => e.path);
    assert.ok(paths.includes("/permissions/0/code"));
    assert.ok(paths.includes("/permissions/0/scopeType"));
    assert.ok(paths.includes("/events/subscribes/0")); // needs memberships.read
    assert.ok(paths.includes("/events/subscribes/1")); // not in catalog
    const notJson = JSON.parse((await mcp.call("validate_module_manifest", { manifest: "{oops" })).text);
    assert.equal(notJson.ok, false);
  });

  test("generate_types reuses the CLI generators", async () => {
    const events = await mcp.call("generate_types", { include: "events" });
    assert.match(events.text, /export type MembershipActivatedV1Event = MiRotaractEventEnvelope<"membership\.activated\.v1"/);
    const py = await mcp.call("generate_types", { lang: "python" });
    assert.match(py.text, /class MemberView\(TypedDict/);
    assert.match(py.text, /MiRotaractEventType = Literal\[/);
    const ts = await mcp.call("generate_types", { lang: "ts", include: "api" });
    assert.match(ts.text, /export interface paths/);
  });

  test("production mode: sandbox tools refuse and make no request", async () => {
    const kernel = fakeKernel();
    const prod = await connect({ env: { MIROTARACT_BASE_URL: "https://api.rotaract4845.com/api/kernel/v1" }, fetch: kernel.fetch });
    const r = await prod.call("create_test_app", {});
    assert.equal(r.isError, true);
    assert.match(r.text, /no es un kernel local/);
    const t = await prod.call("issue_test_token", { clientId: "mra_x", clientSecret: "y" });
    assert.equal(t.isError, true);
    assert.equal(kernel.calls.length, 0);
    const none = await connect({ env: {}, fetch: kernel.fetch });
    assert.match((await none.call("create_test_app", {})).text, /No hay kernel configurado/);
    await prod.close();
    await none.close();
  });
});

describe("sandbox tools against a (fake) local kernel", () => {
  test("create_test_app + issue_test_token", async () => {
    const kernel = fakeKernel();
    const mcp = await connect({ env: { MIROTARACT_BASE_URL: "http://localhost:54321/api/kernel/v1" }, fetch: kernel.fetch });
    const created = JSON.parse((await mcp.call("create_test_app", { scopes: ["kernel.service.memberships.read"], organization: "SBX-NORTE" })).text);
    assert.equal(created.sandbox, true);
    assert.equal(created.organization.code, "SBX-NORTE");
    assert.deepEqual(created.app.grantTypes, ["client_credentials"]);
    assert.match(created.env, /MIROTARACT_CLIENT_SECRET=mrs_/);
    const post = kernel.calls.find((c) => c.path === "/developer/apps");
    assert.equal(post.body.organizationId, "org_n");
    const token = JSON.parse((await mcp.call("issue_test_token", {})).text);
    assert.equal(token.claims.token_use, "service");
    assert.equal(token.scope, "kernel.service.memberships.read");
    const bad = await mcp.call("issue_test_token", { scope: "kernel.service.persons.contact.read" });
    assert.equal(bad.isError, true);
    assert.match(bad.text, /invalid_scope/);
    await mcp.close();
  });

  test("refuses non-local redirect URIs and kernels with non-synthetic data", async () => {
    const kernel = fakeKernel();
    const mcp = await connect({ env: { MIROTARACT_BASE_URL: "http://127.0.0.1:54321/api/kernel/v1" }, fetch: kernel.fetch });
    const r = await mcp.call("create_test_app", { redirectUris: ["https://evil.example.com/cb"] });
    assert.match(r.text, /no local/);
    await mcp.close();

    const real = fakeKernel({ orgs: [{ id: "x", code: "D4845", name: "Distrito 4845", type: "DISTRICT" }] });
    const mcp2 = await connect({ env: { MIROTARACT_BASE_URL: "http://localhost:54321/api/kernel/v1" }, fetch: real.fetch });
    const refused = await mcp2.call("create_test_app", {});
    assert.equal(refused.isError, true);
    assert.match(refused.text, /no son del distrito sintético/);
    assert.ok(!real.calls.some((c) => c.path === "/developer/apps"));
    await mcp2.close();

    const noAdmin = fakeKernel({ adminOk: false });
    const mcp3 = await connect({ env: { MIROTARACT_BASE_URL: "http://localhost:54321/api/kernel/v1" }, fetch: noAdmin.fetch });
    assert.match((await mcp3.call("create_test_app", {})).text, /no parece un kernel de `mirotaract dev`/);
    await mcp3.close();
  });
});

describe("helpers", () => {
  test("isLocalKernel", () => {
    for (const ok of ["http://localhost:54321/api/kernel/v1", "http://127.0.0.1:1", "http://[::1]:54321/x", "https://localhost"]) assert.equal(isLocalKernel(ok), true, ok);
    for (const no of ["https://api.rotaract4845.com/api/kernel/v1", "http://localhost.evil.com", "http://10.0.0.1", "http://user:pw@localhost", "file:///etc", "nope", "http://0.0.0.0:54321"]) assert.equal(isLocalKernel(no), false, no);
  });

  test("resolveConfig", () => {
    assert.equal(resolveConfig({}).mode, "production");
    assert.equal(resolveConfig({ MIROTARACT_BASE_URL: "http://localhost:54321/api/kernel/v1/" }).baseUrl, "http://localhost:54321/api/kernel/v1");
    assert.equal(resolveConfig({ MIROTARACT_ISSUER: "http://localhost:54321/api/kernel/v1" }).mode, "sandbox");
  });

  test("local manifest validator edge cases", async () => {
    assert.equal(validateManifestLocal(null).ok, false);
    const r = validateManifestLocal({ ...GOOD_MANIFEST, id: "kernel", ui: { entryUrl: "http://example.org", navLabel: "" }, oauth: { scopes: ["profile", "kernel.service.persons.contact.read"] }, configurationSchema: { type: "object", properties: { apiToken: { type: "string" } } } });
    const paths = r.errors.map((e) => e.path);
    for (const p of ["/id", "/ui/entryUrl", "/ui/navLabel", "/oauth/scopes"]) assert.ok(paths.includes(p), p);
    assert.ok(r.warnings.some((w) => w.path === "/configurationSchema/properties/apiToken"));
    assert.ok(r.warnings.some((w) => /contact\.read/.test(w.message)));
    const viaAdapter = await validateModuleManifest(GOOD_MANIFEST, { useExternal: false });
    assert.equal(viaAdapter.ok, true);
  });
});
