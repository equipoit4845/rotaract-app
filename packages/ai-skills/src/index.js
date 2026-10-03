/**
 * @mirotaract/ai-skills — one source (skills-src/*.md, Markdown + YAML
 * frontmatter, plus the shared _checklist.md) rendered for every assistant:
 *
 * - claude:  .claude/skills/<name>/SKILL.md          (Claude Code skills)
 * - cursor:  .cursor/rules/<name>.mdc                (Cursor project rules)
 * - copilot: .github/copilot-instructions.md + .github/instructions/<name>.instructions.md
 * - agents:  AGENTS.md                               (generic, any agent)
 *
 * Rendering is pure and deterministic; `install` writes into a project
 * without clobbering files the user wrote (AGENTS.md and
 * copilot-instructions.md get a managed block).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILLS_DIR = join(PACKAGE_DIR, "skills-src");
export const PROMPTS_DIR = join(PACKAGE_DIR, "prompts");
export const VERSION = JSON.parse(
  readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"),
).version;
export const TARGETS = ["claude", "cursor", "copilot", "agents"];
export const GENERATED_MARK = "Generado por @mirotaract/ai-skills";
export const BLOCK_BEGIN = "<!-- mirotaract-ai-skills:begin -->";
export const BLOCK_END = "<!-- mirotaract-ai-skills:end -->";

export class SkillError extends Error {}

/** `---\nyaml\n---\nbody` → { data, body }. */
export function parseFrontmatter(text, file = "") {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new SkillError(`${file}: falta el frontmatter YAML`);
  return { data: parseYaml(match[1]) ?? {}, body: match[2] };
}

/** Claude Code constraints (name ≤ 64, lowercase/digits/hyphens; description ≤ 1024, no XML tags). */
export function validateSkill(skill) {
  const errors = [];
  if (
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.name ?? "") ||
    skill.name.length > 64
  )
    errors.push("name: minúsculas, números y guiones, hasta 64 caracteres");
  if (typeof skill.description !== "string" || !skill.description.trim())
    errors.push("description: obligatoria");
  else {
    if (skill.description.length > 1024)
      errors.push("description: hasta 1024 caracteres");
    if (/[<>]/.test(skill.description)) errors.push("description: sin < ni >");
  }
  if (typeof skill.title !== "string" || !skill.title.trim())
    errors.push("title: obligatorio");
  if (
    !Array.isArray(skill.globs) ||
    skill.globs.some((g) => typeof g !== "string")
  )
    errors.push("globs: lista de strings");
  if (!skill.body.trim()) errors.push("cuerpo vacío");
  if (/^## Checklist de seguridad/m.test(skill.body))
    errors.push(
      "el checklist se agrega solo (skills-src/_checklist.md); no lo repitas",
    );
  return errors;
}

export function loadChecklist(dir = SKILLS_DIR) {
  return readFileSync(join(dir, "_checklist.md"), "utf8").trim();
}

/** Every skill in `dir` (files not starting with `_`), sorted by name. */
export function loadSkills(dir = SKILLS_DIR) {
  const skills = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(
        readFileSync(join(dir, file), "utf8"),
        file,
      );
      const skill = {
        file,
        name: data.name,
        title: data.title,
        description:
          typeof data.description === "string"
            ? data.description.replace(/\s+/g, " ").trim()
            : data.description,
        globs: data.globs ?? [],
        alwaysApply: Boolean(data.alwaysApply),
        body: body.trim(),
      };
      const errors = validateSkill(skill);
      if (errors.length) throw new SkillError(`${file}: ${errors.join("; ")}`);
      return skill;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set();
  for (const skill of skills) {
    if (names.has(skill.name))
      throw new SkillError(`nombre repetido: ${skill.name}`);
    names.add(skill.name);
  }
  return skills;
}

/** `**\/*.{ts,tsx}` → [`**\/*.ts`, `**\/*.tsx`] (Cursor and Copilot split globs on commas). */
export function expandBraces(glob) {
  const match = glob.match(/^(.*?)\{([^{}]+)\}(.*)$/);
  if (!match) return [glob];
  return match[2]
    .split(",")
    .flatMap((alt) => expandBraces(`${match[1]}${alt}${match[3]}`));
}

function flatGlobs(skill) {
  return [...new Set(skill.globs.flatMap(expandBraces))];
}

function mark(source) {
  return `<!-- ${GENERATED_MARK} ${VERSION} desde ${source}. No lo edites a mano: se regenera con "mirotaract ai install" (o "npx @mirotaract/ai-skills install"). -->`;
}

