/**
 * Module resolution hooks to load a solution's route handler under plain
 * Node: `@/…` → <solution>/src/…, extensionless relative imports, the
 * official SDK from the monorepo, and tiny stubs for `server-only` and
 * `next/server`.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let ROOT = process.cwd();
let SDK = null;
const STUBS = join(dirname(fileURLToPath(import.meta.url)), "stubs");

export function initialize(data) {
  ROOT = data.root;
  SDK = data.sdkDir;
}

const EXTS = [".ts", ".mts", ".js", ".mjs", "/index.ts", "/index.js"];

function withExtension(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only")
    return {
      url: pathToFileURL(join(STUBS, "empty.mjs")).href,
      shortCircuit: true,
    };
  if (specifier === "next/server")
    return {
      url: pathToFileURL(join(STUBS, "next-server.mjs")).href,
      shortCircuit: true,
    };
  if (SDK && /^@mirotaract\/sdk(\/(next|express))?$/.test(specifier)) {
    const sub = specifier.split("/")[2] ?? "index";
    const src = join(SDK, "src", `${sub}.ts`);
    const dist = join(SDK, "dist/esm", `${sub}.js`);
    return {
      url: pathToFileURL(existsSync(dist) ? dist : src).href,
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    const found =
      withExtension(join(ROOT, "src", specifier.slice(2))) ??
      withExtension(join(ROOT, specifier.slice(2)));
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const base = resolvePath(
      dirname(fileURLToPath(context.parentURL)),
      specifier,
    );
    const found = withExtension(base);
    if (found && found !== base)
      return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  return next(specifier, context);
}
