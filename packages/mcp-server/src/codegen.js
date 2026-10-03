/**
 * generate_types: the same generators as `mirotaract gen types` (CLI E6),
 * fed with the bundled contract and event catalog instead of a running
 * kernel. No network.
 */
import {
  eventsToTs,
  generatePython,
  normalizeCatalog,
} from "@mirotaract/cli/src/lib/codegen.js";
import { generateTs } from "@mirotaract/cli/src/commands/gen-types.js";

export async function generateTypes(
  bundle,
  { lang = "ts", include = "all" } = {},
) {
  const python = ["python", "py"].includes(lang);
  const catalog = include === "api" ? [] : normalizeCatalog(bundle.events);
  const source = `kernel-openapi.yaml (versión ${bundle.contractVersion ?? "?"})`;
  if (python) {
    const spec =
      include === "events" ? { components: { schemas: {} } } : bundle.openapi;
    return {
      code: generatePython(spec, catalog, { source }),
      file: "mirotaract_types.py",
      events: catalog.length,
    };
  }
  if (include === "events")
    return {
      code: [
        "/** Tipos de los eventos de Mi Rotaract (catálogo público). No editar a mano. */",
        "",
        eventsToTs(catalog),
      ].join("\n"),
      file: "mirotaract-events.ts",
      events: catalog.length,
    };
  const code = await generateTs(bundle.openapiText, catalog, {
    source,
    catalogSource: catalog.length ? "catálogo de eventos (bundle)" : null,
  });
  return { code, file: "mirotaract-types.ts", events: catalog.length };
}
