// E12.2 — scripts/backup-offsite.sh logic with fake docker/rclone
// (docs/19-operations-e12.md). Real gpg and tar: the encrypted file is
// decrypted and inspected. Run with `node --test scripts/test/*.test.mjs`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "../backup-offsite.sh");
const fakeBin = join(here, "fixtures/backup-bin");
for (const f of ["docker", "rclone"]) chmodSync(join(fakeBin, f), 0o755);
const root = mkdtempSync(join(tmpdir(), "backup-test-"));
after(() => rmSync(root, { recursive: true, force: true }));
const hasGpg = spawnSync("gpg", ["--version"]).status === 0;

function setup(name) {
  const dir = join(root, name);
  mkdirSync(join(dir, "uploads/2026"), { recursive: true });
  mkdirSync(join(dir, "gnupg"), { mode: 0o700 });
  writeFileSync(join(dir, "uploads/2026/acta.pdf"), "%PDF fake");
  writeFileSync(join(dir, "passphrase"), "correct horse battery staple\n", { mode: 0o600 });
  return {
    dir,
    backups: join(dir, "backups"),
    env: {
      PATH: `${fakeBin}:${process.env.PATH}`,
      HOME: dir,
      GNUPGHOME: join(dir, "gnupg"),
      BACKUP_CONFIG: join(dir, "no-config"),
      BACKUP_DIR: join(dir, "backups"),
      BACKUP_PASSPHRASE_FILE: join(dir, "passphrase"),
      FAKE_VOLUME_DIR: join(dir, "uploads"),
      FAKE_REMOTE_DIR: join(dir, "remote"),
      FAKE_LOG: join(dir, "calls.log"),
      RCLONE_BIN: join(fakeBin, "rclone"),
    },
  };
}

function run(ctx, extra = {}) {
  return spawnSync("bash", [script], {
    env: { ...ctx.env, ...extra },
    encoding: "utf8",
  });
}

const encrypted = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => /^rotaract-.*\.tar\.gpg$/.test(f)) : [];

function decrypt(ctx, file) {
  const out = join(ctx.dir, "restored");
  mkdirSync(out, { recursive: true });
  const r = spawnSync(
    "bash",
    [
      "-c",
      `gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$P" --decrypt "$F" | tar xf - -C "$O"`,
    ],
    { env: { ...ctx.env, P: ctx.env.BACKUP_PASSPHRASE_FILE, F: file, O: out }, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return out;
}

test("without a remote: encrypted local backup, upload skipped with a warning", { skip: !hasGpg }, () => {
  const ctx = setup("no-remote");
  const r = run(ctx);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /WARNING RCLONE_REMOTE is not set: upload skipped/);
  const files = encrypted(ctx.backups);
  assert.equal(files.length, 1);
  // Nothing in clear text is left behind.
  assert.deepEqual(
    readdirSync(ctx.backups).filter((f) => !f.endsWith(".tar.gpg")),
    [],
  );
  const raw = readFileSync(join(ctx.backups, files[0]));
  assert.ok(!raw.includes("PGDMP"), "the file must be encrypted");
  const out = decrypt(ctx, join(ctx.backups, files[0]));
  assert.deepEqual(readdirSync(out).sort(), [
    "MANIFEST",
    "institutional_kernel.dump",
    "meetings.dump",
    "volume-rotaract-app_meetings-uploads.tar.gz",
  ]);
  const manifest = readFileSync(join(out, "MANIFEST"), "utf8");
  assert.match(manifest, /databases institutional_kernel meetings/);
  assert.equal(manifest.match(/^[0-9a-f]{64} {2}/gm).length, 3);
  const check = spawnSync("bash", ["-c", "grep -E '^[0-9a-f]{64}  ' MANIFEST | sha256sum --check --quiet"], { cwd: out });
  assert.equal(check.status, 0);
  const tarList = spawnSync("tar", ["tzf", join(out, "volume-rotaract-app_meetings-uploads.tar.gz")], { encoding: "utf8" });
  assert.match(tarList.stdout, /acta\.pdf/);
});

test("refuses to run without a passphrase: never an unencrypted backup", () => {
  const ctx = setup("no-passphrase");
  const r = run(ctx, { BACKUP_PASSPHRASE_FILE: join(ctx.dir, "missing") });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /backups are always encrypted/);
  assert.equal(encrypted(ctx.backups).length, 0);
});

