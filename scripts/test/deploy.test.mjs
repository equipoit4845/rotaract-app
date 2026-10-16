// scripts/deploy.sh build + migrate steps with a fake docker
// (docs/19-operations-e12.md). Run with `node --test scripts/test/*.test.mjs`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "../deploy.sh");
const fakeBin = join(here, "fixtures/deploy-bin");
chmodSync(join(fakeBin, "docker"), 0o755);
const root = mkdtempSync(join(tmpdir(), "deploy-test-"));
after(() => rmSync(root, { recursive: true, force: true }));

const TREE = ["20261001000000_init", "20261016100000_application_notifications"];

function setup(name, applied) {
  const dir = join(root, name);
  const migrations = join(dir, "migrations");
  for (const m of TREE) {
    mkdirSync(join(migrations, m), { recursive: true });
    writeFileSync(join(migrations, m, "migration.sql"), "-- fake\n");
  }
  writeFileSync(join(migrations, "migration_lock.toml"), 'provider = "postgresql"\n');
  writeFileSync(join(dir, "applied"), applied.map((m) => `${m}\n`).join(""));
  return {
    dir,
    log: join(dir, "calls.log"),
    env: {
      PATH: `${fakeBin}:${process.env.PATH}`,
      DEPLOY_STATE_DIR: join(dir, "state"),
      DEPLOY_MIGRATIONS_DIR: migrations,
      FAKE_APPLIED: join(dir, "applied"),
      FAKE_LOG: join(dir, "calls.log"),
    },
  };
}

const run = (ctx, args, extra = {}) =>
  spawnSync("bash", [script, "--skip-backup", ...args], {
    env: { ...ctx.env, ...extra },
    encoding: "utf8",
  });
const calls = (ctx) =>
  existsSync(ctx.log) ? readFileSync(ctx.log, "utf8").trim().split("\n") : [];
const built = (ctx) =>
  calls(ctx)
    .map((c) => c.match(/ build (\S+)$/)?.[1])
    .filter(Boolean);
const recreated = (ctx) => calls(ctx).some((c) => c.includes(" up -d "));

test("api/worker deploys rebuild the migrate image and check every migration", () => {
  const ctx = setup("ok", TREE);
  const r = run(ctx, ["worker"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(built(ctx), ["worker", "migrate"]);
  assert.ok(calls(ctx).some((c) => c.includes("run --rm --no-deps migrate")));
  assert.match(r.stdout, /migrations: all 2 .* are applied/);
  assert.ok(recreated(ctx));
});

test("a migration missing from _prisma_migrations stops the deploy before any switch", () => {
  const ctx = setup("missing", TREE.slice(0, 1));
  const r = run(ctx, ["worker"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not applied: 20261016100000_application_notifications/);
  assert.match(r.stderr, /1 of 2 migrations .* are not applied/);
  assert.ok(!recreated(ctx), "nothing may be started after a failed check");
});

test("an unreadable _prisma_migrations stops the deploy", () => {
  const ctx = setup("db-down", TREE);
  const r = run(ctx, ["worker"], { FAKE_DB_DOWN: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not read _prisma_migrations/);
  assert.ok(!recreated(ctx));
});

test("--skip-build still checks the migrations (a stale image is caught)", () => {
  const ctx = setup("skip-build", TREE.slice(0, 1));
  const r = run(ctx, ["--skip-build", "worker"]);
  assert.equal(r.status, 1);
  assert.deepEqual(built(ctx), []);
  assert.match(r.stderr, /not applied/);
});

test("--skip-migrate neither builds, runs nor checks migrate", () => {
  const ctx = setup("skip-migrate", []);
  const r = run(ctx, ["--skip-migrate", "worker"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(built(ctx), ["worker"]);
  assert.ok(!calls(ctx).some((c) => / migrate$| exec /.test(c)));
});

test("services without a database do not touch migrate", () => {
  const ctx = setup("portal", []);
  const r = run(ctx, ["developers-portal"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(built(ctx), ["developers-portal"]);
  assert.ok(!calls(ctx).some((c) => / migrate$| exec /.test(c)));
});
