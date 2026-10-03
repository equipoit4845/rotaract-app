import { resolve } from "node:path";

import { CliError } from "../lib/errors.js";
import {
  fetchSkillsBundle,
  installBundle,
  parseSkillTargets,
  skillsUrl,
} from "../lib/skills-bundle.js";

const LABELS = {
  created: "creado",
  updated: "actualizado",
  merged: "agregado al archivo existente",
  unchanged: "sin cambios",
  skipped: "OMITIDO (no lo generó Mi Rotaract; --force para pisarlo)",
};

async function importPackage() {
  try {
    return await import("@mirotaract/ai-skills");
  } catch {
    return null;
  }
}

/**
 * Installs the AI skills into `dir`. Source, in order:
 * 1. --skills-url / MIROTARACT_SKILLS_URL: that bundle, always;
 * 2. the @mirotaract/ai-skills package, when it is installed;
 * 3. the bundle published by the developer portal (checksum verified).
 *
 * Returns { targets, results, source } where source describes where the
 * files came from (for the summary line).
 */
export async function installAiSkills(
  targetsValue,
  dir,
  { values = {}, ctx = {}, force = false, dryRun = false } = {},
) {
  const env = ctx.env ?? {};
  const explicitUrl = values["skills-url"] || env.MIROTARACT_SKILLS_URL;
  const options = { dir, force, dryRun };
  if (!explicitUrl) {
    const skills = await (ctx.importAiSkills ?? importPackage)();
    if (skills) {
      try {
        const targets = skills.parseTargets(targetsValue);
        return {
          targets,
          results: skills.install({ targets, ...options }),
          source: `@mirotaract/ai-skills ${skills.VERSION}`,
          preliminary: false,
        };
      } catch (error) {
        if (error instanceof skills.SkillError)
          throw new CliError(error.message);
        throw error;
      }
    }
  }
  // Validate before touching the network.
  const targets = parseSkillTargets(targetsValue);
  const url = skillsUrl(values, env);
  const { bundle, sha256 } = await fetchSkillsBundle(url, { fetch: ctx.fetch });
  return {
    targets,
    results: installBundle(bundle, { targets, ...options }),
    source: `paquete de skills ${bundle.version} (${bundle.fingerprint}) de ${url}, sha256 ${sha256.slice(0, 12)}… verificado`,
    preliminary: bundle.status !== "evaluated",
    note: bundle.note,
  };
}

/** `mirotaract ai install --target <t> [carpeta]` */
export async function aiInstallCommand(values, positionals, ctx) {
  if (!values.target)
    throw new CliError("Falta --target.", {
      hint: "Ejemplo: mirotaract ai install --target claude (o cursor, copilot, agents, all).",
    });
  const dir = resolve(ctx.cwd, positionals[0] ?? ".");
  const { targets, results, source, preliminary, note } = await installAiSkills(
    values.target,
    dir,
    {
      values,
      ctx,
      force: Boolean(values.force),
      dryRun: Boolean(values["dry-run"]),
    },
  );
  const prefix = values["dry-run"] ? "[simulación] " : "";
  for (const r of results)
    ctx.out.write(`${prefix}${r.path}: ${LABELS[r.action]}\n`);
  ctx.out.write(
    [
      "",
      `Listo: skills de IA para ${targets.join(", ")} en ${dir}.`,
      `Origen: ${source}.`,
      ...(preliminary
        ? [
            note ??
              "Versión preliminar: todavía no pasaron las evaluaciones automáticas.",
          ]
        : []),
      "Cada skill termina con el checklist de seguridad.",
    ].join("\n") + "\n",
  );
  return results.some((r) => r.action === "skipped") ? 2 : 0;
}