/** Skill body + the shared checklist: what every per-skill file contains. */
export function skillDocument(skill, checklist) {
  return `# ${skill.title}\n\n${skill.body}\n\n${checklist}\n`;
}

function yamlString(value) {
  return JSON.stringify(value);
}

export function renderClaude(skill, checklist) {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${yamlString(skill.description)}`,
    "---",
    "",
    mark(`skills-src/${skill.file}`),
    "",
    skillDocument(skill, checklist),
  ].join("\n");
}

export function renderCursor(skill, checklist) {
  return [
    "---",
    `description: ${yamlString(skill.description)}`,
    `globs: ${flatGlobs(skill).join(",")}`,
    `alwaysApply: ${skill.alwaysApply}`,
    "---",
    "",
    mark(`skills-src/${skill.file}`),
    "",
    skillDocument(skill, checklist),
  ].join("\n");
}

export function renderCursorSecurity(checklist) {
  return [
    "---",
    "description: Checklist de seguridad de Mi Rotaract para todo el código que se integra con el kernel.",
    "globs: ",
    "alwaysApply: true",
    "---",
    "",
    mark("skills-src/_checklist.md"),
    "",
    "# Mi Rotaract: seguridad",
    "",
    "Esta app se integra con Mi Rotaract (kernel institucional del Distrito",
    "Rotaract 4845). Aplicá siempre:",
    "",
    checklist,
    "",
  ].join("\n");
}

export function renderCopilotInstruction(skill, checklist) {
  return [
    "---",
    `applyTo: ${yamlString(flatGlobs(skill).join(","))}`,
    `description: ${yamlString(skill.description)}`,
    "---",
    "",
    mark(`skills-src/${skill.file}`),
    "",
    skillDocument(skill, checklist),
  ].join("\n");
}

const CONTEXT = [
  "Esta app se integra con **Mi Rotaract**, el sistema institucional del Distrito",
  "Rotaract 4845. Su **kernel** es la única fuente de verdad de personas, clubes,",
  "membresías, períodos, cargos y autoridades: la app consulta esos datos por la",
  "API, nunca los copia para corregirlos ni se conecta a su base de datos.",
  "",
  "- API = issuer OIDC: `https://api.rotaract4845.com/api/kernel/v1` (local:",
  "  `http://localhost:54321/api/kernel/v1` con `mirotaract dev`).",
  "- SDKs oficiales: `@mirotaract/sdk` (TS/JS) y `mirotaract` (Python). Usalos en",
  "  vez de reimplementar OAuth, paginación o la verificación de firmas.",
  "- Documentación: `docs/developers/*.md` del repo del kernel,",
  "  `https://developers.rotaract4845.com/llms.txt` y el servidor MCP",
  "  `@mirotaract/mcp` (`search_docs`, `describe_operation`, `list_permissions`,",
  "  `list_events`, `validate_module_manifest`, `generate_types`).",
];

export function renderCopilotRoot(skills, checklist) {
  return [
    BLOCK_BEGIN,
    mark("skills-src"),
    "",
    "# Mi Rotaract",
    "",
    ...CONTEXT,
    "",
    "Instrucciones por tarea en `.github/instructions/`:",
    "",
    ...skills.map((s) => `- \`${s.name}.instructions.md\`: ${s.title}.`),
    "",
    checklist,
    BLOCK_END,
    "",
  ].join("\n");
}

/** Skill headings one level down so they nest under `## <title>`. */
function demote(markdown) {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^```/.test(line)) fenced = !fenced;
      return !fenced && /^#{1,5} /.test(line) ? `#${line}` : line;
    })
    .join("\n");
}

export function renderAgents(skills, checklist) {
  return [
    BLOCK_BEGIN,
    mark("skills-src"),
    "",
    "# Mi Rotaract: guía para asistentes de IA",
    "",
    ...CONTEXT,
    "",
    "## Tareas",
    "",
    ...skills.map((s) => `- **${s.title}** (\`${s.name}\`): ${s.description}`),
    "",
    ...skills.flatMap((s) => [
      `## ${s.title}`,
      "",
      `<!-- skill: ${s.name} -->`,
      "",
      demote(s.body),
      "",
    ]),
    demote(checklist),
    BLOCK_END,
    "",
  ].join("\n");
}

/**
 * Files of a target, relative to the project root. `managed: true` means the
 * content is a block merged into a file that may have the user's own text.
 */
