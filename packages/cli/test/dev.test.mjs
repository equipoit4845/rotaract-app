import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { run } from "../src/cli.js";
import {
  composeArgs,
  composeEnv,
  formatStatus,
  parsePublishedPorts,
  parseSandboxOutput,
  planDevUp,
  PROJECT_NAME,
  projectEnvValues,
  writeProjectEnv,
} from "../src/commands/dev.js";
import {
  formatValue,
  isGitIgnored,
  mergeEnvFile,
  parseEnv,
} from "../src/lib/env-file.js";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

const SANDBOX = {
  district: {
    id: "dist_1",
    code: "SBX-D9999",
    name: "Distrito 9999 (sandbox)",
  },
  clubs: [
    { id: "club_1", code: "SBX-C01", name: "Rotaract Club Sandbox Norte" },
  ],
  password: "sandbox-9999",
  users: [
    {
      role: "DISTRICT_RDR",
      label: "RDR",
      email: "rdr@example.org",
      name: "X",
      personId: "p",
      club: "c",
    },
  ],
  app: {
    id: "app_1",
    clientId: "mra_1",
    clientSecret: "mrs_secret",
    redirectUris: ["http://localhost:3000/auth/callback"],
  },
  publicApp: { id: "app_2", clientId: "mra_2" },
};

describe("dotenv files", () => {
  test("parse: quotes, export, comments", () => {
    assert.deepEqual(
      parseEnv(
        "# c\nexport A=1\nB=\"x y\"\nC='z' \nD=plain # comment\nE=a#b\nnot a line\n",
      ),
      { A: "1", B: "x y", C: "z", D: "plain", E: "a#b" },
    );
  });

  test("formatValue quotes only when needed", () => {
    assert.equal(formatValue("mrs_abc-DEF_123"), "mrs_abc-DEF_123");
    assert.equal(
      formatValue("http://localhost:3000/a"),
      "http://localhost:3000/a",
    );
    assert.equal(
      formatValue('con "comillas" y espacio'),
      '"con \\"comillas\\" y espacio"',
    );
  });

  test("merge keeps unrelated lines, replaces in place, appends with header, mode 0600", () => {
    const dir = mkdtempSync(join(tmpdir(), "mr-env-"));
    const path = join(dir, ".env.local");
    writeFileSync(
      path,
      "# mío\nMY_FLAG=1\nMIROTARACT_CLIENT_ID=old\nSESSION_SECRET=keep-me\n",
    );
    const changed = mergeEnvFile(
      path,
      {
        MIROTARACT_CLIENT_ID: "mra_new",
        MIROTARACT_CLIENT_SECRET: "mrs_x",
        SESSION_SECRET: "other",
        SKIP: undefined,
      },
      { header: "Escrito por la CLI", keepExisting: ["SESSION_SECRET"] },
    );
    const text = readFileSync(path, "utf8");
    assert.deepEqual(changed.sort(), [
      "MIROTARACT_CLIENT_ID",
      "MIROTARACT_CLIENT_SECRET",
    ]);
    assert.match(
      text,
      /^# mío\nMY_FLAG=1\nMIROTARACT_CLIENT_ID=mra_new\nSESSION_SECRET=keep-me\n\n# Escrito por la CLI\nMIROTARACT_CLIENT_SECRET=mrs_x\n$/,
    );
    assert.equal(statSync(path).mode & 0o777, 0o600);
    // Idempotent: same values, nothing changes.
    assert.deepEqual(
      mergeEnvFile(path, { MIROTARACT_CLIENT_ID: "mra_new" }),
      [],
    );
  });

  test("gitignore detection", () => {
    assert.equal(
      isGitIgnored("node_modules\n.env.local\n", ".env.local"),
      true,
    );
    assert.equal(isGitIgnored(".env*\n", ".env.local"), true);
    assert.equal(isGitIgnored("/.env.local\n", ".env.local"), true);
    assert.equal(isGitIgnored("# .env.local\n.env\n", ".env.local"), false);
  });
});

