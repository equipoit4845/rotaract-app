import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { run } from "../src/cli.js";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

describe("mirotaract init --ai", () => {
  test("drops the AI skills next to the template, keeping its AGENTS.md", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-init-ai-"));
    const out = sink();
    const code = await run(["init", "app", "--template", "next", "--ai", "claude,agents"], {
      cwd,
      env: {},
      out,
      err: sink(),
    });
    assert.equal(code, 0);
    assert.ok(existsSync(join(cwd, "app/.claude/skills/mirotaract-ingresar/SKILL.md")));
    const agents = readFileSync(join(cwd, "app/AGENTS.md"), "utf8");
    assert.match(agents, /^# AGENTS\.md — contexto para asistentes de IA/); // template text kept
    assert.match(agents, /mirotaract-ai-skills:begin/);
    assert.match(out.text, /Skills de IA \(claude, agents\)/);
  });

  test("rejects an unknown target with a clear error", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-init-ai-"));
    const err = sink();
    assert.equal(await run(["init", "app", "--ai", "vim"], { cwd, env: {}, out: sink(), err }), 1);
    assert.match(err.text, /Destino desconocido: vim/);
  });
});
