import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import { buildLlms, stableJson } from "../build-llms-txt.mjs";
import {
  describeMarkdown,
  listOperations,
  loadDeveloperDocs,
  loadEventCatalog,
  loadOpenApi,
  loadPermissionCatalog,
  parseRolePermissions,
  parseScopeTable,
  plainText,
} from "../lib/developer-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DOC_FILES = readdirSync(join(ROOT, "docs/developers")).filter((f) => f.endsWith(".md"));

describe("build-llms-txt", () => {
  test("is deterministic", async () => {
    const a = await buildLlms();
    const b = await buildLlms();
    assert.equal(a.llms, b.llms);
    assert.equal(a.full, b.full);
    assert.doesNotMatch(a.llms + a.full, /generado el|generated at/i); // no build timestamps
  });

  test("llms.txt follows the llms.txt convention", async () => {
    const { llms } = await buildLlms();
    const lines = llms.split("\n");
    assert.match(lines[0], /^# \S/); // H1 title
    assert.match(lines[2], /^> /); // blockquote summary
    assert.ok(llms.includes("\n## Guías\n"));
    assert.ok(llms.includes("\n## Optional\n"));
    for (const line of lines.filter((l) => l.startsWith("- ")))
      assert.match(line, /^- \[[^\]]+\]\(https?:\/\/[^)]+\): \S/, line);
    for (const file of DOC_FILES) assert.ok(llms.includes(`/docs/${file})`), `${file} not linked`);
  });

  test("llms-full.txt has every guide, the event catalog and the API summary", async () => {
    const { full } = await buildLlms();
    for (const file of DOC_FILES) {
      assert.ok(full.includes(`<!-- source: docs/developers/${file} -->`), file);
      const body = readFileSync(join(ROOT, "docs/developers", file), "utf8").trim();
      assert.ok(full.includes(body), `${file} content missing`);
    }
    const catalog = await loadEventCatalog();
    for (const event of catalog.events) assert.ok(full.includes(`"type": "${event.type}"`), event.type);
    assert.match(full, /# Resumen de la API \(kernel-openapi\.yaml, versión /);
    assert.match(full, /\| `serviceListMembers` \| `GET \/service\/organizations\/\{organizationId\}\/members` \| .* \| scope `kernel\.service\.memberships\.read` \|/);
    // service ops without x-required-scope get it from the docs table
    assert.match(full, /\| `serviceGetPerson` \| .* \| scope `kernel\.service\.persons\.read` \|/);
  });

  test("--base-url changes the links", async () => {
    const { llms } = await buildLlms({ baseUrl: "http://localhost:3004/" });
    assert.ok(llms.includes("(http://localhost:3004/docs/README.md)"));
    assert.ok(!llms.includes("developers.rotaract4845.com/docs"));
  });

  test("CLI writes dist/llms files", () => {
    const out = mkdtempSync(join(tmpdir(), "llms-"));
    execFileSync(process.execPath, [join(ROOT, "scripts/build-llms-txt.mjs"), "--out", out]);
    assert.deepEqual(readdirSync(out).sort(), ["llms-full.txt", "llms.txt"]);
  });

  test("stableJson sorts keys", () => {
    assert.equal(stableJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } }, 0), '{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}');
  });
});

describe("developer sources", () => {
  test("docs: README first, guides in the README table order", () => {
    const docs = loadDeveloperDocs();
    assert.equal(docs[0].slug, "README");
    assert.equal(docs.length, DOC_FILES.length);
    for (const d of docs) {
      assert.ok(d.title, d.file);
      assert.ok(d.description, d.file);
    }
  });

  test("describeMarkdown and plainText", () => {
    assert.deepEqual(describeMarkdown("<!-- x -->\n# Título `x`\n\nPrimera **frase**. Segunda.\n"), {
      title: "Título x",
      description: "Primera frase.",
    });
    assert.equal(plainText("ver [esto](a.md) y `/service/*`"), "ver esto y /service/*");
  });

  test("permission catalog from the seed", async () => {
    const catalog = await loadPermissionCatalog();
    const read = catalog.kernelPermissions.find((p) => p.code === "kernel.membership.read");
    assert.equal(read.name, "Ver el padrón de socios");
    assert.ok(read.roles.includes("MEMBER") && read.roles.includes("DISTRICT_RDR"));
    const self = catalog.kernelPermissions.find((p) => p.code === "kernel.account.read.self");
    assert.ok(self.roles.includes("PLATFORM_USER")); // spread of selfServicePermissions resolved
    assert.ok(catalog.serviceScopes.find((s) => s.scope === "kernel.service.persons.contact.read"));
    assert.deepEqual(
      catalog.oidcScopes.map((s) => s.scope),
      ["openid", "profile", "email", "memberships", "positions"],
    );
  });

  test("parsers", () => {
    const roles = parseRolePermissions(`const selfServicePermissions = ["a.self"];\nconst rolePermissions: Record<string, string[]> = {\n  BASE: selfServicePermissions,\n  X: [\n    ...selfServicePermissions,\n    // comment\n    "x.read",\n  ],\n};`);
    assert.deepEqual(roles, { BASE: ["a.self"], X: ["a.self", "x.read"] });
    assert.deepEqual(parseScopeTable("## Resumen de scopes por endpoint\n\n| `GET /service/a` | `s.read` |\n"), { "GET /service/a": "s.read" });
    const ops = listOperations(loadOpenApi());
    assert.ok(ops.some((o) => o.operationId === "issueOAuthToken" && o.method === "POST"));
  });
});
