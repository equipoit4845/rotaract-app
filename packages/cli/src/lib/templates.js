import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { CliError } from "./errors.js";

export const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../templates",
);

/**
 * Files are copied as is, except:
 * - `*.tmpl`: `{{VAR}}` placeholders are replaced and the suffix dropped;
 * - names starting with `_dot_` become dotfiles (`_dot_gitignore` →
 *   `.gitignore`): npm would otherwise drop or rename them when publishing.
 */
export function targetName(name) {
  let out = name.endsWith(".tmpl") ? name.slice(0, -".tmpl".length) : name;
  if (out.startsWith("_dot_")) out = `.${out.slice("_dot_".length)}`;
  return out;
}

export function renderString(text, vars) {
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!(key in vars))
      throw new CliError(`La plantilla usa {{${key}}} pero no tiene valor.`);
    return String(vars[key]);
  });
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".dart_tool" ||
      entry === "__pycache__"
    )
      continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/** Copies template `name` into `targetDir`; returns the written (relative) paths. */
export function renderTemplate(
  name,
  targetDir,
  vars,
  { templatesDir = TEMPLATES_DIR } = {},
) {
  const root = join(templatesDir, name);
  if (!existsSync(root))
    throw new CliError(`No existe la plantilla "${name}".`);
  const written = [];
  for (const source of walk(root)) {
    const rel = relative(root, source).split(/[\\/]/).map(targetName).join("/");
    const destination = join(targetDir, rel);
    mkdirSync(dirname(destination), { recursive: true });
    if (source.endsWith(".tmpl"))
      writeFileSync(
        destination,
        renderString(readFileSync(source, "utf8"), vars),
      );
    else writeFileSync(destination, readFileSync(source));
    written.push(rel);
  }
  return written.sort();
}
