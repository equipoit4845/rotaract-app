import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { main } from "../src/cli.js";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  buildAll,
  expandBraces,
  install,
  loadChecklist,
  loadPrompts,
  loadSkills,
  mergeManagedBlock,
  parseFrontmatter,
  parseTargets,
  renderTarget,
  TARGETS,
  validateSkill,
} from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const tmp = () => mkdtempSync(join(tmpdir(), "mr-skills-"));
const sink = () => {
  let text = "";
  return {
    write: (c) => (text += c),
    get text() {
      return text;
    },
  };
};
function walk(dir) {
  return readdirSync(dir).flatMap((e) =>
    statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)],
  );
}

const EXPECTED_SKILLS = [
  "mirotaract-ingresar",
  "mirotaract-kernel-local",
  "mirotaract-modulo",
  "mirotaract-padron",
  "mirotaract-permisos",
  "mirotaract-webhooks",
];

describe("skill sources", () => {
  test("the six task skills load and are valid", () => {
    const skills = loadSkills();
    assert.deepEqual(
      skills.map((s) => s.name),
      EXPECTED_SKILLS,
    );
    for (const s of skills) assert.deepEqual(validateSkill(s), [], s.name);
  });

  test("the checklist covers every rule of the template AGENTS.md", () => {
    const checklist = loadChecklist();
    for (const rule of [
      /localStorage/,
      /sessionStorage/,
      /JWKS/,
      /ES256/,
      /`iss`/,
      /`aud`/,
      /Scopes mínimos/,
      /firma de cada webhook/,
      /variables de entorno del servidor/,
      /datos personales en los logs/,
    ])
      assert.match(checklist, rule);
    // Same rules as the CLI templates' AGENTS.md (they must agree).
    for (const template of ["next", "fastapi"]) {
      const agents = readFileSync(
        join(REPO, `packages/cli/templates/${template}/AGENTS.md`),
        "utf8",
      );
      for (const rule of [/localStorage/, /JWKS/, /scopes/i, /firma/i])
        assert.match(agents, rule);
    }
  });

  test("validateSkill rejects what Claude Code would reject", () => {
    const base = {
      name: "ok-name",
      title: "T",
      description: "d",
      globs: [],
      body: "x",
    };
    assert.deepEqual(validateSkill(base), []);
    assert.ok(validateSkill({ ...base, name: "Mal Nombre" }).length);
    assert.ok(validateSkill({ ...base, name: "x".repeat(65) }).length);
    assert.ok(validateSkill({ ...base, description: "a <b> c" }).length);
    assert.ok(validateSkill({ ...base, description: "x".repeat(1025) }).length);
    assert.ok(
      validateSkill({
        ...base,
        body: "## Checklist de seguridad (obligatoria)",
      }).length,
    );
  });

  test("frontmatter parsing", () => {
    assert.deepEqual(parseFrontmatter("---\na: 1\n---\nhola").data, { a: 1 });
    assert.throws(() => parseFrontmatter("sin frontmatter"), /frontmatter/);
  });
});

