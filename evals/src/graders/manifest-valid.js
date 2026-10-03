/**
 * mirotaract.module.json valid against the module contract (via the MCP
 * adapter: @mirotaract/module-manifest when installed, the contract's minimal
 * schema otherwise), plus the task's expectations.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { validateModuleManifest } from "@mirotaract/mcp/manifest";

import { fail, pass } from "./result.js";

export default {
  id: "manifest-valid",
  title: "Manifiesto de módulo válido",
  critical: true,
  async grade({ solution, options = {}, catalog }) {
    const path = join(solution.dir, "mirotaract.module.json");
    if (!existsSync(path))
      return fail("Falta mirotaract.module.json en la raíz.");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      return fail(`mirotaract.module.json no es JSON válido: ${error.message}`);
    }
    const events = catalog?.events ?? [];
    const result = await validateModuleManifest(manifest, {
      eventTypes: events.map((e) => e.type).filter((t) => t !== "ping.v1"),
      eventScopes: Object.fromEntries(
        events.filter((e) => e.scope).map((e) => [e.type, e.scope]),
      ),
    });
    const problems = result.errors.map((e) => `${e.path || "/"}: ${e.message}`);
    if (options.id && manifest.id !== options.id)
      problems.push(`/id: la tarea pide el id "${options.id}".`);
    for (const type of options.subscribes ?? [])
      if (!manifest.events?.subscribes?.includes(type))
        problems.push(`/events/subscribes: falta ${type}.`);
    for (const code of options.permissions ?? [])
      if (!manifest.permissions?.some((p) => p.code === code))
        problems.push(`/permissions: falta ${code}.`);
    const allowed = options.allowedScopes;
    if (allowed)
      for (const s of manifest.oauth?.scopes ?? [])
        if (!allowed.includes(s))
          problems.push(`/oauth/scopes: ${s} no hace falta para esta tarea.`);
    return problems.length
      ? fail(`Manifiesto inválido (validador: ${result.validator}):`, problems)
      : pass(
          `Manifiesto válido (validador: ${result.validator}).`,
          result.warnings.map((w) => `advertencia ${w.path}: ${w.message}`),
        );
  },
};
