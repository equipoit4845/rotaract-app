/**
 * Runs the solution's webhook route handler (Node, no network) with signed,
 * tampered, stale, unsigned and duplicate deliveries. Skipped when the
 * handler can't be loaded outside its framework (static graders still apply).
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fail, pass, skip } from "./result.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, "../runtime/webhook-child.mjs");
export const SDK_DIR = join(HERE, "../../../packages/sdk-js");

export function runWebhookChild(dir, entries) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        "--experimental-transform-types",
        "--no-warnings",
        CHILD,
        dir,
        JSON.stringify(entries),
        existsSync(SDK_DIR) ? SDK_DIR : "",
      ],
      {
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
      },
      (error, stdout, stderr) => {
        const line = stdout.split("\n").find((l) => l.startsWith("@@RESULT "));
        if (line) return resolve(JSON.parse(line.slice("@@RESULT ".length)));
        resolve({
          loaded: false,
          reason: `el proceso de prueba falló: ${(stderr || error?.message || "").split("\n")[0]}`,
        });
      },
    );
  });
}

export default {
  id: "webhook-runtime",
  title:
    "Webhook en ejecución: 2xx rápido, rechaza firmas inválidas, tolera duplicados",
  critical: true,
  async grade({ solution, options = {} }) {
    const entries = options.entries ?? [
      "src/app/api/webhooks/mirotaract/route.ts",
      "src/app/api/webhooks/route.ts",
      "app/api/webhooks/mirotaract/route.ts",
      "app/api/webhooks/route.ts",
    ];
    if (!entries.some((e) => existsSync(join(solution.dir, e))))
      return skip("No hay un route handler de Next.js en las rutas esperadas.");
    const result = await runWebhookChild(solution.dir, entries);
    if (!result.loaded)
      return skip(
        `No se pudo ejecutar el handler fuera de Next.js (${result.reason}).`,
      );
    const lines = result.cases.map(
      (c) =>
        `${c.ok ? "ok" : "FALLA"} · ${c.name}: esperado ${c.expect}, respondió ${c.status} en ${c.ms} ms`,
    );
    return result.cases.every((c) => c.ok)
      ? pass(`Ejecutado ${result.entry}:`, lines)
      : fail(`Ejecutado ${result.entry}:`, lines);
  },
};
