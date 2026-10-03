// Unit tests of the portal's build-time content and pure client logic.
// Run with `node --test` (Node 22.6+/24 strips the TypeScript types).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), "portal-test-"));
process.env.PORTAL_PUBLIC_DIR = join(out, "public");
process.env.PORTAL_GENERATED_DIR = join(out, "generated");
after(() => rmSync(out, { recursive: true, force: true }));

const content = await import("../scripts/prepare-content.mjs");
const tryRequest = await import("../src/lib/try-request.ts");
const markdown = await import("../src/lib/markdown.ts");
const search = await import("../src/lib/search.ts");

test("docs: every docs/developers page, README as introducción, grouped and outlined", () => {
  const docs = content.loadDocs();
  const slugs = docs.map((doc) => doc.slug);
  assert.ok(slugs.includes("introduccion"));
  assert.ok(!slugs.includes("readme"));
  for (const slug of [
    "quickstart-nextjs",
    "quickstart-express",
    "quickstart-fastapi",
    "quickstart-flutter",
    "changelog",
    "deprecaciones",
    "catalogo-de-eventos",
  ])
    assert.ok(slugs.includes(slug), `missing ${slug}`);
  assert.equal(docs[0].slug, "introduccion");
  const webhooks = docs.find((doc) => doc.slug === "webhooks");
  assert.equal(webhooks.group, "API y eventos");
  assert.ok(webhooks.outline.length > 2);
  assert.match(webhooks.title, /Webhooks/i);
});

test("registry (E8): copied to /r with an index when present", () => {
  process.env.PORTAL_REGISTRY_DIR = join(here, "fixtures/registry");
  try {
    assert.equal(content.prepareRegistry(), 2);
    assert.ok(existsSync(join(out, "public/r/status-badge.json")));
    assert.ok(existsSync(join(out, "public/r/registry.json")));
    const index = JSON.parse(
      readFileSync(join(out, "generated/registry.json"), "utf8"),
    );
    assert.deepEqual(
      index.items.map((item) => [item.name, item.available]),
      [
        ["status-badge", true],
        ["mirotaract-theme", false],
      ],
    );
  } finally {
    delete process.env.PORTAL_REGISTRY_DIR;
  }
});

test("registry (E8): absent → empty /r and a null index, never a failure", () => {
  process.env.PORTAL_REGISTRY_DIR = join(out, "does-not-exist");
  try {
    assert.equal(content.prepareRegistry(), 0);
    assert.equal(
      readFileSync(join(out, "generated/registry.json"), "utf8"),
      "null",
    );
    assert.ok(!existsSync(join(out, "public/r/status-badge.json")));
  } finally {
    delete process.env.PORTAL_REGISTRY_DIR;
  }
});

test("llms.txt (E10): published from the script's output", () => {
  process.env.PORTAL_LLMS_DIR = join(here, "fixtures/llms");
  try {
    assert.equal(content.prepareLlms(), true);
    assert.match(
      readFileSync(join(out, "public/llms.txt"), "utf8"),
      /fixture/i,
    );
    assert.ok(existsSync(join(out, "public/llms-full.txt")));
  } finally {
    delete process.env.PORTAL_LLMS_DIR;
  }
});

test("Probar: only localhost is local; everything else needs confirmation", () => {
  for (const url of [
    "http://localhost:54321/api/kernel/v1",
    "http://127.0.0.1:3001/api/kernel/v1",
    "http://[::1]:54321/api/kernel/v1",
    "http://kernel.localhost/api/kernel/v1",
  ])
    assert.equal(tryRequest.needsConfirmation(url), false, url);
  for (const url of [
    "https://api.rotaract4845.com/api/kernel/v1",
    "https://staging-api.rotaract4845.com/api/kernel/v1",
    "https://localhost.evil.example/api",
    "not a url",
  ])
    assert.equal(tryRequest.needsConfirmation(url), true, url);
  assert.equal(
    tryRequest.isProductionBaseUrl("https://api.rotaract4845.com/x"),
    true,
  );
  assert.equal(
    tryRequest.validateBaseUrl("http://api.example.org"),
    "Fuera de localhost, usá https://",
  );
  assert.equal(
    tryRequest.validateBaseUrl("ftp://x"),
    "La URL tiene que empezar con http:// o https://",
  );
  assert.equal(
    tryRequest.validateBaseUrl("http://localhost:54321/api/kernel/v1"),
    null,
  );
});

