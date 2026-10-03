import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { fingerprint } from "@mirotaract/ai-skills";

import { evaluateGate, readReport } from "./gate.js";
import { buildPrompt, createClient, DEFAULT_MODEL, generateAndCompare } from "./generate.js";
import { DEFAULT_THRESHOLD, EVALS_DIR, findTask, formatResult, gradeReferences, gradeRun, gradeSolution, loadTasks, summarize } from "./runner.js";

export const LATEST = join(EVALS_DIR, "results/latest.json");

const HELP = `Evals de las skills de IA de Mi Rotaract

  evals list                                        Tareas disponibles
  evals fixture --task <id> --to <carpeta>          Copia el proyecto inicial para resolverlo con cualquier asistente
  evals prompt --task <id> [--with-skills]          Muestra el prompt de la tarea
  evals run --task <id> --solution <carpeta>        Califica una solución
  evals run --solutions <carpeta>                   Califica <carpeta>/<tarea>/ para todas las tareas
  evals references                                  Califica las soluciones de referencia (buenas y malas)
  evals generate [--model ${DEFAULT_MODEL}] [--out <carpeta>] [--tasks a,b]
                                                    Genera soluciones con Claude con y sin skills (ANTHROPIC_API_KEY)
  evals gate [--results <archivo>] [--threshold 0.9] Gate de publicación de las skills

Opciones comunes: --json (salida JSON), --out <archivo> (guarda el reporte).
Kernel local opcional para el grader kernel-scopes: MIROTARACT_EVAL_KERNEL_URL=http://localhost:54321/api/kernel/v1
`;

function save(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

export async function main(argv, { out = process.stdout, err = process.stderr, env = process.env } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      task: { type: "string" },
      tasks: { type: "string" },
      solution: { type: "string" },
      solutions: { type: "string" },
      to: { type: "string" },
      out: { type: "string" },
      results: { type: "string" },
      threshold: { type: "string" },
      model: { type: "string" },
      json: { type: "boolean" },
      "with-skills": { type: "boolean" },
      "allow-stale": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command] = positionals;
  const print = (report, text) => out.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${text}\n`);
  try {
    switch (command) {
      case "list":
        for (const t of loadTasks()) out.write(`${t.id.padEnd(20)} ${t.title}\n`);
        return 0;
      case "fixture": {
        const task = findTask(values.task);
        const to = resolve(values.to ?? task.id);
        cpSync(task.fixtureDir, to, { recursive: true });
        out.write(`Proyecto inicial de ${task.id} en ${to}.\nPrompt:\n\n${task.prompt}\n\nDespués: evals run --task ${task.id} --solution ${to}\n`);
        return 0;
      }
      case "prompt": {
        const { system, user } = buildPrompt(findTask(values.task), { withSkills: values["with-skills"] });
        out.write(values["with-skills"] ? `${system}\n\n---\n\n${user}\n` : `${user}\n`);
        return 0;
      }
      case "run": {
        let report;
        if (values.solution) {
          const result = await gradeSolution(findTask(values.task), resolve(values.solution), { env });
          report = { ...summarize([result]), skillsFingerprint: fingerprint() };
        } else if (values.solutions) report = { ...(await gradeRun(resolve(values.solutions), { env, only: values.tasks?.split(",") })), skillsFingerprint: fingerprint() };
        else throw new Error("Pasá --task y --solution, o --solutions.");
        if (values.out) save(resolve(values.out), report);
        print(report, `${report.results.map(formatResult).join("\n\n")}\n\nPuntaje: ${(report.score * 100).toFixed(1)} % · ${report.passed}/${report.total} tareas sin fallas.`);
        return report.criticalFailures ? 1 : 0;
      }
      case "references": {
        const refs = await gradeReferences({ env });
        print(
          refs.map(({ result, ...r }) => ({ ...r, score: result.score, failed: result.graders.filter((g) => g.status === "fail").map((g) => g.id) })),
          refs.map((r) => `${r.ok ? "✔" : "✖"} ${r.task}/${r.reference} (esperado: ${r.expect}) → ${(r.result.score * 100).toFixed(0)} %${r.problems.length ? `\n    ${r.problems.join("\n    ")}` : ""}`).join("\n"),
        );
        return refs.every((r) => r.ok) ? 0 : 1;
      }
      case "generate": {
        const client = await createClient(env.ANTHROPIC_API_KEY);
        const outDir = resolve(values.out ?? join(EVALS_DIR, "results", new Date().toISOString().replace(/[:.]/g, "-")));
        const report = await generateAndCompare({ client, model: values.model ?? DEFAULT_MODEL, outDir, only: values.tasks?.split(","), log: (l) => err.write(`${l}\n`) });
        save(join(outDir, "report.json"), report);
        save(LATEST, report);
        print(
          report,
          [
            `Modelo: ${report.model} · skills ${report.skillsFingerprint}`,
            `Con skills:  ${(report.withSkills.score * 100).toFixed(1)} %`,
            `Sin skills:  ${(report.withoutSkills.score * 100).toFixed(1)} %`,
            `Diferencia:  ${report.delta >= 0 ? "+" : ""}${(report.delta * 100).toFixed(1)} puntos`,
            `Reporte: ${join(outDir, "report.json")} (y ${LATEST})`,
          ].join("\n"),
        );
        return 0;
      }
      case "gate": {
        const path = resolve(values.results ?? LATEST);
        const report = readReport(path);
        const threshold = Number(values.threshold ?? env.EVALS_THRESHOLD ?? DEFAULT_THRESHOLD);
        if (!report) {
          err.write(`Gate: no hay resultados en ${path}. Corré \`evals generate\` (con ANTHROPIC_API_KEY) o \`evals run --solutions … --out ${path}\` con soluciones hechas con las skills actuales.\n`);
          return 1;
        }
        const gate = evaluateGate(report, { threshold, currentFingerprint: values["allow-stale"] ? undefined : fingerprint() });
        print(gate, gate.ok ? `Gate OK: ${(gate.score * 100).toFixed(1)} % ≥ ${(threshold * 100).toFixed(0)} %. Las skills se pueden publicar.` : `Gate RECHAZADO:\n  ${gate.reasons.join("\n  ")}`);
        return gate.ok ? 0 : 1;
      }
      default:
        out.write(HELP);
        return command || values.help ? (values.help ? 0 : 1) : 1;
    }
  } catch (error) {
    err.write(`Error: ${error.message}\n`);
    return 1;
  }
}