export function renderTarget(
  target,
  { skills = loadSkills(), checklist = loadChecklist(), only } = {},
) {
  const chosen = only?.length
    ? skills.filter((s) => only.includes(s.name))
    : skills;
  if (only?.length) {
    const unknown = only.filter((name) => !skills.some((s) => s.name === name));
    if (unknown.length)
      throw new SkillError(`No conozco las skills: ${unknown.join(", ")}`);
  }
  switch (target) {
    case "claude":
      return chosen.map((s) => ({
        path: `.claude/skills/${s.name}/SKILL.md`,
        content: renderClaude(s, checklist),
      }));
    case "cursor":
      return [
        ...chosen.map((s) => ({
          path: `.cursor/rules/${s.name}.mdc`,
          content: renderCursor(s, checklist),
        })),
        {
          path: ".cursor/rules/mirotaract-seguridad.mdc",
          content: renderCursorSecurity(checklist),
        },
      ];
    case "copilot":
      return [
        {
          path: ".github/copilot-instructions.md",
          content: renderCopilotRoot(chosen, checklist),
          managed: true,
        },
        ...chosen.map((s) => ({
          path: `.github/instructions/${s.name}.instructions.md`,
          content: renderCopilotInstruction(s, checklist),
        })),
      ];
    case "agents":
      return [
        {
          path: "AGENTS.md",
          content: renderAgents(chosen, checklist),
          managed: true,
        },
      ];
    default:
      throw new SkillError(
        `Destino desconocido: ${target}. Usá ${TARGETS.join(", ")} o all.`,
      );
  }
}

/** Replaces (or appends) our managed block, keeping the user's text. */
export function mergeManagedBlock(existing, block) {
  const begin = existing.indexOf(BLOCK_BEGIN);
  const end = existing.indexOf(BLOCK_END);
  if (begin >= 0 && end > begin) {
    const after = existing.slice(end + BLOCK_END.length).replace(/^\r?\n/, "");
    return `${existing.slice(0, begin)}${block.trimEnd()}\n${after}`;
  }
  const separator =
    existing.length && !existing.endsWith("\n\n")
      ? existing.endsWith("\n")
        ? "\n"
        : "\n\n"
      : "";
  return `${existing}${separator}${block}`;
}

export function parseTargets(value) {
  const list = String(value ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length)
    throw new SkillError(`Falta --target (${TARGETS.join(", ")} o all).`);
  if (list.includes("all")) return [...TARGETS];
  for (const t of list)
    if (!TARGETS.includes(t))
      throw new SkillError(
        `Destino desconocido: ${t}. Usá ${TARGETS.join(", ")} o all.`,
      );
  return [...new Set(list)];
}

/**
 * Writes the target's files into `dir`. Never overwrites a file we didn't
 * generate unless `force`. Returns [{ path, action }] with action
 * created | updated | unchanged | merged | skipped.
 */
export function install({
  targets,
  dir = process.cwd(),
  skills: only,
  force = false,
  dryRun = false,
  sources,
} = {}) {
  const results = [];
  for (const target of targets) {
    for (const file of renderTarget(target, { ...(sources ?? {}), only })) {
      const destination = join(dir, file.path);
      const exists = existsSync(destination);
      const current = exists ? readFileSync(destination, "utf8") : null;
      let next = file.content;
      let action;
      if (file.managed && exists) {
        next = mergeManagedBlock(current, file.content);
        action = current.includes(BLOCK_BEGIN) ? "updated" : "merged";
      } else if (exists && !current.includes(GENERATED_MARK) && !force) {
        results.push({ target, path: file.path, action: "skipped" });
        continue;
      } else action = exists ? "updated" : "created";
      if (current === next) action = "unchanged";
      if (!dryRun && action !== "unchanged") {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, next);
      }
      results.push({ target, path: file.path, action });
    }
  }
  return results;
}

/** Writes every target under `outDir/<target>/…` (the release artifact). */
export function buildAll(outDir) {
  const written = [];
  for (const target of TARGETS)
    for (const file of renderTarget(target)) {
      const destination = join(outDir, target, file.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.content);
      written.push(relative(outDir, destination));
    }
  return written.sort();
}

/** Content hash of the skill sources: ties eval results to an exact skills version. */
export function fingerprint(dir = SKILLS_DIR) {
  const hash = createHash("sha256");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort())
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(join(dir, file)))
      .update("\0");
  return `${VERSION}+${hash.digest("hex").slice(0, 12)}`;
}

/** Prompt templates for committees without developers (E10.5). Files starting with `_` are not templates (master prompt, ideas). */
export function loadPrompts(dir = PROMPTS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map((file) => {
      const { data, body } = parseFrontmatter(
        readFileSync(join(dir, file), "utf8"),
        file,
      );
      return {
        file,
        name: file.replace(/\.md$/, ""),
        title: data.title,
        description: data.description,
        template: data.template,
        body: body.trim(),
      };
    });
}