describe("dev up plan", () => {
  const cwd = mkdtempSync(join(tmpdir(), "mr-plan-"));

  test("defaults: 54321 / 54322, app on :3000", () => {
    const plan = planDevUp({ "no-build": true }, { cwd, env: {}, state: null });
    assert.equal(plan.apiPort, 54321);
    assert.equal(plan.webPort, 54322);
    assert.equal(plan.apiUrl, "http://localhost:54321/api/kernel/v1");
    assert.deepEqual(plan.redirectUris, [
      "http://localhost:3000/auth/callback",
    ]);
    assert.equal(plan.envFile, join(cwd, ".env.local"));
    assert.equal(plan.build, false);
  });

  test("app url and extra redirects; APP_URL from .env.local", () => {
    const dir = mkdtempSync(join(tmpdir(), "mr-plan-"));
    writeFileSync(join(dir, ".env.local"), "APP_URL=http://localhost:8000\n");
    const plan = planDevUp(
      { "no-build": true, "redirect-uri": ["http://127.0.0.1:9999/cb"] },
      { cwd: dir, env: {}, state: null },
    );
    assert.deepEqual(plan.redirectUris, [
      "http://localhost:8000/auth/callback",
      "http://127.0.0.1:9999/cb",
    ]);
    assert.deepEqual(plan.origins, [
      "http://localhost:8000",
      "http://127.0.0.1:9999",
    ]);
  });

  test("refuses production ports, equal ports and non-local redirects", () => {
    for (const port of ["3000", "3001", "5432", "6379"])
      assert.throws(
        () =>
          planDevUp(
            { "no-build": true, "api-port": port },
            { cwd, env: {}, state: null },
          ),
        /reservado/,
      );
    assert.throws(
      () =>
        planDevUp(
          { "no-build": true, "api-port": "60000", "web-port": "60000" },
          { cwd, env: {}, state: null },
        ),
      /no pueden ser iguales/,
    );
    assert.throws(
      () =>
        planDevUp(
          { "no-build": true, "redirect-uri": ["https://example.org/cb"] },
          { cwd, env: {}, state: null },
        ),
      /no es local/,
    );
  });

  test("kernel repo is validated", () => {
    assert.throws(
      () => planDevUp({ "kernel-repo": cwd }, { cwd, env: {}, state: null }),
      /no parece el repositorio del kernel/,
    );
    const repo = mkdtempSync(join(tmpdir(), "mr-repo-"));
    for (const f of ["infra/docker/api.Dockerfile", "prisma/schema.prisma"]) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), "");
    }
    assert.throws(
      () =>
        planDevUp(
          {},
          { cwd, env: { MIROTARACT_KERNEL_REPO: repo }, state: null },
        ),
      /seed-synthetic/,
    );
    writeFileSync(join(repo, "prisma/seed-synthetic.ts"), "");
    assert.equal(
      planDevUp({}, { cwd, env: { MIROTARACT_KERNEL_REPO: repo }, state: null })
        .kernelRepo,
      repo,
    );
  });

  test("compose: fixed project name, build overlay only when building", () => {
    const args = composeArgs({ build: false, envFilePath: "/x/dev.env" });
    assert.deepEqual(args.slice(0, 3), ["compose", "-p", PROJECT_NAME]);
    assert.equal(PROJECT_NAME, "mirotaract-dev");
    assert.ok(!args.some((a) => a.endsWith("docker-compose.build.yml")));
    assert.ok(
      composeArgs({ build: true, envFilePath: "/x" }).some((a) =>
        a.endsWith("docker-compose.build.yml"),
      ),
    );
    const plan = planDevUp({ "no-build": true }, { cwd, env: {}, state: null });
    const env = composeEnv(
      plan,
      { dbPassword: "a", jwtSecret: "b", signingKeySecret: "c" },
      { MIROTARACT_API_IMAGE: "ghcr.io/x/api:1" },
    );
    assert.equal(env.MIROTARACT_DEV_API_PORT, "54321");
    assert.equal(env.MIROTARACT_API_IMAGE, "ghcr.io/x/api:1");
    assert.equal(
      env.MIROTARACT_DEV_REDIRECT_URIS,
      "http://localhost:3000/auth/callback",
    );
  });

  test("the compose template wires the stream flags and never uses prod ports", () => {
    const compose = readFileSync(
      new URL("../compose/docker-compose.yml", import.meta.url),
      "utf8",
    );
    assert.match(compose, /KERNEL_WEBHOOK_STREAM_ENABLED: "true"/);
    assert.match(compose, /KERNEL_WEBHOOKS_ALLOW_INSECURE: "true"/);
    assert.match(compose, /^name: mirotaract-dev$/m);
    assert.doesNotMatch(compose, /["\s]:?(3000|3001|5432|6379):\d/);
  });

  test("docker ps port ranges", () => {
    assert.deepEqual(
      [
        ...parsePublishedPorts(
          "3001/tcp, 127.0.0.1:54321-54322->54321-54322/tcp\n127.0.0.1:8080->80/tcp",
        ),
      ],
      [54321, 54322, 8080],
    );
  });
});

