import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { TEMPLATES } from "../lib/args.js";
import { CliError } from "../lib/errors.js";
import { renderTemplate } from "../lib/templates.js";
import { resolveKernelRepo } from "./dev.js";

export function slug(value) {
  return (
    String(value)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "mi-app"
  );
}

/** Values for the {{PLACEHOLDERS}} of every template. */
export function templateVars({ name, kernelRepo }) {
  const projectSlug = slug(name);
  return {
    PROJECT_NAME: projectSlug,
    PROJECT_TITLE: name,
    DART_PACKAGE: projectSlug.replace(/-/g, "_").replace(/^([0-9])/, "app_$1"),
    // Not on npm/PyPI yet: install from the kernel checkout when we know it.
    SDK_JS_DEPENDENCY: kernelRepo
      ? `file:${join(kernelRepo, "packages/sdk-js")}`
      : "^0.1.0",
    SDK_PY_REQUIREMENT: kernelRepo
      ? `mirotaract[fastapi] @ file://${join(kernelRepo, "sdks/python")}`
      : "mirotaract[fastapi]>=0.1.0",
  };
}

const NEXT_STEPS = {
  next: (dir, repo) => [
    `cd ${dir}`,
    ...(repo
      ? [
          `(cd ${repo} && npx pnpm@10.13.1 install && npx pnpm@10.13.1 --filter @mirotaract/sdk build)   # SDK local, una vez`,
        ]
      : []),
    "npm install",
    `mirotaract dev up${repo ? ` --kernel-repo ${repo}` : " --kernel-repo <ruta-al-kernel>"}   # kernel local + .env.local`,
    "npm run dev                    # http://localhost:3000",
  ],
  fastapi: (dir, repo) => [
    `cd ${dir}`,
    "python3 -m venv .venv && .venv/bin/pip install -r requirements.txt",
    `mirotaract dev up${repo ? ` --kernel-repo ${repo}` : " --kernel-repo <ruta-al-kernel>"} --app-url http://localhost:8000`,
    ".venv/bin/uvicorn app.main:app --reload --port 8000   # http://localhost:8000",
  ],
  flutter: (dir) => [
    `cd ${dir}`,
    "flutter create --platforms=android,ios,linux,macos,windows .   # genera las carpetas nativas",
    "flutter pub get",
    "# Seguí el README: dirección de regreso, backend y --dart-define.",
  ],
};

/**
 * `--ai claude,cursor,…`: drops the @mirotaract/ai-skills files into the new
 * app (the template's AGENTS.md keeps its content; the skills go in a
 * managed block).
 */
export async function installAiSkills(targetsValue, dir) {
  let skills;
  try {
    skills = await import("@mirotaract/ai-skills");
  } catch {
    throw new CliError("No encontré @mirotaract/ai-skills.", {
      hint: "Instalalo (`npm install -g @mirotaract/ai-skills`) o corré `npx @mirotaract/ai-skills install --target <destino>` en la carpeta de la app.",
    });
  }
  try {
    const targets = skills.parseTargets(targetsValue);
    return { targets, results: skills.install({ targets, dir }) };
  } catch (error) {
    if (error instanceof skills.SkillError) throw new CliError(error.message);
    throw error;
  }
}

export async function initCommand(values, positionals, ctx) {
  const template = (values.template ?? "next").toLowerCase();
  if (!TEMPLATES.includes(template))
    throw new CliError(`No conozco la plantilla "${values.template}".`, {
      hint: `Plantillas: ${TEMPLATES.join(", ")}.`,
    });
  const target = resolve(ctx.cwd, positionals[0] ?? ".");
  if (
    existsSync(target) &&
    readdirSync(target).filter((f) => f !== ".git").length > 0 &&
    !values.force
  )
    throw new CliError(`La carpeta ${target} no está vacía.`, {
      hint: "Elegí otra carpeta o usá --force para escribir igual (pisa archivos con el mismo nombre).",
    });
  const kernelRepo = resolveKernelRepo(values, ctx.env);
  const name = values.name ?? basename(target);
  const files = renderTemplate(
    template,
    target,
    templateVars({ name, kernelRepo }),
  );
  const ai = values.ai ? await installAiSkills(values.ai, target) : null;
  const dir = relative(ctx.cwd, target) || ".";
  ctx.out.write(
    [
      `Listo: plantilla "${template}" en ${target} (${files.length} archivos).`,
      kernelRepo
        ? `El SDK se instala desde ${kernelRepo} (todavía no está publicado).`
        : "Ojo: el SDK todavía no está publicado; pasá --kernel-repo para instalarlo desde el repositorio (ver README).",
      ...(ai
        ? [
            `Skills de IA (${ai.targets.join(", ")}): ${ai.results.map((r) => r.path).join(", ")}.`,
          ]
        : []),
      "",
      "Siguientes pasos:",
      ...NEXT_STEPS[template](dir, kernelRepo).map((line) => `  ${line}`),
      "",
      "Antes de producción, repasá AGENTS.md (checklist de seguridad).",
    ].join("\n") + "\n",
  );
  return 0;
}
