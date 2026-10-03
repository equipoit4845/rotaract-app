import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { fingerprint } from "@mirotaract/ai-skills";

import { main } from "../src/cli.js";
import { evaluateGate } from "../src/gate.js";
import { buildPrompt, generateAndCompare, parseFiles } from "../src/generate.js";
import { findTask, gradeRun, loadTasks } from "../src/runner.js";

const tmp = () => mkdtempSync(join(tmpdir(), "eval-r-"));
const sink = () => {
  let text = "";
  return { write: (c) => (text += c), get text() { return text; } };
};

describe("runner", () => {
  test("gradeRun grades <dir>/<task>/ and scores missing tasks as 0", async () => {
    const root = tmp();
    cpSync(join(findTask("manifiesto-modulo").dir, "reference/good"), join(root, "manifiesto-modulo"), { recursive: true });
    const report = await gradeRun(root, { env: {} });
    assert.equal(report.total, 4);
    assert.equal(report.results.find((r) => r.task === "manifiesto-modulo").score, 1);
    assert.equal(report.results.find((r) => r.task === "login-nextjs").missing, true);
    assert.equal(report.score, 0.25);
  });
});

describe("gate", () => {
  const run = (score, critical = []) => ({ score, results: [{ task: "t", score, criticalFailures: critical }] });
  test("threshold, critical failures, fingerprint", () => {
    assert.equal(evaluateGate(run(0.95)).ok, true);
    assert.equal(evaluateGate(run(0.85)).ok, false);
    assert.equal(evaluateGate(run(0.85), { threshold: 0.8 }).ok, true);
    assert.equal(evaluateGate(run(0.95, ["no-client-secrets"])).ok, false);
    assert.equal(evaluateGate({ withSkills: run(1), withoutSkills: run(0.2), skillsFingerprint: "a" }, { currentFingerprint: "a" }).ok, true);
    const stale = evaluateGate({ ...run(1), skillsFingerprint: "old" }, { currentFingerprint: "new" });
    assert.equal(stale.ok, false);
    assert.match(stale.reasons[0], /no corresponden a las skills actuales/);
    assert.equal(evaluateGate({ nope: 1 }).ok, false);
  });

  test("CLI gate: missing results fail; passing results with the current fingerprint pass", async () => {
    const dir = tmp();
    const err = sink();
    assert.equal(await main(["gate", "--results", join(dir, "none.json")], { out: sink(), err }), 1);
    assert.match(err.text, /no hay resultados/);
    const file = join(dir, "r.json");
    writeFileSync(file, JSON.stringify({ ...run(0.92), skillsFingerprint: fingerprint() }));
    const out = sink();
    assert.equal(await main(["gate", "--results", file], { out, err: sink() }), 0);
    assert.match(out.text, /Gate OK/);
    assert.equal(await main(["gate", "--results", file, "--threshold", "0.95"], { out: sink(), err: sink() }), 1);
  });
});

describe("generate (fake Anthropic client)", () => {
  test("parseFiles keeps paths inside the project", () => {
    const files = parseFiles('<file path="src/a.ts">\nA\n</file>\n<file path="../evil">x</file><file path="/etc/passwd">x</file><file path="./b.ts">```ts\nB\n```</file>');
    assert.deepEqual(files, [{ path: "src/a.ts", content: "A\n" }, { path: "b.ts", content: "B" }]);
  });

  test("prompts with and without skills", () => {
    const task = findTask("webhooks-altas");
    const withSkills = buildPrompt(task, { withSkills: true });
    const without = buildPrompt(task, { withSkills: false });
    assert.match(withSkills.system, /Recibir webhooks de Mi Rotaract/);
    assert.match(withSkills.system, /Checklist de seguridad/);
    assert.doesNotMatch(without.system, /Checklist de seguridad/);
    assert.match(without.user, /src\/lib\/bienvenidas\.ts/);
  });

  test("generateAndCompare grades both variants and reports the difference", async () => {
    const good = readFileSync(join(findTask("manifiesto-modulo").dir, "reference/good/mirotaract.module.json"), "utf8");
    const bad = readFileSync(join(findTask("manifiesto-modulo").dir, "reference/bad/mirotaract.module.json"), "utf8");
    const calls = [];
    const client = {
      beta: {
        messages: {
          stream(params) {
            calls.push(params);
            const withSkills = params.system.includes("Checklist de seguridad");
            const text = `<file path="mirotaract.module.json">\n${withSkills ? good : bad}</file>`;
            return { finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text }] }) };
          },
        },
      },
    };
    const outDir = tmp();
    const report = await generateAndCompare({ client, outDir, only: ["manifiesto-modulo"] });
    assert.equal(calls[0].model, "claude-sonnet-5-5");
    assert.equal(report.withSkills.score, 1);
    assert.equal(report.withoutSkills.score, 0);
    assert.equal(report.delta, 1);
    assert.equal(report.skillsFingerprint, fingerprint());
    assert.ok(existsSync(join(outDir, "with-skills/manifiesto-modulo/mirotaract.module.json")));
    assert.ok(existsSync(join(outDir, "with-skills/manifiesto-modulo/package.json"))); // fixture copied
    assert.equal(evaluateGate(report, { currentFingerprint: fingerprint() }).ok, true);
  });

  test("a refusal is recorded as a failed task, not a crash", async () => {
    const client = { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }) }) } } };
    const report = await generateAndCompare({ client, outDir: tmp(), only: ["manifiesto-modulo"], variants: ["with"] });
    assert.equal(report.withSkills.score, 0);
    assert.match(report.withSkills.results[0].error, /rechazó/);
  });

  test("CLI generate without a key explains what is missing", async () => {
    const err = sink();
    assert.equal(await main(["generate"], { out: sink(), err, env: {} }), 1);
    assert.match(err.text, /ANTHROPIC_API_KEY/);
  });
});

describe("CLI", () => {
  test("list, prompt, fixture and run", async () => {
    const out = sink();
    await main(["list"], { out });
    for (const t of loadTasks()) assert.match(out.text, new RegExp(t.id));
    const prompt = sink();
    await main(["prompt", "--task", "padron-club"], { out: prompt });
    assert.match(prompt.text, /padrón del club/);
    const to = join(tmp(), "intento");
    await main(["fixture", "--task", "padron-club", "--to", to], { out: sink() });
    assert.ok(existsSync(join(to, "app/main.py")));
    const run = sink();
    const code = await main(["run", "--task", "padron-club", "--solution", to, "--json"], { out: run, err: sink(), env: {} });
    const report = JSON.parse(run.text);
    assert.equal(report.results[0].task, "padron-club");
    assert.ok(report.results[0].score < 1); // the untouched fixture doesn't solve the task
    assert.equal(code, report.criticalFailures ? 1 : 0);
  });
});
