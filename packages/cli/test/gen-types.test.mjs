import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { run } from "../src/cli.js";
import {
  eventsToTs,
  normalizeCatalog,
  pascalCase,
  schemaFromExample,
  schemaToTs,
} from "../src/lib/codegen.js";
import {
  CATALOG,
  OPENAPI_YAML,
  startMockKernel,
} from "./support/mock-kernel.mjs";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

const python =
  spawnSync("python3", ["--version"]).status === 0 ? "python3" : null;

describe("codegen helpers", () => {
  test("pascalCase of event types", () => {
    assert.equal(
      pascalCase("membership.activated.v1"),
      "MembershipActivatedV1",
    );
    assert.equal(pascalCase("9-lives"), "T9Lives");
  });

  test("normalizeCatalog accepts the plausible shapes and envelopes", () => {
    const fromItems = normalizeCatalog(CATALOG);
    assert.deepEqual(
      fromItems.map((e) => e.type),
      ["appointment.activated.v1", "membership.activated.v1", "ping.v1"],
    );
    // Envelope example → its `data` is the example.
    assert.deepEqual(fromItems[1].example, {
      membershipId: "mem_1",
      personId: "per_1",
      status: "ACTIVE",
      joinedAt: null,
    });
    assert.equal(
      normalizeCatalog({ events: [{ name: "a.v1" }] })[0].type,
      "a.v1",
    );
    assert.equal(
      normalizeCatalog([{ eventType: "b.v1", schema: { type: "object" } }])[0]
        .schema.type,
      "object",
    );
    assert.deepEqual(normalizeCatalog({ nope: 1 }), []);
  });

  test("schema inference and TS rendering", () => {
    const schema = schemaFromExample({
      a: "x",
      n: 1,
      f: 1.5,
      ok: true,
      z: null,
      list: [{ b: "y" }],
    });
    assert.equal(
      schemaToTs(schema),
      "{\n  a: string;\n  n: number;\n  f: number;\n  ok: boolean;\n  z: null;\n  list: Array<{\n    b: string;\n  }>;\n}",
    );
    assert.equal(schemaToTs({ type: ["string", "null"] }), "string | null");
    assert.equal(schemaToTs({ enum: ["A", "B"] }), '"A" | "B"');
    assert.equal(
      schemaToTs({ type: "object", properties: { "a-b": { type: "string" } } }),
      '{\n  "a-b"?: string;\n}',
    );
  });

  test("event union, map and envelope", () => {
    const ts = eventsToTs(normalizeCatalog(CATALOG));
    assert.match(
      ts,
      /export type MembershipActivatedV1Event = MiRotaractEventEnvelope<"membership\.activated\.v1", \{/,
    );
    assert.match(
      ts,
      /export type MiRotaractEvent = AppointmentActivatedV1Event \| MembershipActivatedV1Event \| PingV1Event;/,
    );
    assert.match(ts, /"ping\.v1": PingV1Event;/);
  });
});

describe("mirotaract gen types (mock kernel)", () => {
  let mock;
  before(async () => {
    mock = await startMockKernel();
  });
  after(() => mock.close());

  test("TypeScript: served /openapi.yaml + /events/catalog", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-gen-"));
    mkdirSync(join(cwd, "src"));
    const out = sink();
    const err = sink();
    const code = await run(["gen", "types", "--base-url", mock.baseUrl], {
      cwd,
      env: {},
      out,
      err,
    });
    assert.equal(code, 0, err.text);
    const ts = readFileSync(join(cwd, "src/mirotaract-types.ts"), "utf8");
    assert.match(ts, /export interface paths/);
    assert.match(ts, /MemberViewPage/);
    assert.match(ts, /serviceListMembers/);
    assert.match(ts, /MembershipActivatedV1Event/);
    assert.match(ts, new RegExp(`API: ${mock.origin}/openapi.yaml`));
    assert.match(out.text, /3 eventos/);
    // It must compile.
    const tsc = spawnSync(
      process.execPath,
      [
        new URL("../../../node_modules/typescript/bin/tsc", import.meta.url)
          .pathname,
        "--noEmit",
        "--strict",
        "--target",
        "es2022",
        "--moduleResolution",
        "bundler",
        "--module",
        "esnext",
        join(cwd, "src/mirotaract-types.ts"),
      ],
      { encoding: "utf8" },
    );
    if (tsc.error?.code !== "ENOENT")
      assert.equal(tsc.status, 0, tsc.stdout + tsc.stderr);
  });

  test("Python TypedDicts, importable", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-gen-"));
    const out = sink();
    assert.equal(
      await run(
        [
          "gen",
          "types",
          "--lang",
          "python",
          "--base-url",
          mock.baseUrl,
          "-o",
          "tipos.py",
        ],
        { cwd, env: {}, out, err: sink() },
      ),
      0,
    );
    const py = readFileSync(join(cwd, "tipos.py"), "utf8");
    assert.match(
      py,
      /^MembershipStatus = Literal\["ACTIVE", "ON_LEAVE", "INACTIVE"\]$/m,
    );
    assert.match(py, /^class PersonView\(TypedDict\):$/m);
    assert.match(py, /^ {4}email: NotRequired\[Optional\[str\]\]$/m);
    // "from" is a Python keyword → functional TypedDict syntax.
    assert.match(py, /^MemberView = TypedDict\("MemberView", \{$/m);
    assert.match(py, /"memberNumber": NotRequired\[Optional\[str\]\],/);
    assert.match(py, /^class MembershipActivatedV1Event\(TypedDict\):$/m);
    assert.match(py, /type: Literal\["membership\.activated\.v1"\]/);
    assert.match(py, /^MiRotaractEvent = Union\[/m);
    if (python) {
      const check = spawnSync(
        python,
        [
          "-c",
          "import sys, importlib.util as u; s=u.spec_from_file_location('t', sys.argv[1]); m=u.module_from_spec(s); s.loader.exec_module(m); print(sorted(m.EVENT_TYPES))",
          join(cwd, "tipos.py"),
        ],
        { encoding: "utf8" },
      );
      if (!/No module named 'typing_extensions'/.test(check.stderr)) {
        assert.equal(check.status, 0, check.stderr);
        assert.match(check.stdout, /membership\.activated\.v1/);
      }
    }
  });

  test("falls back to the kernel repo's contract and survives a missing catalog", async () => {
    const offline = await startMockKernel({
      serveSpec: false,
      serveCatalog: false,
    });
    const repo = mkdtempSync(join(tmpdir(), "mr-repo-"));
    for (const f of [
      "infra/docker/api.Dockerfile",
      "prisma/schema.prisma",
      "prisma/seed-synthetic.ts",
    ]) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), "");
    }
    writeFileSync(join(repo, "kernel-openapi.yaml"), OPENAPI_YAML);
    const cwd = mkdtempSync(join(tmpdir(), "mr-gen-"));
    const err = sink();
    const out = sink();
    const code = await run(
      [
        "gen",
        "types",
        "--base-url",
        offline.baseUrl,
        "--kernel-repo",
        repo,
        "--out",
        "t.ts",
      ],
      { cwd, env: {}, out, err },
    );
    await offline.close();
    assert.equal(code, 0);
    assert.match(err.text, /pruebo con el repositorio del kernel/);
    assert.match(err.text, /catálogo de eventos/);
    assert.match(out.text, /0 eventos/);
    assert.match(
      readFileSync(join(cwd, "t.ts"), "utf8"),
      /export type MiRotaractEvent = MiRotaractEventEnvelope;/,
    );
  });

  test("--spec file and clear errors", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-gen-"));
    writeFileSync(join(cwd, "spec.yaml"), OPENAPI_YAML);
    assert.equal(
      await run(
        [
          "gen",
          "types",
          "--spec",
          "spec.yaml",
          "--base-url",
          mock.baseUrl,
          "-o",
          "a.ts",
        ],
        { cwd, env: {}, out: sink(), err: sink() },
      ),
      0,
    );
    const err = sink();
    assert.equal(
      await run(["gen", "types", "--lang", "rust"], {
        cwd,
        env: {},
        out: sink(),
        err,
      }),
      1,
    );
    assert.match(err.text, /Lenguaje no soportado: rust/);
    const err2 = sink();
    const offline = await startMockKernel({ serveSpec: false });
    assert.equal(
      await run(["gen", "types", "--base-url", offline.baseUrl], {
        cwd,
        env: {},
        out: sink(),
        err: err2,
      }),
      1,
    );
    await offline.close();
    assert.match(err2.text, /No encontré el contrato OpenAPI/);
  });
});
