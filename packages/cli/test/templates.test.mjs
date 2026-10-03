import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { run } from "../src/cli.js";
import { slug, templateVars } from "../src/commands/init.js";
import {
  renderString,
  renderTemplate,
  targetName,
  TEMPLATES_DIR,
} from "../src/lib/templates.js";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** A fake kernel checkout, enough for --kernel-repo validation. */
function fakeKernelRepo() {
  const repo = mkdtempSync(join(tmpdir(), "mr-kernel-"));
  for (const file of [
    "infra/docker/api.Dockerfile",
    "prisma/schema.prisma",
    "prisma/seed-synthetic.ts",
    "kernel-openapi.yaml",
  ]) {
    mkdirSync(join(repo, file, ".."), { recursive: true });
    writeFileSync(join(repo, file), "");
  }
  return repo;
}

describe("template rendering", () => {
  test("names and placeholders", () => {
    assert.equal(targetName("_dot_gitignore"), ".gitignore");
    assert.equal(targetName("package.json.tmpl"), "package.json");
    assert.equal(targetName("_dot_env.example"), ".env.example");
    assert.equal(
      renderString("hola {{ NAME }} {{NAME}}", { NAME: "x" }),
      "hola x x",
    );
    assert.throws(() => renderString("{{MISSING}}", {}), /no tiene valor/);
    assert.equal(slug("Mi App Ñandú 2"), "mi-app-nandu-2");
  });

  test("SDK dependencies: the kernel checkout with --kernel-repo, npm/PyPI otherwise", () => {
    const local = templateVars({ name: "App", kernelRepo: "/k" });
    assert.equal(local.SDK_JS_DEPENDENCY, "file:/k/packages/sdk-js");
    assert.equal(
      local.SDK_PY_REQUIREMENT,
      "mirotaract[fastapi] @ file:///k/sdks/python",
    );
    const published = templateVars({ name: "App", kernelRepo: null });
    assert.equal(published.SDK_JS_DEPENDENCY, "^0.1.0");
    assert.equal(published.SDK_PY_REQUIREMENT, "mirotaract[fastapi]>=0.1.0");
    assert.equal(templateVars({ name: "9 Club" }).DART_PACKAGE, "app_9_club");
  });

  for (const template of ["next", "fastapi", "flutter"]) {
    test(`${template}: renders completely, with login, roster, .env.example, README and AGENTS.md`, () => {
      const target = mkdtempSync(join(tmpdir(), `mr-${template}-`));
      const files = renderTemplate(
        template,
        target,
        templateVars({ name: "Club Demo", kernelRepo: "/k" }),
      );
      assert.ok(files.length >= 5);
      for (const path of walk(target)) {
        const text = readFileSync(path, "utf8");
        assert.doesNotMatch(
          text,
          /\{\{[A-Z_ ]+\}\}/,
          `placeholder left in ${path}`,
        );
        assert.ok(!path.endsWith(".tmpl"), path);
        assert.doesNotMatch(
          text,
          /mrs_(?!x+\b)[A-Za-z0-9_-]{20,}/,
          `real-looking secret in ${path}`,
        );
      }
      for (const required of [
        "README.md",
        "AGENTS.md",
        ".env.example",
        ".gitignore",
      ])
        assert.ok(
          existsSync(join(target, required)),
          `${template} lacks ${required}`,
        );
      const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
      assert.match(gitignore, /^\.env\.local$/m);
      const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
      for (const rule of [/localStorage/, /JWKS/, /scopes?/i, /firma/i])
        assert.match(agents, rule);
      const all = walk(target)
        .map((p) => readFileSync(p, "utf8"))
        .join("\n");
      assert.match(all, /Ingresar con Mi Rotaract/);
      assert.match(all, /padr[oó]n/i);
    });
  }

  test("next: valid package.json using @mirotaract/sdk/next", () => {
    const target = mkdtempSync(join(tmpdir(), "mr-next-"));
    renderTemplate(
      "next",
      target,
      templateVars({ name: "Club Demo", kernelRepo: "/k" }),
    );
    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    assert.equal(pkg.name, "club-demo");
    assert.equal(
      pkg.dependencies["@mirotaract/sdk"],
      "file:/k/packages/sdk-js",
    );
    assert.match(pkg.dependencies.next, /^\^15/);
    assert.match(
      readFileSync(join(target, "src/lib/mirotaract.ts"), "utf8"),
      /@mirotaract\/sdk\/next/,
    );
  });

  test("flutter: public client, PKCE, no secrets", () => {
    const target = mkdtempSync(join(tmpdir(), "mr-flutter-"));
    renderTemplate(
      "flutter",
      target,
      templateVars({ name: "Club Demo", kernelRepo: null }),
    );
    const pubspec = readFileSync(join(target, "pubspec.yaml"), "utf8");
    assert.match(pubspec, /^name: club_demo$/m);
    assert.match(pubspec, /flutter_appauth/);
    const dart = walk(join(target, "lib"))
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
    assert.doesNotMatch(dart, /clientSecret\s*:/);
    assert.match(dart, /flutter_secure_storage/);
  });
});

describe("mirotaract init", () => {
  test("creates the project and prints next steps", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-init-"));
    const repo = fakeKernelRepo();
    const out = sink();
    const code = await run(
      ["init", "mi-app", "--template", "fastapi", "--kernel-repo", repo],
      { cwd, env: {}, out, err: sink() },
    );
    assert.equal(code, 0);
    assert.ok(existsSync(join(cwd, "mi-app/app/main.py")));
    assert.match(
      readFileSync(join(cwd, "mi-app/requirements.txt"), "utf8"),
      new RegExp(`file://${repo}/sdks/python`),
    );
    assert.match(out.text, /Siguientes pasos/);
  });

  test("refuses a non-empty folder unless --force", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-init-"));
    writeFileSync(join(cwd, "algo.txt"), "x");
    const err = sink();
    assert.equal(
      await run(["init", "."], { cwd, env: {}, out: sink(), err }),
      1,
    );
    assert.match(err.text, /no está vacía/);
    assert.equal(
      await run(["init", ".", "--force"], {
        cwd,
        env: {},
        out: sink(),
        err: sink(),
      }),
      0,
    );
    assert.ok(existsSync(join(cwd, "src/app/page.tsx")));
  });

  test("rejects a folder that is not the kernel repo", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-init-"));
    const err = sink();
    assert.equal(
      await run(["init", "x", "--kernel-repo", cwd], {
        cwd,
        env: {},
        out: sink(),
        err,
      }),
      1,
    );
    assert.match(err.text, /no parece el repositorio del kernel/);
  });

  test("templates directory ships with the package", () => {
    assert.deepEqual(readdirSync(TEMPLATES_DIR).sort(), [
      "fastapi",
      "flutter",
      "next",
    ]);
  });
});
