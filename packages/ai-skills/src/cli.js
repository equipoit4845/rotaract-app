import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  buildAll,
  install,
  loadChecklist,
  loadPrompts,
  loadSkills,
  parseTargets,
  renderTarget,
  SkillError,
  TARGETS,
  VERSION,
} from "./index.js";

const HELP = `Skills de IA de Mi Rotaract ${VERSION}

Uso:
  npx @mirotaract/ai-skills install --target claude|cursor|copilot|agents|all [carpeta]
  npx @mirotaract/ai-skills list
  npx @mirotaract/ai-skills show <skill> [--target claude]
  npx @mirotaract/ai-skills prompts [nombre]
  npx @mirotaract/ai-skills build [--out dist]

Opciones de install:
  -t, --target <a,b>   ${TARGETS.join(", ")} o all (se pueden combinar con comas)
  -s, --skills <a,b>   Solo estas skills (por defecto, todas)
      --force          Pisar archivos con el mismo nombre que no generó este paquete
      --dry-run        Mostrar qué haría sin escribir nada

Destinos:
  claude   .claude/skills/<skill>/SKILL.md
  cursor   .cursor/rules/<skill>.mdc (+ mirotaract-seguridad.mdc, siempre activa)
  copilot  .github/copilot-instructions.md (bloque propio) + .github/instructions/*.instructions.md
  agents   AGENTS.md (bloque propio; respeta el resto del archivo)
`;

export function main(argv, { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t" },
      skills: { type: "string", short: "s" },
      force: { type: "boolean" },
      "dry-run": { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) return out.write(`${VERSION}\n`), 0;
  if (values.help || !command) return out.write(HELP), command || values.help ? 0 : 1;
  try {
    switch (command) {
      case "install": {
        const targets = parseTargets(values.target);
        const dir = resolve(cwd, rest[0] ?? ".");
        const only = values.skills?.split(",").map((s) => s.trim()).filter(Boolean);
        const results = install({ targets, dir, skills: only, force: values.force, dryRun: values["dry-run"] });
        const labels = { created: "creado", updated: "actualizado", merged: "agregado al archivo existente", unchanged: "sin cambios", skipped: "OMITIDO (no lo generó este paquete; --force para pisarlo)" };
        for (const r of results) out.write(`${values["dry-run"] ? "[simulación] " : ""}${r.path}: ${labels[r.action]}\n`);
        out.write(`\nListo: ${targets.join(", ")} en ${dir}. Cada skill termina con el checklist de seguridad.\n`);
        return results.some((r) => r.action === "skipped") ? 2 : 0;
      }
      case "list":
        for (const s of loadSkills()) out.write(`${s.name.padEnd(26)} ${s.title}\n`);
        return 0;
      case "show": {
        const name = rest[0];
        if (!name) throw new SkillError("Falta el nombre de la skill (ver `list`).");
        const target = parseTargets(values.target ?? "claude")[0];
        const files = renderTarget(target, { only: [name] }).filter((f) => !f.managed || target === "agents");
        out.write(files.map((f) => f.content).join("\n"));
        return 0;
      }
      case "prompts": {
        const prompts = loadPrompts();
        if (!rest[0]) {
          for (const p of prompts) out.write(`${p.name.padEnd(26)} ${p.title}\n`);
          return 0;
        }
        const prompt = prompts.find((p) => p.name === rest[0]);
        if (!prompt) throw new SkillError(`No hay una plantilla "${rest[0]}".`);
        out.write(`# ${prompt.title}\n\n${prompt.body}\n`);
        return 0;
      }
      case "build": {
        loadChecklist();
        const files = buildAll(resolve(cwd, values.out ?? "dist"));
        out.write(`${files.length} archivos en ${resolve(cwd, values.out ?? "dist")}\n`);
        return 0;
      }
      default:
        throw new SkillError(`Comando desconocido: ${command}\n\n${HELP}`);
    }
  } catch (error) {
    if (error instanceof SkillError) {
      err.write(`Error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
