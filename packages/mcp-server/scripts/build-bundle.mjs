#!/usr/bin/env node
/**
 * Bundles the read-only knowledge the MCP server serves into dist/bundle.json:
 * docs/developers/*.md, kernel-openapi.yaml (text and parsed), the event
 * catalog and the permission/scope catalog. Runs in the monorepo at build
 * time; the published package ships the JSON and never reads the repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBundleData } from "../src/bundle.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/bundle.json");

const bundle = await buildBundleData();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(bundle)}\n`);
process.stderr.write(
  `bundle: ${bundle.docs.length} guías, ${bundle.events.events.length} eventos, ${bundle.permissions.kernelPermissions.length} permisos → ${join("dist", "bundle.json")}\n`,
);
