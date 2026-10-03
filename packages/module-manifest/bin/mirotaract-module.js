#!/usr/bin/env node
/**
 * mirotaract-module check [archivo] [--json] [--events <archivo|url>]
 *
 * Valida un mirotaract.module.json contra el contrato v1. Sale con 0 si es
 * válido, 1 si tiene errores y 2 si no se pudo leer. --json imprime
 * { ok, errors } para CI y asistentes de IA.
 */
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MANIFEST_FILE_NAME, validateManifest } from "../src/index.js";

const HELP = `Uso: mirotaract-module check [archivo] [--json] [--events <catálogo.json|url>]

  archivo     Manifiesto a validar (default: ./${MANIFEST_FILE_NAME})
  --json      Salida en JSON: { "ok": boolean, "errors": [{ path, message, keyword }] }
  --events    Catálogo de eventos (GET /events/catalog) para verificar events.subscribes.
              Puede ser un archivo o una URL, p. ej.
              https://api.rotaract4845.com/api/kernel/v1/events/catalog
`;

async function loadCatalog(source) {
  const text = /^https?:\/\//.test(source)
    ? await (await fetch(source)).text()
    : await readFile(resolve(source), "utf8");
  const catalog = JSON.parse(text);
  return (catalog.events ?? []).map((event) => event.type);
}

export async function main(argv = process.argv.slice(2), io = process) {
  const args = [...argv];
  if (args[0] === "check") args.shift();
  if (args.includes("--help") || args.includes("-h")) {
    io.stdout.write(HELP);
    return 0;
  }
  const json = args.includes("--json");
  const eventsIndex = args.indexOf("--events");
  const eventsSource = eventsIndex >= 0 ? args[eventsIndex + 1] : undefined;
  const positional = args.filter(
    (arg, index) =>
      !arg.startsWith("--") && (eventsIndex < 0 || index !== eventsIndex + 1),
  );
  const file = resolve(positional[0] ?? MANIFEST_FILE_NAME);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const message =
      error && error.code === "ENOENT"
        ? `No encontré ${file}.`
        : `No pude leer ${file}: ${error instanceof Error ? error.message : String(error)}`;
    if (json) io.stdout.write(`${JSON.stringify({ ok: false, errors: [{ path: "", message, keyword: "read" }] })}\n`);
    else io.stderr.write(`${message}\n`);
    return 2;
  }

  let knownEventTypes;
  if (eventsSource) {
    try {
      knownEventTypes = await loadCatalog(eventsSource);
    } catch (error) {
      const message = `No pude leer el catálogo de eventos (${eventsSource}): ${error instanceof Error ? error.message : String(error)}`;
      if (json) io.stdout.write(`${JSON.stringify({ ok: false, errors: [{ path: "", message, keyword: "read" }] })}\n`);
      else io.stderr.write(`${message}\n`);
      return 2;
    }
  }

  const result = validateManifest(manifest, { knownEventTypes });
  if (json) {
    io.stdout.write(`${JSON.stringify({ ok: result.ok, errors: result.errors })}\n`);
  } else if (result.ok) {
    io.stdout.write(
      `✔ ${file}: manifiesto válido (${manifest.id}@${manifest.version}, ${manifest.permissions.length} permisos).\n`,
    );
  } else {
    io.stderr.write(`✖ ${file}: ${result.errors.length} problema(s)\n`);
    for (const error of result.errors)
      io.stderr.write(`  - ${error.path || "(raíz)"}: ${error.message}\n`);
  }
  return result.ok ? 0 : 1;
}

function isEntryPoint() {
  try {
    return (
      Boolean(process.argv[1]) &&
      realpathSync(new URL(import.meta.url)) === realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
}
const invokedDirectly = isEntryPoint();
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exit(2);
    },
  );
}
