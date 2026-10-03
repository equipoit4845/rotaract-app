/**
 * Optional mode: ask Claude (Anthropic API) to solve every task, with and
 * without the Mi Rotaract skills, grade both and report the difference.
 * Needs ANTHROPIC_API_KEY; the tests use an injected fake client.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";

import { fingerprint, loadChecklist, loadSkills, renderAgents } from "@mirotaract/ai-skills";

import { gradeSolution, loadTasks, summarize } from "./runner.js";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

const SYSTEM = `Sos un asistente de programación. Te paso un proyecto y una tarea. Resolvela modificando o agregando archivos.
Respondé SOLO con los archivos completos que cambian o se agregan, cada uno así:
<file path="ruta/relativa/al/proyecto">
contenido completo del archivo
</file>
No incluyas explicaciones fuera de los bloques <file>. No borres archivos.`;

function fixtureListing(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(`<file path="${relative(dir, path)}">\n${readFileSync(path, "utf8")}</file>`);
    }
  };
  walk(dir);
  return out.join("\n\n");
}

/** System + user messages for a task. */
export function buildPrompt(task, { withSkills }) {
  let system = SYSTEM;
  if (withSkills) {
    const skills = loadSkills().filter((s) => (task.skills ?? []).includes(s.name));
    system += `\n\nContexto del proyecto (AGENTS.md de Mi Rotaract):\n\n${renderAgents(skills.length ? skills : loadSkills(), loadChecklist())}`;
  }
  const user = `Tarea: ${task.prompt}\n\nProyecto actual:\n\n${fixtureListing(task.fixtureDir)}`;
  return { system, user };
}

/** `<file path="…">…</file>` blocks → [{ path, content }] (paths kept inside the project). */
export function parseFiles(text) {
  const files = [];
  for (const m of text.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)<\/file>/g)) {
    const path = normalize(m[1]).replace(/^(\.\/)+/, "");
    if (isAbsolute(path) || path.startsWith("..") || path.includes("node_modules")) continue;
    files.push({ path, content: m[2].replace(/^```[a-z]*\n([\s\S]*?)\n```\s*$/, "$1") });
  }
  return files;
}

export function writeSolution(task, files, dir) {
  mkdirSync(dir, { recursive: true });
  cpSync(task.fixtureDir, dir, { recursive: true });
  for (const f of files) {
    mkdirSync(dirname(join(dir, f.path)), { recursive: true });
    writeFileSync(join(dir, f.path), f.content);
  }
}

export async function createClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY: el modo generate llama a la API de Anthropic.");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey });
}

/** One completion; returns the text (throws on refusal). */
export async function complete(client, { model, system, user }) {
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error(`El modelo rechazó la tarea (${message.stop_details?.category ?? "sin categoría"}).`);
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

/** Generates and grades both variants; returns the comparison report. */
export async function generateAndCompare({ client, model = DEFAULT_MODEL, outDir, only, variants = ["with", "without"], log = () => {} }) {
  const tasks = loadTasks().filter((t) => !only || only.includes(t.id));
  const report = { model, skillsFingerprint: fingerprint(), createdAt: new Date().toISOString() };
  for (const variant of variants) {
    const results = [];
    for (const task of tasks) {
      const dir = join(outDir, `${variant}-skills`, task.id);
      log(`▸ ${task.id} (${variant === "with" ? "con" : "sin"} skills)…`);
      try {
        const text = await complete(client, { model, ...buildPrompt(task, { withSkills: variant === "with" }) });
        writeSolution(task, parseFiles(text), dir);
        writeFileSync(join(outDir, `${variant}-skills`, `${task.id}.response.txt`), text);
        results.push(await gradeSolution(task, dir));
      } catch (error) {
        results.push({ task: task.id, title: task.title, dir, score: 0, passed: false, error: error.message, criticalFailures: ["(error de generación)"], graders: [] });
      }
    }
    report[variant === "with" ? "withSkills" : "withoutSkills"] = summarize(results);
  }
  if (report.withSkills && report.withoutSkills) report.delta = report.withSkills.score - report.withoutSkills.score;
  return report;
}