describe("renderers", () => {
  const skills = loadSkills();
  const checklist = loadChecklist();

  test("every per-skill file ends with the security checklist", () => {
    for (const target of ["claude", "cursor", "copilot"])
      for (const file of renderTarget(target, { skills, checklist }).filter(
        (f) => !f.managed && !f.path.endsWith("mirotaract-seguridad.mdc"),
      ))
        assert.ok(
          file.content.trimEnd().endsWith(checklist.trimEnd()),
          `${target} ${file.path}`,
        );
    const agents = renderTarget("agents", { skills, checklist })[0].content;
    assert.match(
      agents,
      /### Checklist de seguridad \(obligatoria\)\n[\s\S]*<!-- mirotaract-ai-skills:end -->\n$/,
    );
  });

  test("claude: SKILL.md with name and description frontmatter", () => {
    const files = renderTarget("claude", { skills, checklist });
    assert.equal(files.length, skills.length);
    for (const f of files) {
      assert.match(f.path, /^\.claude\/skills\/[a-z-]+\/SKILL\.md$/);
      const { data } = parseFrontmatter(f.content);
      assert.deepEqual(Object.keys(data).sort(), ["description", "name"]);
      assert.equal(f.path.split("/")[2], data.name);
      assert.ok(data.description.length <= 1024);
    }
  });

  test("cursor: .mdc with description, comma-separated globs (no braces) and an always-on security rule", () => {
    const files = renderTarget("cursor", { skills, checklist });
    const security = files.find((f) =>
      f.path.endsWith("mirotaract-seguridad.mdc"),
    );
    assert.match(security.content, /alwaysApply: true/);
    for (const f of files.filter((f) => f !== security)) {
      const header = f.content.split("\n---\n")[0];
      assert.match(
        header,
        /^---\ndescription: ".+"\nglobs: \S+\nalwaysApply: false$/,
      );
      assert.doesNotMatch(header, /[{}]/);
    }
  });

  test("copilot: root instructions block + applyTo per task", () => {
    const files = renderTarget("copilot", { skills, checklist });
    const root = files.find(
      (f) => f.path === ".github/copilot-instructions.md",
    );
    assert.ok(root.managed);
    assert.ok(root.content.startsWith(BLOCK_BEGIN));
    for (const f of files.filter((f) => f !== root)) {
      assert.match(
        f.path,
        /^\.github\/instructions\/[a-z-]+\.instructions\.md$/,
      );
      const { data } = parseFrontmatter(f.content);
      assert.equal(typeof data.applyTo, "string");
      assert.doesNotMatch(data.applyTo, /[{}]/);
    }
  });

  test("agents: one AGENTS.md with every skill, headings nested", () => {
    const [file] = renderTarget("agents", { skills, checklist });
    for (const s of skills)
      assert.match(
        file.content,
        new RegExp(`## ${s.title.replace(/[()".+]/g, "\\$&")}\\n`),
      );
    assert.doesNotMatch(
      file.content.replace(/```[\s\S]*?```/g, ""),
      /^## Qué te llega/m,
    ); // demoted to ###
  });

  test("subset and unknown skills", () => {
    assert.equal(
      renderTarget("claude", { only: ["mirotaract-webhooks"] }).length,
      1,
    );
    assert.throws(() => renderTarget("claude", { only: ["nope"] }), /nope/);
    assert.throws(() => renderTarget("emacs"), /Destino desconocido/);
  });

  test("brace expansion", () => {
    assert.deepEqual(expandBraces("**/*.{ts,py}"), ["**/*.ts", "**/*.py"]);
    assert.deepEqual(expandBraces("a/{b,c}/{d,e}"), [
      "a/b/d",
      "a/b/e",
      "a/c/d",
      "a/c/e",
    ]);
    assert.deepEqual(expandBraces("plain"), ["plain"]);
  });

  test("build is deterministic", () => {
    const a = tmp();
    const b = tmp();
    const filesA = buildAll(a);
    buildAll(b);
    assert.equal(filesA.length, skills.length * 3 + 1 + 1 + 1); // claude + cursor + copilot instr, cursor security, copilot root, AGENTS.md
    for (const rel of filesA)
      assert.equal(
        readFileSync(join(a, rel), "utf8"),
        readFileSync(join(b, rel), "utf8"),
      );
    for (const target of TARGETS)
      assert.ok(filesA.some((f) => f.startsWith(`${target}/`)));
  });

  test("generated YAML frontmatter parses", () => {
    for (const target of ["claude", "copilot"])
      for (const f of renderTarget(target, { skills, checklist }).filter(
        (f) => !f.managed,
      ))
        parseYaml(f.content.split("\n---\n")[0].slice(4));
  });
});

describe("managed blocks", () => {
  const block = `${BLOCK_BEGIN}\nnuevo\n${BLOCK_END}\n`;
  test("appends to a user file and replaces on update, keeping user text", () => {
    const once = mergeManagedBlock("# Mi app\n\nreglas propias\n", block);
    assert.equal(once, `# Mi app\n\nreglas propias\n\n${block}`);
    const twice = mergeManagedBlock(once.replace("nuevo", "viejo"), block);
    assert.equal(twice, once);
    const middle = mergeManagedBlock(
      `antes\n${BLOCK_BEGIN}\nx\n${BLOCK_END}\ndespués\n`,
      block,
    );
    assert.equal(middle, `antes\n${block}después\n`);
  });
});