test("Probar: builds the request with path, query, bearer and Idempotency-Key", () => {
  const built = tryRequest.buildRequest(
    {
      method: "POST",
      path: "/developer/apps/{appId}/webhooks",
      auth: ["user"],
      parameters: [
        { name: "appId", in: "path", required: true },
        { name: "status", in: "query", required: false },
        { name: "Idempotency-Key", in: "header", required: true },
      ],
      bodyContentType: "application/json",
    },
    {
      baseUrl: "http://localhost:54321/api/kernel/v1/",
      token: " tok ",
      pathValues: { appId: "app 1" },
      queryValues: { status: "4xx" },
      body: '{"url":"https://x"}',
      idempotencyKey: "key-1",
      correlationId: "c-1",
    },
  );
  assert.equal(
    built.url,
    "http://localhost:54321/api/kernel/v1/developer/apps/app%201/webhooks?status=4xx",
  );
  assert.equal(built.headers.Authorization, "Bearer tok");
  assert.equal(built.headers["Idempotency-Key"], "key-1");
  assert.equal(built.headers["X-Correlation-Id"], "c-1");
  assert.equal(built.headers["Content-Type"], "application/json");
  assert.deepEqual(built.missing, []);
});

test("Probar: reports what is missing; client auth uses Basic", () => {
  const missing = tryRequest.buildRequest(
    {
      method: "GET",
      path: "/service/organizations/{organizationId}",
      auth: ["service"],
      parameters: [{ name: "organizationId", in: "path", required: true }],
    },
    { baseUrl: "http://localhost:54321", pathValues: {}, queryValues: {} },
  );
  assert.deepEqual(missing.missing, ["organizationId", "token"]);
  const basic = tryRequest.buildRequest(
    {
      method: "POST",
      path: "/oauth/token",
      auth: ["client"],
      parameters: [],
      bodyContentType: "application/x-www-form-urlencoded",
    },
    {
      baseUrl: "http://localhost:54321",
      clientId: "mra_1",
      clientSecret: "s3cr:et",
      pathValues: {},
      queryValues: {},
      body: "grant_type=client_credentials",
    },
  );
  assert.equal(basic.headers.Authorization, `Basic ${btoa("mra_1:s3cr%3Aet")}`);
  assert.equal(
    basic.headers["Content-Type"],
    "application/x-www-form-urlencoded",
  );
  const open = tryRequest.buildRequest(
    { method: "GET", path: "/events/catalog", auth: ["none"], parameters: [] },
    {
      baseUrl: "http://localhost:54321",
      token: "ignored",
      pathValues: {},
      queryValues: {},
    },
  );
  assert.equal(open.headers.Authorization, undefined);
});

test("Markdown: doc links become portal routes, repo paths become text", () => {
  assert.equal(
    markdown.rewriteHref("webhooks.md#firma"),
    "/docs/webhooks#firma",
  );
  assert.equal(markdown.rewriteHref("README.md"), "/docs/introduccion");
  assert.equal(markdown.rewriteHref("../../packages/sdk-js/README.md"), null);
  assert.equal(
    markdown.rewriteHref("https://example.org"),
    "https://example.org",
  );
  const html = markdown.renderMarkdown(
    "# T\n\n<!-- entry: e9-portal -->\n## Señales `traceId`\n\nVer [errores](errores.md).\n\n```ts runnable file=src/a.ts\nconst a = 1 < 2;\n```\n",
  );
  assert.match(html, /<span id="e9-portal"/);
  assert.match(html, /<h2 id="senales-traceid">/);
  assert.match(html, /href="\/docs\/errores"/);
  assert.match(html, /src\/a\.ts/);
  assert.match(html, /probado en CI/);
  assert.match(html, /const a = 1 &lt; 2;/);
  assert.match(html, /data-copy-code/);
});

test("Search: all terms, accent-insensitive, title first", () => {
  const entries = [
    {
      kind: "doc",
      title: "Webhooks · Firma",
      url: "/a",
      text: "verificá la firma",
    },
    {
      kind: "api",
      title: "GET /service/organizations",
      url: "/b",
      text: "Listar clubes y webhooks",
    },
    { kind: "doc", title: "Errores", url: "/c", text: "códigos" },
  ];
  assert.deepEqual(
    search.searchEntries(entries, "webhooks").map((entry) => entry.url),
    ["/a", "/b"],
  );
  assert.deepEqual(
    search.searchEntries(entries, "codigos").map((entry) => entry.url),
    ["/c"],
  );
  assert.deepEqual(search.searchEntries(entries, "webhooks zzz"), []);
});