/* ------------------------------------------------------------------------ */
/* "Creá tu solución con IA": master prompt, ideas and the skills bundle.    */
/* ------------------------------------------------------------------------ */

/** prompts/_master.md: the canonical master prompt (see src/master-prompt.js). */
export function loadMasterTemplate(dir = PROMPTS_DIR) {
  return readFileSync(join(dir, "_master.md"), "utf8");
}

/** prompts/_planning.md: the short planning prompt for chat-only assistants. */
export function loadPlanningTemplate(dir = PROMPTS_DIR) {
  return readFileSync(join(dir, "_planning.md"), "utf8");
}

const IDEA_FIELDS = [
  "id",
  "title",
  "summary",
  "template",
  "scope",
  "idea",
  "users",
  "data",
];

/** prompts/_ideas.yaml: example ideas for the /ia page, validated. */
export function loadIdeas(dir = PROMPTS_DIR) {
  const ideas = parseYaml(readFileSync(join(dir, "_ideas.yaml"), "utf8"));
  if (!Array.isArray(ideas))
    throw new SkillError("_ideas.yaml: tiene que ser una lista");
  const guides = new Set(loadPrompts(dir).map((p) => p.name));
  const ids = new Set();
  return ideas.map((raw, index) => {
    const where = `_ideas.yaml[${index}]`;
    for (const field of IDEA_FIELDS)
      if (typeof raw?.[field] !== "string" || !raw[field].trim())
        throw new SkillError(`${where}: falta ${field}`);
    if (!["next", "fastapi"].includes(raw.template))
      throw new SkillError(`${where}: template tiene que ser next o fastapi`);
    if (!["club", "distrito"].includes(raw.scope))
      throw new SkillError(`${where}: scope tiene que ser club o distrito`);
    if (raw.guide && !guides.has(raw.guide))
      throw new SkillError(
        `${where}: no existe la plantilla prompts/${raw.guide}.md`,
      );
    if (ids.has(raw.id))
      throw new SkillError(`${where}: id repetido ${raw.id}`);
    ids.add(raw.id);
    const clean = (v) => v.replace(/\s+/g, " ").trim();
    return {
      id: raw.id,
      title: clean(raw.title),
      summary: clean(raw.summary),
      template: raw.template,
      scope: raw.scope,
      idea: clean(raw.idea),
      users: clean(raw.users),
      data: clean(raw.data),
      guide: raw.guide ?? null,
    };
  });
}

export const BUNDLE_SCHEMA = "mirotaract-skills-bundle/1";
export const PRELIMINARY_NOTE =
  "Versión preliminar: todavía no pasaron las evaluaciones automáticas.";

/**
 * The skills bundle served at /ia/skills.json: every target rendered, plus
 * what an installer needs to merge files safely. Deterministic (no dates):
 * same sources → same bytes → same sha256. `evaluated` is true only when the
 * release gate (evals) passed for this exact fingerprint.
 */
export function buildSkillsBundle({ evaluated = false, sources } = {}) {
  const skills = sources?.skills ?? loadSkills();
  const bundle = {
    schema: BUNDLE_SCHEMA,
    package: "@mirotaract/ai-skills",
    version: VERSION,
    fingerprint: fingerprint(),
    status: evaluated ? "evaluated" : "preliminary",
    note: evaluated
      ? "Evaluada: superó el gate de evaluaciones automáticas."
      : PRELIMINARY_NOTE,
    markers: {
      generated: GENERATED_MARK,
      blockBegin: BLOCK_BEGIN,
      blockEnd: BLOCK_END,
    },
    skills: skills.map(({ name, title, description }) => ({
      name,
      title,
      description,
    })),
    targets: Object.fromEntries(
      TARGETS.map((target) => [
        target,
        renderTarget(target, sources).map(({ path, content, managed }) => ({
          path,
          content,
          ...(managed ? { managed: true } : {}),
        })),
      ]),
    ),
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  return {
    bundle,
    json,
    sha256: createHash("sha256").update(json).digest("hex"),
  };
}

/**
 * Where a bundle file is served for manual download: /ia/AGENTS.md and
 * /ia/<target>/<path without its leading dot-folder>
 * (.claude/skills/x/SKILL.md → claude/skills/x/SKILL.md).
 */
export function bundlePublicPath(target, path) {
  if (target === "agents") return path;
  const parts = path.split("/");
  if (parts[0].startsWith(".")) parts.shift();
  return `${target}/${parts.join("/")}`;
}

export {
  ASSISTANTS,
  ASSISTANT_IDS,
  renderMasterPrompt,
  renderPrompt,
  promptFileName,
} from "./master-prompt.js";
