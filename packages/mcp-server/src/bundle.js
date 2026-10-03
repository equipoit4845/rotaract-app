/**
 * The MCP server's knowledge: built once from the monorepo sources
 * (scripts/build-bundle.mjs → dist/bundle.json). When running from a
 * checkout without a build, it is computed in memory from the same sources.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BUNDLE_PATH = join(PACKAGE_DIR, "dist/bundle.json");
const REPO_SOURCES = join(
  PACKAGE_DIR,
  "../../scripts/lib/developer-sources.mjs",
);

export const BUNDLE_FORMAT = 1;

export async function buildBundleData() {
  if (!existsSync(REPO_SOURCES))
    throw new Error(
      "No encuentro las fuentes del monorepo (scripts/lib/developer-sources.mjs) para armar el bundle.",
    );
  const src = await import(pathToFileURL(REPO_SOURCES).href);
  const openapiText = src.loadOpenApiText();
  const openapi = src.loadOpenApi();
  const permissions = await src.loadPermissionCatalog();
  return {
    format: BUNDLE_FORMAT,
    contractVersion: openapi.info?.version ?? null,
    docs: src
      .loadDeveloperDocs()
      .map(({ slug, path, title, description, content }) => ({
        slug,
        path,
        title,
        description,
        content,
      })),
    openapi,
    openapiText,
    events: await src.loadEventCatalog(),
    permissions,
    operations: src.listOperations(openapi, permissions.endpointScopes),
  };
}

let cached;

/** dist/bundle.json if present, else built from the checkout. */
export async function loadBundle() {
  if (cached) return cached;
  if (existsSync(BUNDLE_PATH)) {
    const bundle = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    if (bundle.format === BUNDLE_FORMAT) return (cached = bundle);
  }
  return (cached = await buildBundleData());
}