describe("install", () => {
  test("creates, then reports unchanged; never clobbers user files without --force", () => {
    const dir = tmp();
    const first = install({
      targets: ["claude", "cursor", "copilot", "agents"],
      dir,
    });
    assert.ok(first.every((r) => r.action === "created"));
    const second = install({
      targets: ["claude", "cursor", "copilot", "agents"],
      dir,
    });
    assert.ok(second.every((r) => r.action === "unchanged"));

    const userRule = join(dir, ".cursor/rules/mirotaract-webhooks.mdc");
    writeFileSync(userRule, "mis reglas\n");
    const skipped = install({ targets: ["cursor"], dir });
    assert.equal(
      skipped.find((r) => r.path.endsWith("mirotaract-webhooks.mdc")).action,
      "skipped",
    );
    assert.equal(readFileSync(userRule, "utf8"), "mis reglas\n");
    const forced = install({ targets: ["cursor"], dir, force: true });
    assert.equal(
      forced.find((r) => r.path.endsWith("mirotaract-webhooks.mdc")).action,
      "updated",
    );
  });

  test("merges into an existing AGENTS.md and supports --dry-run", () => {
    const dir = tmp();
    writeFileSync(join(dir, "AGENTS.md"), "# Reglas del equipo\n");
    const dry = install({ targets: ["agents"], dir, dryRun: true });
    assert.equal(dry[0].action, "merged");
    assert.equal(
      readFileSync(join(dir, "AGENTS.md"), "utf8"),
      "# Reglas del equipo\n",
    );
    install({ targets: ["agents"], dir });
    const text = readFileSync(join(dir, "AGENTS.md"), "utf8");
    assert.ok(
      text.startsWith(
        "# Reglas del equipo\n\n<!-- mirotaract-ai-skills:begin -->",
      ),
    );
  });

  test("parseTargets", () => {
    assert.deepEqual(parseTargets("all"), TARGETS);
    assert.deepEqual(parseTargets("claude, cursor,claude"), [
      "claude",
      "cursor",
    ]);
    assert.throws(() => parseTargets(""), /Falta --target/);
    assert.throws(() => parseTargets("vim"), /Destino desconocido/);
  });
});

describe("CLI", () => {
  test("install --target claude <dir>", () => {
    const dir = tmp();
    const out = sink();
    assert.equal(
      main(["install", "--target", "claude", dir], { out, err: sink() }),
      0,
    );
    assert.match(out.text, /SKILL\.md: creado/);
    assert.ok(walk(dir).length === EXPECTED_SKILLS.length);
  });

  test("exit code 2 when a file was skipped; 1 on bad input", () => {
    const dir = tmp();
    mkdirSync(join(dir, ".claude/skills/mirotaract-webhooks"), {
      recursive: true,
    });
    writeFileSync(
      join(dir, ".claude/skills/mirotaract-webhooks/SKILL.md"),
      "mío",
    );
    assert.equal(
      main(["install", "-t", "claude", dir], { out: sink(), err: sink() }),
      2,
    );
    const err = sink();
    assert.equal(main(["install", "-t", "vim", dir], { out: sink(), err }), 1);
    assert.match(err.text, /Destino desconocido/);
  });

  test("list, show, prompts, help", () => {
    const out = sink();
    main(["list"], { out });
    for (const name of EXPECTED_SKILLS)
      assert.match(out.text, new RegExp(name));
    const show = sink();
    main(["show", "mirotaract-padron", "--target", "cursor"], { out: show });
    assert.match(show.text, /^---\ndescription:/);
    const prompts = sink();
    main(["prompts"], { out: prompts });
    assert.ok(prompts.text.trim().split("\n").length >= 3);
    const help = sink();
    assert.equal(main(["--help"], { out: help }), 0);
    assert.match(help.text, /--target claude\|cursor\|copilot\|agents/);
  });
});

describe("prompt templates (E10.5)", () => {
  test("each combines mirotaract init, the skills and the MCP, and ends running on the local kernel", () => {
    const prompts = loadPrompts();
    assert.ok(prompts.length >= 3);
    for (const p of prompts) {
      assert.ok(p.title && p.description, p.file);
      assert.match(p.body, /mirotaract init/, p.file);
      assert.match(p.body, /@mirotaract\/ai-skills install/, p.file);
      assert.match(p.body, /@mirotaract\/mcp/, p.file);
      assert.match(p.body, /mirotaract dev up/, p.file);
      assert.match(p.body, /sandbox-9999/, p.file);
    }
  });
});
