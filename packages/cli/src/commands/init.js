import { existsSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { TEMPLATES } from "../lib/args.js";
import { CliError } from "../lib/errors.js";
import { renderTemplate } from "../lib/templates.js";
import { parseSkillTargets } from "../lib/skills-bundle.js";
import { installAiSkills } from "./ai.js";
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

/** The Python SDK on PyPI (published 0.1.0, MIT). */
export const PY_SDK_REQUIREMENT = "mirotaract[fastapi]>=0.1.0";

/** Values for the {{PLACEHOLDERS}} of every template. */
export function templateVars({ name, kernelRepo }) {
  const projectSlug = slug(name);
  return {
    PROJECT_NAME: projectSlug,
    PROJECT_TITLE: name,
    DART_PACKAGE: projectSlug.replace(/-/g, "_").replace(/^([0-9])/, "app_$1"),
    // Published on npm/PyPI; --kernel-repo points at a local checkout instead.
    SDK_JS_DEPENDENCY: kernelRepo
      ? `file:${join(kernelRepo, "packages/sdk-js")}`
      : "^0.1.0",
    // The Python SDK is not on PyPI yet: install it from the public repo.
    SDK_PY_REQUIREMENT: kernelRepo
      ? `mirotaract[fastapi] @ file://${join(kernelRepo, "sdks/python")}`
      : PY_SDK_REQUIREMENT,
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
  // A typo in --ai fails before anything is written.
  if (values.ai) parseSkillTargets(values.ai);
  const kernelRepo = resolveKernelRepo(values, ctx.env);
  const name = values.name ?? basename(target);
  const files = renderTemplate(
    template,
    target,
    templateVars({ name, kernelRepo }),
  );
  const dir = relative(ctx.cwd, target) || ".";
  let ai = null;
  let aiWarning = null;
  if (values.ai)
    try {
      ai = await installAiSkills(values.ai, target, { values, ctx });
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      // The app is already there: don't fail the whole init for the skills.
      aiWarning = [
        `Aviso: la app se creó, pero no pude instalar las skills de IA: ${error.message}`,
        ...(error.hint ? [error.hint] : []),
        `Reintentalo con: mirotaract ai install --target ${values.ai} ${dir}`,
      ];
    }
  const sdkLine = kernelRepo
    ? `El SDK se instala desde ${kernelRepo}.`
    : template === "fastapi"
      ? "El SDK de Python (mirotaract) se instala desde PyPI."
      : template === "next"
        ? "El SDK (@mirotaract/sdk) se instala desde npm."
        : null;
  ctx.out.write(
    [
      `Listo: plantilla "${template}" en ${target} (${files.length} archivos).`,
      ...(sdkLine ? [sdkLine] : []),
      ...(ai
        ? [
            `Skills de IA (${ai.targets.join(", ")}): ${ai.results
              .map(
                (r) =>
                  `${r.path}${r.action === "skipped" ? " (omitido: ya existía)" : ""}`,
              )
              .join(", ")}.`,
            `Origen: ${ai.source}.`,
            ...(ai.preliminary
              ? [
                  ai.note ??
                    "Versión preliminar: todavía no pasaron las evaluaciones automáticas.",
                ]
              : []),
          ]
        : []),
      ...(aiWarning ?? []),
      "",
      "Siguientes pasos:",
      ...NEXT_STEPS[template](dir, kernelRepo)
        .filter((line) => line !== "cd .")
        .map((line) => `  ${line}`),
      "",
      "Antes de producción, repasá AGENTS.md (checklist de seguridad).",
    ].join("\n") + "\n",
  );
  return 0;
}