test("a failed dump aborts, leaves no partial file and keeps earlier backups", { skip: !hasGpg }, () => {
  const ctx = setup("failed-dump");
  mkdirSync(ctx.backups, { recursive: true });
  writeFileSync(join(ctx.backups, "rotaract-20261001T033000Z.tar.gpg"), "previous");
  const r = run(ctx, { FAKE_FAIL_DB: "meetings" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pg_dump of meetings failed/);
  assert.deepEqual(readdirSync(ctx.backups), ["rotaract-20261001T033000Z.tar.gpg"]);
});

test("an unreadable dump or a missing volume is a failure", { skip: !hasGpg }, () => {
  const bad = setup("bad-dump");
  assert.match(run(bad, { FAKE_BAD_DUMP: "1" }).stderr, /dump of institutional_kernel is unreadable/);
  const novol = setup("no-volume");
  const r = run(novol, { FAKE_NO_VOLUME: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /volume rotaract-app_meetings-uploads does not exist/);
});

test("with a remote: uploads, verifies the size and expires old remote copies", { skip: !hasGpg }, () => {
  const ctx = setup("remote");
  const r = run(ctx, { RCLONE_REMOTE: "r2:rotaract-backups/vps", REMOTE_RETENTION_DAYS: "90" });
  assert.equal(r.status, 0, r.stderr);
  const [file] = encrypted(ctx.backups);
  assert.ok(existsSync(join(ctx.dir, "remote/rotaract-backups/vps", file)));
  const calls = readFileSync(ctx.env.FAKE_LOG, "utf8");
  assert.match(calls, new RegExp(`rclone copyto .*${file} r2:rotaract-backups/vps/${file}`));
  assert.match(calls, /rclone delete r2:rotaract-backups\/vps --min-age 90d --include rotaract-\*\.tar\.gpg/);
  assert.match(r.stdout, /uploaded rotaract-/);
});

test("a truncated or failed upload is an error (the local copy stays)", { skip: !hasGpg }, () => {
  const ctx = setup("truncated");
  const r = run(ctx, { RCLONE_REMOTE: "r2:b", FAKE_TRUNCATE: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /uploaded size differs/);
  assert.equal(encrypted(ctx.backups).length, 1);
  const failed = setup("upload-fails");
  assert.match(run(failed, { RCLONE_REMOTE: "r2:b", FAKE_UPLOAD_FAIL: "1" }).stderr, /upload to r2:b failed/);
});

test("local retention deletes only encrypted backups older than RETENTION_DAYS", { skip: !hasGpg }, () => {
  const ctx = setup("retention");
  mkdirSync(ctx.backups, { recursive: true });
  const old = join(ctx.backups, "rotaract-20260801T033000Z.tar.gpg");
  const recent = join(ctx.backups, "rotaract-20261001T033000Z.tar.gpg");
  const other = join(ctx.backups, "drill-20260801T000000Z.txt");
  for (const f of [old, recent, other]) writeFileSync(f, "x");
  const days = (n) => new Date(Date.now() - n * 86_400_000);
  utimesSync(old, days(30), days(30));
  utimesSync(other, days(30), days(30));
  utimesSync(recent, days(2), days(2));
  const r = run(ctx, { RETENTION_DAYS: "14" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(old));
  assert.ok(existsSync(recent));
  assert.ok(existsSync(other));
  assert.equal(encrypted(ctx.backups).length, 2);
});

test("settings can come from the config file", { skip: !hasGpg }, () => {
  const ctx = setup("config-file");
  const config = join(ctx.dir, "env");
  writeFileSync(config, `RCLONE_REMOTE=drive:backups\nBACKUP_DATABASES=institutional_kernel\nBACKUP_VOLUMES=""\n`);
  const r = run(ctx, { BACKUP_CONFIG: config });
  assert.equal(r.status, 0, r.stderr);
  const calls = readFileSync(ctx.env.FAKE_LOG, "utf8");
  assert.match(calls, /rclone copyto .* drive:backups\//);
  assert.doesNotMatch(calls, /-d meetings/);
});