describe("sandbox output and .env.local", () => {
  test("parses the seed's marker line among other output", () => {
    const stdout = `Prisma says hi\nMIROTARACT_SANDBOX_JSON=${JSON.stringify(SANDBOX)}\n`;
    assert.equal(parseSandboxOutput(stdout).app.clientId, "mra_1");
    assert.equal(parseSandboxOutput("nothing"), null);
    assert.equal(parseSandboxOutput("MIROTARACT_SANDBOX_JSON={broken"), null);
  });

  test("writes credentials and URLs, keeps the developer's SESSION_SECRET, warns if not ignored", () => {
    const dir = mkdtempSync(join(tmpdir(), "mr-envlocal-"));
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    writeFileSync(
      join(dir, ".env.local"),
      "SESSION_SECRET=mine-mine-mine-mine-mine-mine-mine\nOTHER=1\n",
    );
    const plan = planDevUp(
      { "no-build": true },
      { cwd: dir, env: {}, state: null },
    );
    const { warnings } = writeProjectEnv(plan, SANDBOX);
    const env = parseEnv(readFileSync(join(dir, ".env.local"), "utf8"));
    assert.equal(env.MIROTARACT_ISSUER, "http://localhost:54321/api/kernel/v1");
    assert.equal(env.MIROTARACT_BASE_URL, env.MIROTARACT_ISSUER);
    assert.equal(env.MIROTARACT_CLIENT_ID, "mra_1");
    assert.equal(env.MIROTARACT_CLIENT_SECRET, "mrs_secret");
    assert.equal(env.MIROTARACT_APP_ID, "app_1");
    assert.equal(env.MIROTARACT_PUBLIC_CLIENT_ID, "mra_2");
    assert.equal(env.MIROTARACT_WEB_URL, "http://localhost:54322");
    assert.equal(env.APP_URL, "http://localhost:3000");
    assert.equal(env.SESSION_SECRET, "mine-mine-mine-mine-mine-mine-mine");
    assert.equal(env.OTHER, "1");
    assert.match(warnings[0], /no está en \.gitignore/);
    // A fresh project gets a random SESSION_SECRET of 32+ chars.
    assert.ok(projectEnvValues(plan, SANDBOX).SESSION_SECRET.length >= 32);
  });

  test("status lists URLs, accounts and the password (never secrets)", () => {
    const text = formatStatus(
      {
        apiUrl: "http://localhost:54321/api/kernel/v1",
        webUrl: "http://localhost:54322",
        district: SANDBOX.district,
        app: { id: "app_1", clientId: "mra_1" },
        publicApp: { clientId: "mra_2" },
        redirectUris: ["http://localhost:3000/auth/callback"],
        password: "sandbox-9999",
        users: SANDBOX.users,
        secrets: { dbPassword: "NOPE" },
      },
      {
        running: true,
        services: [{ name: "api", state: "Up 2 minutes (healthy)" }],
      },
    );
    assert.match(text, /corriendo/);
    assert.match(text, /http:\/\/localhost:54321\/api\/kernel\/v1/);
    assert.match(text, /rdr@example\.org/);
    assert.match(text, /contraseña para todas: sandbox-9999/);
    assert.doesNotMatch(text, /NOPE|mrs_/);
    assert.match(formatStatus(null, { running: false }), /mirotaract dev up/);
  });
});

