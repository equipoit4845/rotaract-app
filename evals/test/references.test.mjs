// The test of the graders: they pass every "good" reference solution and
// fail every "bad" one, on the expected checks.
import assert from "node:assert/strict";
import { test } from "node:test";

import { gradeReferences, loadTasks } from "../src/runner.js";

test("the four real tasks exist, each with good and bad references", () => {
  const tasks = loadTasks();
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["login-nextjs", "manifiesto-modulo", "padron-club", "webhooks-altas"],
  );
  for (const t of tasks) {
    const refs = Object.entries(t.references);
    assert.ok(
      refs.some(([, r]) => r.expect === "pass"),
      `${t.id} good`,
    );
    assert.ok(
      refs.some(([, r]) => r.expect === "fail"),
      `${t.id} bad`,
    );
    assert.ok(t.prompt.length > 80);
  }
});

test("graders pass the good references and fail the bad ones", async () => {
  const refs = await gradeReferences({ env: {} });
  assert.equal(refs.length, 10);
  for (const r of refs)
    assert.ok(r.ok, `${r.task}/${r.reference}: ${r.problems.join("; ")}`);
  for (const r of refs.filter((x) => x.expect === "pass"))
    assert.equal(r.result.score, 1, `${r.task}/${r.reference}`);
  for (const r of refs.filter((x) => x.expect === "fail")) {
    assert.ok(
      r.result.score < 0.9,
      `${r.task}/${r.reference} score ${r.result.score}`,
    );
    assert.ok(r.result.criticalFailures.length > 0);
  }
});
