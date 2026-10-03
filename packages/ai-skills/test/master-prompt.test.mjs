import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import {
  BUNDLE_SCHEMA,
  buildSkillsBundle,
  bundlePublicPath,
  GENERATED_MARK,
  loadIdeas,
  loadMasterTemplate,
  loadPlanningTemplate,
  loadPrompts,
  renderTarget,
  TARGETS,
} from "../src/index.js";
import {
  applyConditionals,
  ASSISTANT_IDS,
  cleanField,
  MAX_FIELD,
  promptFileName,
  PromptTemplateError,
  renderPrompt,
  stripDocComment,
  substitute,
} from "../src/master-prompt.js";

const master = loadMasterTemplate();
const planning = loadPlanningTemplate();
const IDEA = {
  idea: "Inscripciones a la Conferencia Distrital",
  users: "Socias y socios de todos los clubes",
  data: "Nombre visible y club",
  scope: "distrito",
  template: "next",
};

function leftovers(text) {
  return [...text.matchAll(/<!--|\{\{[A-Z][A-Z0-9_]*\}\}|-->/g)].map(
    (m) => m[0],
  );
}

describe("template engine", () => {
  test("conditionals: if / else / nesting / negation / OR", () => {
    const t =
      "a<!-- if: x -->X<!-- if: !y -->notY<!-- /if --><!-- else -->noX<!-- /if --><!-- if: y|z -->YZ<!-- /if -->b";
    assert.equal(applyConditionals(t, { x: true }), "aXnotYb");
    assert.equal(applyConditionals(t, { x: true, y: true }), "aXYZb");
    assert.equal(applyConditionals(t, { z: true }), "anoXYZb");
  });

  test("tags on their own line leave no blank residue", () => {
    const t = "uno\n<!-- if: x -->\ndos\n<!-- /if -->\ntres\n";
    assert.equal(applyConditionals(t, { x: true }), "uno\ndos\ntres\n");
    assert.equal(applyConditionals(t, {}), "uno\ntres\n");
  });

  test("unbalanced or invalid tags are errors, not silent output", () => {
    assert.throws(
      () => applyConditionals("<!-- if: x -->", {}),
      PromptTemplateError,
    );
    assert.throws(
      () => applyConditionals("<!-- /if -->", {}),
      PromptTemplateError,
    );
    assert.throws(
      () => applyConditionals("<!-- else -->", {}),
      PromptTemplateError,
    );
    assert.throws(
      () =>
        applyConditionals(
          "<!-- if: x --><!-- else --><!-- else --><!-- /if -->",
          {},
        ),
      PromptTemplateError,
    );
    assert.throws(
      () => applyConditionals("<!-- if: a b -->x<!-- /if -->", {}),
      PromptTemplateError,
    );
    assert.throws(() => substitute("{{NOPE}}", {}), PromptTemplateError);
  });

  test("the doc comment is maintainer-only and may contain template syntax", () => {
    assert.match(master, /^<!-- doc/);
    const body = stripDocComment(master);
    assert.ok(!body.includes("fuente única"));
    assert.match(body, /^# Creá mi solución para Rotaract/);
  });

  test("user text is substituted once and never parsed as template", () => {
    const text = renderPrompt(master, {
      assistant: "claude",
      idea: "Probar {{SKILLS_TARGET}} y <!-- if: auto -->x<!-- /if -->",
    });
    assert.ok(
      text.includes(
        "Probar {{SKILLS_TARGET}} y <!-- if: auto -->x<!-- /if -->",
      ),
    );
  });

  test("fields are trimmed, blank lines collapsed and capped", () => {
    assert.equal(cleanField("  hola\r\n\r\n\r\nchau  "), "hola\nchau");
    const long = cleanField("x".repeat(MAX_FIELD + 50));
    assert.equal(long.length, MAX_FIELD);
    assert.ok(long.endsWith("…"));
    assert.equal(cleanField(undefined), "");
  });
});

describe("master prompt", () => {
  for (const assistant of [...ASSISTANT_IDS, "auto"])
    test(`${assistant}: renders cleanly`, () => {
      for (const inputs of [
        {},
        IDEA,
        { ...IDEA, scope: "club", template: "fastapi" },
      ]) {
        const text = renderPrompt(master, { ...inputs, assistant });
        assert.deepEqual(
          leftovers(text),
          [],
          `${assistant} ${JSON.stringify(inputs)}`,
        );
        assert.ok(!/\n{3,}/.test(text));
      }
    });

  test("covers every step: prerequisites → tools → docs → plan → scaffold → kernel → build → checks → demo → production", () => {
    const text = renderPrompt(master, { ...IDEA, assistant: "claude" });
    const steps = [
      /node --version/, // a. prerequisites
      /docker compose version/,
      /git --version/,
      /WSL2/,
      /npx -y @mirotaract\/mcp/, // b. tools
      /@mirotaract\/cli@latest/,
      /--ai claude/,
      /llms-full\.txt/, // c. docs
      /PLAN\.md[\s\S]*esperá mi OK/, // d. plan first
      /mirotaract init \. --name <nombre> --template <next\|fastapi>/, // e. scaffold
      /git clone --depth 1 https:\/\/github\.com\/equipoit4845\/rotaract-app\.git/, // f. kernel
      /mirotaract dev up --kernel-repo/,
      /10 a 15 minutos/,
      /Nunca uses datos personales reales/,
      /Sesión del lado del servidor/, // g. architecture
      /API de datos solo desde el servidor/,
      /Scopes mínimos/,
      /Webhooks para sincronizar[\s\S]*firma/,
      /ids del\s+kernel como claves/,
      /mirotaract\.module\.json/,
      /npx shadcn@latest add https:\/\/developers\.rotaract4845\.com\/r\//,
      /castellano/,
      /Tests/,
      /README\.md/,
      /checklist de seguridad/, // h. checks
      /evals\.js run --task/,
      /sandbox-9999/, // i. demo
      /socio\.norte@example\.org/,
      /\.env\.example/, // j. production
      /DEPLOY\.md[\s\S]*Vercel[\s\S]*Render/,
      /REVISION-RDR\.md[\s\S]*propósito[\s\S]*persona responsable[\s\S]*política de privacidad[\s\S]*contacto/i,
      /Preguntame solo lo que es decisión mía/,
      /revision-de-apps\.md/,
      /limites\.md/,
      /panel de los socios/,
      /versión preliminar/,
    ];
    for (const step of steps) assert.match(text, step);
    const order = [
      "## Paso 1",
      "## Paso 2",
      "## Paso 3",
      "## Paso 4",
      "## Paso 5",
      "## Paso 6",
      "## Paso 7",
      "## Paso 8",
      "## Paso 9",
    ];
    const positions = order.map((h) => text.indexOf(h));
    assert.ok(
      positions.every((p, i) => p > 0 && (i === 0 || p > positions[i - 1])),
    );
  });

  const VARIANTS = {
    claude: {
      has: [/\.mcp\.json/, /--ai claude/, /CLAUDE\.md/, /claude mcp add/],
      not: [/\.cursor\/mcp\.json/, /\.vscode\/mcp\.json/, /config\.toml/],
    },
    cursor: {
      has: [/\.cursor\/mcp\.json/, /--ai cursor/, /Settings → MCP/],
      not: [/\.mcp\.json`/, /\.vscode\/mcp\.json/, /CLAUDE\.md/],
    },
    copilot: {
      has: [/\.vscode\/mcp\.json/, /--ai copilot/, /"servers"/],
      not: [/\.cursor\/mcp\.json/, /CLAUDE\.md/, /config\.toml/],
    },
    otro: {
      has: [/config\.toml/, /--ai agents/, /mcp_servers\.mirotaract/],
      not: [/\.cursor\/mcp\.json/, /\.vscode\/mcp\.json/, /CLAUDE\.md/],
    },
  };
  for (const [assistant, { has, not }] of Object.entries(VARIANTS))
    test(`${assistant}: only its own MCP location and skills target`, () => {
      const text = renderPrompt(master, { ...IDEA, assistant });
      for (const re of has)
        assert.match(text, re, `${assistant} should have ${re}`);
      for (const re of not)
        assert.doesNotMatch(text, re, `${assistant} should not have ${re}`);
    });

  test("auto (served at /ia/prompt.md): every assistant's setup, labelled", () => {
    const text = renderPrompt(master, {});
    for (const re of [
      /\*\*Claude Code:\*\*/,
      /\*\*Cursor:\*\*/,
      /\*\*VS Code con GitHub Copilot/,
      /\*\*Codex y otros/,
      /--ai <destino>/,
      /`agents` \(Codex/,
    ])
      assert.match(text, re);
    assert.equal(renderPrompt(master, { assistant: "vim" }), text); // unknown → auto
  });

  test("idea section: filled vs. asking in one message", () => {
    const filled = renderPrompt(master, { ...IDEA, assistant: "claude" });
    assert.match(
      filled,
      /\*\*Qué quiero construir:\*\* Inscripciones a la Conferencia Distrital/,
    );
    assert.match(filled, /\*\*Alcance:\*\* es para todo el distrito/);
    assert.match(filled, /plantilla `next`/);
    assert.doesNotMatch(filled, /Todavía no te la conté/);
    const empty = renderPrompt(master, { assistant: "claude" });
    assert.match(empty, /Todavía no te la conté[\s\S]*en un solo mensaje/);
    assert.doesNotMatch(empty, /Qué quiero construir/);
    const multi = renderPrompt(master, {
      idea: "uno\ndos",
      assistant: "claude",
    });
    assert.match(multi, /construir:\*\* uno\n {2}dos/);
  });

  test("club → per-club module; distrito → module only if it fits", () => {
    const club = renderPrompt(master, { ...IDEA, scope: "club" });
    assert.match(club, /Módulo instalable por club/);
    const district = renderPrompt(master, IDEA);
    assert.doesNotMatch(district, /Módulo instalable por club/);
    assert.match(district, /\*\*Módulo\*\*: si la idea sirve/);
  });

  test("file names for the download fallback", () => {
    assert.equal(
      promptFileName({ assistant: "cursor" }),
      "mirotaract-prompt-cursor.md",
    );
    assert.equal(promptFileName({}), "mirotaract-prompt.md");
  });
});

describe("planning prompt (Abrir en Claude)", () => {
  test("short enough for a URL, no build steps, carries the idea", () => {
    const text = renderPrompt(planning, IDEA);
    assert.deepEqual(leftovers(text), []);
    assert.ok(
      encodeURIComponent(text).length < 4000,
      `${encodeURIComponent(text).length}`,
    );
    assert.match(text, /Mi idea: Inscripciones/);
    assert.match(text, /llms\.txt/);
    assert.doesNotMatch(text, /mirotaract init|dev up/);
    assert.match(renderPrompt(planning, {}), /Preguntame primero/);
  });
});

describe("ideas", () => {
  test("the four prompt templates plus more, all valid", () => {
    const ideas = loadIdeas();
    assert.ok(ideas.length >= 8);
    const guides = ideas
      .map((i) => i.guide)
      .filter(Boolean)
      .sort();
    assert.deepEqual(
      guides,
      loadPrompts()
        .map((p) => p.name)
        .sort(),
    );
    for (const idea of ideas) {
      assert.ok(["next", "fastapi"].includes(idea.template));
      assert.ok(["club", "distrito"].includes(idea.scope));
      assert.ok(idea.summary.length < 140, idea.id);
      assert.deepEqual(
        leftovers(renderPrompt(master, { ...idea, assistant: "claude" })),
        [],
      );
    }
  });

  test("loadPrompts skips the _ files", () => {
    assert.ok(loadPrompts().every((p) => !p.file.startsWith("_")));
  });
});

describe("skills bundle (/ia/skills.json)", () => {
  test("deterministic, checksummed, every target, preliminary by default", () => {
    const a = buildSkillsBundle();
    const b = buildSkillsBundle();
    assert.equal(a.json, b.json);
    assert.equal(a.sha256, createHash("sha256").update(a.json).digest("hex"));
    assert.equal(a.bundle.schema, BUNDLE_SCHEMA);
    assert.equal(a.bundle.status, "preliminary");
    assert.match(a.bundle.note, /todavía no pasaron las evaluaciones/);
    assert.match(a.bundle.fingerprint, /^\d+\.\d+\.\d+\+[0-9a-f]{12}$/);
    assert.equal(a.bundle.markers.generated, GENERATED_MARK);
    assert.deepEqual(Object.keys(a.bundle.targets), TARGETS);
    for (const target of TARGETS)
      assert.deepEqual(
        a.bundle.targets[target],
        renderTarget(target).map(({ path, content, managed }) => ({
          path,
          content,
          ...(managed ? { managed: true } : {}),
        })),
      );
    assert.equal(a.bundle.targets.agents[0].managed, true);
    assert.equal(
      buildSkillsBundle({ evaluated: true }).bundle.status,
      "evaluated",
    );
  });

  test("public paths for manual download", () => {
    assert.equal(
      bundlePublicPath("claude", ".claude/skills/mirotaract-padron/SKILL.md"),
      "claude/skills/mirotaract-padron/SKILL.md",
    );
    assert.equal(
      bundlePublicPath("cursor", ".cursor/rules/x.mdc"),
      "cursor/rules/x.mdc",
    );
    assert.equal(
      bundlePublicPath("copilot", ".github/copilot-instructions.md"),
      "copilot/copilot-instructions.md",
    );
    assert.equal(bundlePublicPath("agents", "AGENTS.md"), "AGENTS.md");
  });
});
