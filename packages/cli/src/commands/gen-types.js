import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import { DEFAULT_API_PORT, parseUrl } from "../lib/args.js";
import {
  eventsToTs,
  generatePython,
  normalizeCatalog,
} from "../lib/codegen.js";
import { readEnvFile } from "../lib/env-file.js";
import { CliError } from "../lib/errors.js";
import { resolveKernelRepo } from "./dev.js";

const FETCH_TIMEOUT_MS = 10_000;

function defaultOut(cwd, lang) {
  if (lang === "python")
    return existsSync(join(cwd, "app"))
      ? "app/mirotaract_types.py"
      : "mirotaract_types.py";
  return existsSync(join(cwd, "src"))
    ? "src/mirotaract-types.ts"
    : "mirotaract-types.ts";
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * Where the contract comes from: --spec (file or URL) > the kernel's served
 * /openapi.yaml > <kernel repo>/kernel-openapi.yaml.
 */
export async function loadSpec({
  values,
  baseUrl,
  cwd,
  env,
  fetch: fetchImpl,
  log,
}) {
  if (values.spec) {
    if (/^https?:\/\//.test(values.spec)) {
      try {
        return {
          text: await fetchText(fetchImpl, values.spec),
          source: values.spec,
        };
      } catch (error) {
        throw new CliError(
          `No pude descargar ${values.spec}: ${error.message}`,
        );
      }
    }
    const path = resolve(cwd, values.spec);
    if (!existsSync(path)) throw new CliError(`No existe ${path}.`);
    return { text: readFileSync(path, "utf8"), source: path };
  }
  const served = `${new URL(baseUrl).origin}/openapi.yaml`;
  try {
    return { text: await fetchText(fetchImpl, served), source: served };
  } catch (error) {
    log(
      `No pude leer ${served} (${error.cause?.code ?? error.message}); pruebo con el repositorio del kernel.`,
    );
  }
  const repo = resolveKernelRepo(values, env);
  if (repo && existsSync(join(repo, "kernel-openapi.yaml")))
    return {
      text: readFileSync(join(repo, "kernel-openapi.yaml"), "utf8"),
      source: join(repo, "kernel-openapi.yaml"),
    };
  throw new CliError("No encontré el contrato OpenAPI del kernel.", {
    hint: "Levantá el kernel (`mirotaract dev up`), o pasá --spec <archivo|url> o --kernel-repo <ruta>.",
  });
}

export async function loadCatalog({ baseUrl, fetch: fetchImpl, log }) {
  const url = `${baseUrl}/events/catalog`;
  try {
    const text = await fetchText(fetchImpl, url);
    const catalog = normalizeCatalog(JSON.parse(text));
    if (!catalog.length) log(`El catálogo de eventos (${url}) está vacío.`);
    return { catalog, source: url };
  } catch (error) {
    log(
      `No pude leer el catálogo de eventos en ${url} (${error.cause?.code ?? error.message}); genero solo los tipos de la API.`,
    );
    return { catalog: [], source: null };
  }
}

export async function generateTs(specText, catalog, { source, catalogSource }) {
  let openapiTS;
  let astToString;
  try {
    ({ default: openapiTS, astToString } = await import("openapi-typescript"));
  } catch {
    throw new CliError("Falta la dependencia openapi-typescript.", {
      hint: "Reinstalá la CLI (`npm install -g @mirotaract/cli`) o corré `npm install openapi-typescript`.",
    });
  }
  const ast = await openapiTS(specText, { silent: true });
  return [
    "/**",
    " * Tipos de Mi Rotaract generados por `mirotaract gen types`. No editar a mano.",
    ` * API: ${source}`,
    ` * Eventos: ${catalogSource ?? "(catálogo no disponible al generar)"}`,
    " */",
    "",
    astToString(ast),
    eventsToTs(catalog),
  ].join("\n");
}

export async function genTypesCommand(values, ctx) {
  const lang = (values.lang ?? "ts").toLowerCase();
  if (!["ts", "typescript", "python", "py"].includes(lang))
    throw new CliError(`Lenguaje no soportado: ${values.lang}.`, {
      hint: "Usá --lang ts o --lang python.",
    });
  const python = lang === "python" || lang === "py";
  const fileEnv = readEnvFile(
    resolve(ctx.cwd, values["env-path"] ?? ".env.local"),
  );
  const baseUrl = parseUrl(
    values["base-url"] ??
      ctx.env.MIROTARACT_BASE_URL ??
      fileEnv.MIROTARACT_BASE_URL ??
      `http://localhost:${DEFAULT_API_PORT}/api/kernel/v1`,
    "--base-url",
  );
  const log = (line) => ctx.err.write(`${line}\n`);
  const fetchImpl = ctx.fetch ?? globalThis.fetch;
  const spec = await loadSpec({
    values,
    baseUrl,
    cwd: ctx.cwd,
    env: ctx.env,
    fetch: fetchImpl,
    log,
  });
  const { catalog, source: catalogSource } = await loadCatalog({
    baseUrl,
    fetch: fetchImpl,
    log,
  });

  let output;
  if (python) {
    let document;
    try {
      document = parseYaml(spec.text);
    } catch (error) {
      throw new CliError(
        `El contrato OpenAPI no es YAML/JSON válido: ${error.message}`,
      );
    }
    output = generatePython(document, catalog, { source: spec.source });
  } else
    output = await generateTs(spec.text, catalog, {
      source: spec.source,
      catalogSource,
    });

  const out = resolve(
    ctx.cwd,
    values.out ?? defaultOut(ctx.cwd, python ? "python" : "ts"),
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, output);
  ctx.out.write(
    `Tipos ${python ? "Python" : "TypeScript"} escritos en ${relative(ctx.cwd, out) || out} ` +
      `(${catalog.length} evento${catalog.length === 1 ? "" : "s"}; contrato: ${spec.source}).\n`,
  );
  return 0;
}
