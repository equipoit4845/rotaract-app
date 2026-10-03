/**
 * Skills of IA without the @mirotaract/ai-skills package: the developer
 * portal publishes the same files as a versioned bundle
 * (https://developers.rotaract4845.com/ia/skills.json, built from
 * packages/ai-skills by buildSkillsBundle()) with its SHA-256 next to it
 * (skills.json.sha256). We download both, refuse anything whose checksum
 * doesn't match, and install with the same rules as the package: never
 * clobber a file we didn't generate, merge AGENTS.md / copilot-instructions.md
 * as a managed block.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./errors.js";

export const DEFAULT_SKILLS_URL =
  "https://developers.rotaract4845.com/ia/skills.json";
export const BUNDLE_SCHEMA = "mirotaract-skills-bundle/1";
export const SKILL_TARGETS = ["claude", "cursor", "copilot", "agents"];
const TIMEOUT_MS = 30_000;

/** --skills-url, then MIROTARACT_SKILLS_URL, then the portal. */
export function skillsUrl(values = {}, env = {}) {
  return (
    values["skills-url"] || env.MIROTARACT_SKILLS_URL || DEFAULT_SKILLS_URL
  );
}

/** "claude,agents" | "all" → validated list (same rules as the package). */
export function parseSkillTargets(value) {
  const list = String(value ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length)
    throw new CliError(`Falta --target (${SKILL_TARGETS.join(", ")} o all).`);
  if (list.includes("all")) return [...SKILL_TARGETS];
  for (const t of list)
    if (!SKILL_TARGETS.includes(t))
      throw new CliError(
        `Destino desconocido: ${t}. Usá ${SKILL_TARGETS.join(", ")} o all.`,
      );
  return [...new Set(list)];
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** First 64-hex token of a `sha256sum`-style file. */
export function parseChecksum(text) {
  const match = String(text).match(/\b([0-9a-f]{64})\b/i);
  return match ? match[1].toLowerCase() : null;
}

async function readSource(url, fetchImpl) {
  if (url.startsWith("file:") || isAbsolute(url)) {
    const path = url.startsWith("file:") ? fileURLToPath(url) : url;
    if (!existsSync(path)) throw new CliError(`No existe el archivo ${path}.`);
    return readFileSync(path);
  }
  let response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json, text/plain;q=0.9" },
    });
  } catch (error) {
    throw new CliError(`No pude descargar ${url}: ${error?.message ?? error}`, {
      hint: "Revisá tu conexión. Sin internet, instalá @mirotaract/ai-skills o pasá --skills-url con una copia local del paquete de skills.",
    });
  }
  if (!response.ok)
    throw new CliError(`No pude descargar ${url} (HTTP ${response.status}).`, {
      hint: "Probá de nuevo en un rato; si sigue, avisá al equipo de Mi Rotaract.",
    });
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads the bundle and its checksum and verifies them. Returns
 * { bundle, sha256, url }. Throws CliError on any mismatch.
 */
export async function fetchSkillsBundle(url, { fetch: fetchImpl } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const [bytes, checksumBytes] = await Promise.all([
    readSource(url, doFetch),
    readSource(`${url}.sha256`, doFetch),
  ]);
  const expected = parseChecksum(checksumBytes.toString("utf8"));
  if (!expected)
    throw new CliError(`${url}.sha256 no tiene una suma SHA-256 válida.`);
  const actual = sha256(bytes);
  if (actual !== expected)
    throw new CliError(
      "El paquete de skills descargado no coincide con su suma SHA-256: no lo instalo.",
      {
        hint: `Esperaba ${expected}, recibí ${actual}. Probá de nuevo; si se repite, avisá al equipo de Mi Rotaract.`,
      },
    );
  let bundle;
  try {
    bundle = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CliError(`${url} no es un JSON válido.`);
  }
  validateBundle(bundle);
  return { bundle, sha256: actual, url };
}

/** A relative path that stays inside the project (defense in depth). */
function safeRelativePath(path) {
  if (typeof path !== "string" || !path || isAbsolute(path)) return false;
  const normal = normalize(path);
  return !normal.split(/[\\/]/).includes("..") && !normal.startsWith(sep);
}

export function validateBundle(bundle) {
  const fail = (why) => {
    throw new CliError(`Paquete de skills inválido: ${why}.`, {
      hint: "Puede que tu CLI sea vieja: actualizala con `npm install -g @mirotaract/cli@latest` (o usá npx @mirotaract/cli@latest).",
    });
  };
  if (bundle?.schema !== BUNDLE_SCHEMA)
    fail(
      `formato ${bundle?.schema ?? "desconocido"} (espero ${BUNDLE_SCHEMA})`,
    );
  const markers = bundle.markers ?? {};
  for (const key of ["generated", "blockBegin", "blockEnd"])
    if (typeof markers[key] !== "string" || !markers[key])
      fail(`falta markers.${key}`);
  if (!bundle.targets || typeof bundle.targets !== "object")
    fail("faltan los destinos");
  for (const [target, files] of Object.entries(bundle.targets)) {
    if (!Array.isArray(files)) fail(`targets.${target} no es una lista`);
    for (const file of files) {
      if (!safeRelativePath(file?.path))
        fail(`ruta insegura en ${target}: ${file?.path}`);
      if (typeof file.content !== "string") fail(`${file.path} sin contenido`);
    }
  }
  return bundle;
}

/** Replaces (or appends) the managed block, keeping the user's text. */
export function mergeManagedBlock(existing, block, { blockBegin, blockEnd }) {
  const begin = existing.indexOf(blockBegin);
  const end = existing.indexOf(blockEnd);
  if (begin >= 0 && end > begin) {
    const after = existing.slice(end + blockEnd.length).replace(/^\r?\n/, "");
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

/**
 * Writes the bundle's files for `targets` into `dir`, with the package's
 * rules. Returns [{ target, path, action }] with action
 * created | updated | unchanged | merged | skipped.
 */
export function installBundle(
  bundle,
  { targets, dir, force = false, dryRun = false },
) {
  const { markers } = bundle;
  const results = [];
  for (const target of targets) {
    const files = bundle.targets[target];
    if (!files)
      throw new CliError(`El paquete de skills no trae el destino ${target}.`);
    for (const file of files) {
      const destination = join(dir, file.path);
      const exists = existsSync(destination);
      const current = exists ? readFileSync(destination, "utf8") : null;
      let next = file.content;
      let action;
      if (file.managed && exists) {
        next = mergeManagedBlock(current, file.content, markers);
        action = current.includes(markers.blockBegin) ? "updated" : "merged";
      } else if (exists && !current.includes(markers.generated) && !force) {
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
