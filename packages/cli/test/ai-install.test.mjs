// `mirotaract ai install` and `init --ai` without the @mirotaract/ai-skills
// package: the bundle is served by a local HTTP server, like the portal does
// at /ia/skills.json + /ia/skills.json.sha256.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { buildSkillsBundle } from "@mirotaract/ai-skills";

import { run } from "../src/cli.js";
import {
  DEFAULT_SKILLS_URL,
  mergeManagedBlock,
  parseChecksum,
} from "../src/lib/skills-bundle.js";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

const { json, sha256, bundle } = buildSkillsBundle();
const routes = new Map();
let server;
let base;
const hits = [];

function serve(prefix, body, checksum) {
  routes.set(`${prefix}/skills.json`, body);
  routes.set(`${prefix}/skills.json.sha256`, `${checksum}  skills.json\n`);
}

before(async () => {
  serve("/ia", json, sha256);
  serve(
    "/tampered",
    json.replace("mirotaract-padron", "mirotaract-pad0on"),
    sha256,
  );
  const evil = JSON.stringify({
    ...bundle,
    targets: { claude: [{ path: "../../escape.md", content: "x" }] },
  });
  serve("/evil", evil, createHash("sha256").update(evil).digest("hex"));
  serve("/badsum", json, "nope");
  server = createServer((req, res) => {
    hits.push(req.url);
    const body = routes.get(req.url);
    if (body === undefined) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function project() {
  return mkdtempSync(join(tmpdir(), "mr-ai-install-"));
}

/** No @mirotaract/ai-skills package (like `npx @mirotaract/cli`). */
const noPackage = async () => null;

describe("mirotaract ai install (skills bundle from the portal)", () => {
  test("downloads, verifies the sha256 and installs; merges AGENTS.md", async () => {
    const dir = project();
    writeFileSync(join(dir, "AGENTS.md"), "# Mi proyecto\n\nNotas propias.\n");
    const out = sink();
    const code = await run(
      [
        "ai",
        "install",
        "--target",
        "claude,agents",
        "--skills-url",
        `${base}/ia/skills.json`,
      ],
      { cwd: dir, env: {}, out, err: sink() },
    );
    assert.equal(code, 0, out.text);
    const skill = join(dir, ".claude/skills/mirotaract-padron/SKILL.md");
    assert.equal(
      readFileSync(skill, "utf8"),
      bundle.targets.claude.find((f) =>
        f.path.endsWith("mirotaract-padron/SKILL.md"),
      ).content,
    );
    const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
    assert.match(
      agents,
      /^# Mi proyecto\n\nNotas propias\.\n\n<!-- mirotaract-ai-skills:begin -->/,
    );
    assert.match(
      out.text,
      /\.claude\/skills\/mirotaract-padron\/SKILL\.md: creado/,
    );
    assert.match(out.text, /AGENTS\.md: agregado al archivo existente/);
    assert.match(
      out.text,
      new RegExp(`sha256 ${sha256.slice(0, 12)}… verificado`),
    );
    assert.match(
      out.text,
      /Versión preliminar: todavía no pasaron las evaluaciones/,
    );

    // Idempotent: a second run changes nothing.
    const again = sink();
    assert.equal(
      await run(
        [
          "ai",
          "install",
          "-t",
          "claude,agents",
          "--skills-url",
          `${base}/ia/skills.json`,
        ],
        {
          cwd: dir,
          env: {},
          out: again,
          err: sink(),
        },
      ),
      0,
    );
    assert.doesNotMatch(again.text, /creado|actualizado|agregado/);
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), agents);
  });

  test("without the package and without --skills-url, uses the portal URL", async () => {
    const dir = project();
    const seen = [];
    const fetch = (url, init) => {
      seen.push(String(url));
      return globalThis.fetch(
        String(url).replace("https://developers.rotaract4845.com", base),
        init,
      );
    };
    const code = await run(["ai", "install", "--target", "cursor"], {
      cwd: dir,
      env: {},
      out: sink(),
      err: sink(),
      fetch,
      importAiSkills: noPackage,
    });
    assert.equal(code, 0);
    assert.deepEqual(seen.sort(), [
      DEFAULT_SKILLS_URL,
      `${DEFAULT_SKILLS_URL}.sha256`,
    ]);
    assert.ok(existsSync(join(dir, ".cursor/rules/mirotaract-seguridad.mdc")));
  });

  test("MIROTARACT_SKILLS_URL works too, and the package path still wins when installed", async () => {
    const dir = project();
    const out = sink();
    assert.equal(
      await run(["ai", "install", "--target", "copilot", dir], {
        cwd: tmpdir(),
        env: { MIROTARACT_SKILLS_URL: `${base}/ia/skills.json` },
        out,
        err: sink(),
      }),
      0,
    );
    assert.ok(existsSync(join(dir, ".github/copilot-instructions.md")));
    assert.match(out.text, /Origen: paquete de skills/);

    const viaPackage = sink();
    const other = project();
    assert.equal(
      await run(["ai", "install", "--target", "claude", other], {
        cwd: tmpdir(),
        env: {},
        out: viaPackage,
        err: sink(),
      }),
      0,
    );
    assert.match(viaPackage.text, /Origen: @mirotaract\/ai-skills/);
  });

  test("a checksum mismatch installs nothing", async () => {
    const dir = project();
    const err = sink();
    assert.equal(
      await run(
        [
          "ai",
          "install",
          "-t",
          "claude",
          "--skills-url",
          `${base}/tampered/skills.json`,
        ],
        {
          cwd: dir,
          env: {},
          out: sink(),
          err,
        },
      ),
      1,
    );
    assert.match(err.text, /no coincide con su suma SHA-256/);
    assert.ok(!existsSync(join(dir, ".claude")));
  });

  test("an invalid checksum file, a 404 and an unsafe path are refused", async () => {
    for (const [prefix, message] of [
      ["/badsum", /no tiene una suma SHA-256 válida/],
      ["/missing", /HTTP 404/],
      ["/evil", /ruta insegura/],
    ]) {
      const dir = project();
      const err = sink();
      assert.equal(
        await run(
          [
            "ai",
            "install",
            "-t",
            "claude",
            "--skills-url",
            `${base}${prefix}/skills.json`,
          ],
          {
            cwd: dir,
            env: {},
            out: sink(),
            err,
          },
        ),
        1,
        prefix,
      );
      assert.match(err.text, message);
      assert.ok(
        !existsSync(join(dir, "..", "escape.md")) || prefix !== "/evil",
      );
    }
  });

  test("an unknown target fails before any download", async () => {
    const before = hits.length;
    const err = sink();
    assert.equal(
      await run(
        [
          "ai",
          "install",
          "-t",
          "vim",
          "--skills-url",
          `${base}/ia/skills.json`,
        ],
        {
          cwd: project(),
          env: {},
          out: sink(),
          err,
        },
      ),
      1,
    );
    assert.match(err.text, /Destino desconocido: vim/);
    assert.equal(hits.length, before);
  });

  test("never clobbers a file it didn't generate (exit 2) unless --force; --dry-run writes nothing", async () => {
    const dir = project();
    const path = join(dir, ".claude/skills/mirotaract-padron/SKILL.md");
    mkdirSync(join(dir, ".claude/skills/mirotaract-padron"), {
      recursive: true,
    });
    writeFileSync(path, "mío\n");
    const args = [
      "ai",
      "install",
      "-t",
      "claude",
      "--skills-url",
      `${base}/ia/skills.json`,
    ];
    const out = sink();
    assert.equal(await run(args, { cwd: dir, env: {}, out, err: sink() }), 2);
    assert.match(out.text, /SKILL\.md: OMITIDO/);
    assert.equal(readFileSync(path, "utf8"), "mío\n");

    const dry = project();
    const dryOut = sink();
    assert.equal(
      await run([...args, "--dry-run"], {
        cwd: dry,
        env: {},
        out: dryOut,
        err: sink(),
      }),
      0,
    );
    assert.match(dryOut.text, /\[simulación\]/);
    assert.ok(!existsSync(join(dry, ".claude")));

    assert.equal(
      await run([...args, "--force"], {
        cwd: dir,
        env: {},
        out: sink(),
        err: sink(),
      }),
      0,
    );
    assert.notEqual(readFileSync(path, "utf8"), "mío\n");
  });

  test("help lists the command", async () => {
    const out = sink();
    assert.equal(
      await run(["--help"], { cwd: tmpdir(), env: {}, out, err: sink() }),
      0,
    );
    assert.match(out.text, /ai install/);
    const sub = sink();
    await run(["ai", "install", "--help"], {
      cwd: tmpdir(),
      env: {},
      out: sub,
      err: sink(),
    });
    assert.match(sub.text, /skills\.json/);
  });
});

describe("mirotaract init --ai with the bundle", () => {
  test("template + skills from the portal bundle, template AGENTS.md kept", async () => {
    const cwd = project();
    const out = sink();
    const code = await run(
      ["init", "app", "--template", "next", "--ai", "claude,agents"],
      {
        cwd,
        env: { MIROTARACT_SKILLS_URL: `${base}/ia/skills.json` },
        out,
        err: sink(),
      },
    );
    assert.equal(code, 0, out.text);
    assert.ok(
      existsSync(join(cwd, "app/.claude/skills/mirotaract-ingresar/SKILL.md")),
    );
    const agents = readFileSync(join(cwd, "app/AGENTS.md"), "utf8");
    assert.match(agents, /^# AGENTS\.md — contexto para asistentes de IA/);
    assert.match(agents, /mirotaract-ai-skills:begin/);
    assert.match(out.text, /Origen: paquete de skills .* verificado/);
    assert.match(out.text, /El SDK \(@mirotaract\/sdk\) se instala desde npm/);
  });

  test("init . --name … --force next to an existing PLAN.md (the master prompt's flow)", async () => {
    const cwd = project();
    writeFileSync(join(cwd, "PLAN.md"), "# Plan\n");
    const out = sink();
    const code = await run(
      [
        "init",
        ".",
        "--name",
        "mi-idea",
        "--template",
        "fastapi",
        "--ai",
        "claude",
        "--force",
      ],
      {
        cwd,
        env: { MIROTARACT_SKILLS_URL: `${base}/ia/skills.json` },
        out,
        err: sink(),
      },
    );
    assert.equal(code, 0, out.text);
    assert.equal(readFileSync(join(cwd, "PLAN.md"), "utf8"), "# Plan\n");
    assert.match(
      readFileSync(join(cwd, "requirements.txt"), "utf8"),
      /mirotaract\[fastapi\] @ git\+https:\/\/github\.com\/equipoit4845\/rotaract-app\.git#subdirectory=sdks\/python/,
    );
    assert.ok(
      existsSync(join(cwd, ".claude/skills/mirotaract-kernel-local/SKILL.md")),
    );
  });

  test("if the download fails the app is still created, with a retry hint", async () => {
    const cwd = project();
    const out = sink();
    const code = await run(["init", "app", "--ai", "claude"], {
      cwd,
      env: { MIROTARACT_SKILLS_URL: `${base}/missing/skills.json` },
      out,
      err: sink(),
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(cwd, "app/package.json")));
    assert.match(
      out.text,
      /Aviso: la app se creó, pero no pude instalar las skills/,
    );
    assert.match(out.text, /mirotaract ai install --target claude app/);
  });
});

describe("helpers", () => {
  test("parseChecksum and mergeManagedBlock", () => {
    assert.equal(
      parseChecksum(`${"A".repeat(64)}  skills.json`),
      "a".repeat(64),
    );
    assert.equal(parseChecksum("nada"), null);
    const markers = { blockBegin: "<!-- b -->", blockEnd: "<!-- e -->" };
    assert.equal(
      mergeManagedBlock("mío", "<!-- b -->x<!-- e -->\n", markers),
      "mío\n\n<!-- b -->x<!-- e -->\n",
    );
    assert.equal(
      mergeManagedBlock(
        "a\n<!-- b -->viejo<!-- e -->\nz\n",
        "<!-- b -->nuevo<!-- e -->\n",
        markers,
      ),
      "a\n<!-- b -->nuevo<!-- e -->\nz\n",
    );
  });
});