describe("dev commands with a fake docker", () => {
  function fakeDocker({ psJson = "", composeCode = 0 } = {}) {
    const calls = [];
    const runner = async (command, args) => {
      calls.push([command, ...args].join(" "));
      if (args[0] === "compose" && args[1] === "version")
        return { code: 0, stdout: "v2", stderr: "" };
      if (args.includes("ps")) return { code: 0, stdout: psJson, stderr: "" };
      return { code: composeCode, stdout: "", stderr: "" };
    };
    return { calls, runner };
  }

  test("dev down uses the mirotaract-dev project and keeps volumes; reset would drop them", async () => {
    const home = mkdtempSync(join(tmpdir(), "mr-home-"));
    const { calls, runner } = fakeDocker();
    const err = sink();
    const code = await run(["dev", "down"], {
      cwd: home,
      env: { MIROTARACT_HOME: home },
      out: sink(),
      err,
      run: runner,
    });
    assert.equal(code, 0);
    const down = calls.find((c) => c.includes(" down"));
    assert.match(
      down,
      /-p mirotaract-dev .*--profile setup down --remove-orphans$/,
    );
    assert.match(err.text, /los datos se conservan/);
    assert.equal(statSync(join(home, "dev", "dev.env")).mode & 0o777, 0o600);
    const wipe = fakeDocker();
    await run(["dev", "down", "--volumes"], {
      cwd: home,
      env: { MIROTARACT_HOME: home },
      out: sink(),
      err: sink(),
      run: wipe.runner,
    });
    assert.match(
      wipe.calls.find((c) => c.includes(" down")),
      /down --remove-orphans -v$/,
    );
  });

  test("dev status reads compose ps (NDJSON) and the saved state", async () => {
    const home = mkdtempSync(join(tmpdir(), "mr-home-"));
    mkdirSync(join(home, "dev"), { recursive: true });
    writeFileSync(
      join(home, "dev", "state.json"),
      JSON.stringify({
        apiUrl: "http://localhost:54321/api/kernel/v1",
        webUrl: "http://localhost:54322",
        password: "sandbox-9999",
        users: SANDBOX.users,
        app: { clientId: "mra_1" },
        district: SANDBOX.district,
        secrets: { dbPassword: "x" },
      }),
    );
    const psJson = `${JSON.stringify({ Service: "api", State: "running", Status: "Up (healthy)" })}\n${JSON.stringify({ Service: "postgres", State: "running", Status: "Up" })}\n`;
    const { runner } = fakeDocker({ psJson });
    const out = sink();
    assert.equal(
      await run(["dev", "status"], {
        cwd: home,
        env: { MIROTARACT_HOME: home },
        out,
        err: sink(),
        run: runner,
      }),
      0,
    );
    assert.match(out.text, /corriendo/);
    assert.match(out.text, /api +Up \(healthy\)/);
    const json = sink();
    await run(["dev", "status", "--json"], {
      cwd: home,
      env: { MIROTARACT_HOME: home },
      out: json,
      err: sink(),
      run: runner,
    });
    const parsed = JSON.parse(json.text);
    assert.equal(parsed.running, true);
    assert.equal(parsed.secrets, undefined);
  });

  test("dev up without a kernel repo or images explains what to do", async () => {
    const home = mkdtempSync(join(tmpdir(), "mr-home-"));
    const runner = async (command, args) => {
      if (args[0] === "compose") return { code: 0, stdout: "", stderr: "" };
      if (args[0] === "image") return { code: 1, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    const err = sink();
    assert.equal(
      await run(["dev", "up", "--no-build"], {
        cwd: home,
        env: { MIROTARACT_HOME: home },
        out: sink(),
        err,
        run: runner,
      }),
      1,
    );
    assert.match(err.text, /Falta el repositorio del kernel/);
    assert.match(err.text, /--kernel-repo/);
  });

  test("docker missing is a clear error", async () => {
    const runner = async () => ({ code: 127, stdout: "", stderr: "" });
    const err = sink();
    assert.equal(
      await run(["dev", "status"], {
        cwd: "/",
        env: { MIROTARACT_HOME: mkdtempSync(join(tmpdir(), "mr-")) },
        out: sink(),
        err,
        run: runner,
      }),
      1,
    );
    assert.match(err.text, /Docker no está disponible/);
  });
});
