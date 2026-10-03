/**
 * Eval runner: grades any solution directory (whatever assistant produced
 * it) against a task's graders. Score = weight of passing graders / weight
 * of graders that ran (skipped ones don't count).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readSolution } from "./files.js";
import { GRADERS } from "./graders/index.js";

export const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TASKS_DIR = join(EVALS_DIR, "tasks");
export const DEFAULT_THRESHOLD = 0.9;

export function loadTasks(dir = TASKS_DIR) {
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "task.json")))
    .sort()
    .map((d) => {
      const task = JSON.parse(readFileSync(join(dir, d, "task.json"), "utf8"));
      for (const g of task.graders)
        if (!GRADERS[g.id])
          throw new Error(`${d}/task.json: grader desconocido ${g.id}`);
      return {
        ...task,
        dir: join(dir, d),
        fixtureDir: join(dir, d, task.fixture ?? "fixture"),
      };
    });
}

export function findTask(id, tasks = loadTasks()) {
  const task = tasks.find((t) => t.id === id);
  if (!task)
    throw new Error(
      `No existe la tarea "${id}". Tareas: ${tasks.map((t) => t.id).join(", ")}.`,
    );
  return task;
}

let catalogPromise;
async function eventCatalog() {
  catalogPromise ??= import("@mirotaract/mcp/bundle").then(
    async ({ loadBundle }) => (await loadBundle()).events,
  );
  return catalogPromise;
}

export async function gradeSolution(task, dir, { env = process.env } = {}) {
  const solution = readSolution(dir);
  const catalog = task.graders.some((g) => g.id === "manifest-valid")
    ? await eventCatalog()
    : null;
  const graders = [];
  for (const spec of task.graders) {
    const grader = GRADERS[spec.id];
    let result;
    try {
      result = await grader.grade({
        solution,
        task,
        options: spec.options ?? {},
        env,
        catalog,
      });
    } catch (error) {
      result = {
        status: "fail",
        details: [`El grader falló: ${error.message}`],
      };
    }
    graders.push({
      id: grader.id,
      title: grader.title,
      critical: grader.critical,
      weight: spec.weight ?? 1,
      ...result,
    });
  }
  const ran = graders.filter((g) => g.status !== "skip");
  const total = ran.reduce((n, g) => n + g.weight, 0);
  const passed = ran
    .filter((g) => g.status === "pass")
    .reduce((n, g) => n + g.weight, 0);
  return {
    task: task.id,
    title: task.title,
    dir,
    score: total ? passed / total : 0,
    passed: ran.length > 0 && ran.every((g) => g.status === "pass"),
    criticalFailures: ran
      .filter((g) => g.critical && g.status === "fail")
      .map((g) => g.id),
    graders,
  };
}

/** `root/<taskId>/` for every task present (missing tasks score 0). */
export async function gradeRun(root, { env, tasks = loadTasks(), only } = {}) {
  const results = [];
  for (const task of tasks.filter((t) => !only || only.includes(t.id))) {
    const dir = join(root, task.id);
    if (!existsSync(dir)) {
      results.push({
        task: task.id,
        title: task.title,
        dir,
        score: 0,
        passed: false,
        missing: true,
        criticalFailures: ["(sin solución)"],
        graders: [],
      });
      continue;
    }
    results.push(await gradeSolution(task, dir, { env }));
  }
  return summarize(results);
}

export function summarize(results) {
  const score = results.length
    ? results.reduce((n, r) => n + r.score, 0) / results.length
    : 0;
  return {
    score,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    criticalFailures: results.reduce(
      (n, r) => n + r.criticalFailures.length,
      0,
    ),
    results,
  };
}

/** The test of the graders: every reference solution meets its expectation. */
export async function gradeReferences({ env, tasks = loadTasks() } = {}) {
  const out = [];
  for (const task of tasks)
    for (const [name, expectation] of Object.entries(task.references ?? {})) {
      const result = await gradeSolution(
        task,
        join(task.dir, "reference", name),
        { env },
      );
      const failed = result.graders
        .filter((g) => g.status === "fail")
        .map((g) => g.id);
      const problems = [];
      if (expectation.expect === "pass" && !result.passed)
        problems.push(`debería pasar y falló: ${failed.join(", ")}`);
      if (expectation.expect === "fail") {
        if (result.passed) problems.push("debería fallar y pasó");
        for (const id of expectation.mustFail ?? [])
          if (!failed.includes(id)) problems.push(`debería fallar ${id}`);
      }
      for (const id of expectation.mustRun ?? [])
        if (result.graders.find((g) => g.id === id)?.status === "skip")
          problems.push(`${id} no se ejecutó`);
      out.push({
        task: task.id,
        reference: name,
        expect: expectation.expect,
        ok: problems.length === 0,
        problems,
        result,
      });
    }
  return out;
}

export function formatResult(result) {
  const lines = [
    `${result.passed ? "✔" : "✖"} ${result.task} — ${(result.score * 100).toFixed(0)} % (${result.title})`,
  ];
  if (result.missing) lines.push("    sin solución");
  for (const g of result.graders) {
    lines.push(
      `    ${g.status === "pass" ? "✔" : g.status === "skip" ? "–" : "✖"} ${g.id}${g.critical ? " (crítico)" : ""}: ${g.details[0] ?? ""}`,
    );
    if (g.status === "fail")
      for (const d of g.details.slice(1, 6)) lines.push(`        ${d}`);
  }
  return lines.join("\n");
}
