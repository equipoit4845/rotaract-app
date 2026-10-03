/**
 * Release gate (E10.4): a version of the skills is publishable only if the
 * solutions generated WITH the skills reach the threshold (default 90 %)
 * and have no critical security failure.
 */
import { existsSync, readFileSync } from "node:fs";

import { DEFAULT_THRESHOLD } from "./runner.js";

/** Accepts a `run` summary ({ score, results }) or a `generate --compare` report ({ withSkills, withoutSkills }). */
export function evaluateGate(
  report,
  {
    threshold = DEFAULT_THRESHOLD,
    allowCritical = false,
    currentFingerprint,
  } = {},
) {
  const run = report?.withSkills ?? report;
  if (!run || typeof run.score !== "number" || !Array.isArray(run.results))
    return {
      ok: false,
      reasons: [
        "El archivo de resultados no tiene el formato de `evals run` ni de `evals generate`.",
      ],
    };
  const reasons = [];
  if (run.score < threshold)
    reasons.push(
      `Puntaje ${(run.score * 100).toFixed(1)} % < umbral ${(threshold * 100).toFixed(0)} %.`,
    );
  const critical = run.results.flatMap((r) =>
    r.criticalFailures.map((g) => `${r.task}: ${g}`),
  );
  if (critical.length && !allowCritical)
    reasons.push(`Fallas críticas de seguridad: ${critical.join(", ")}.`);
  if (currentFingerprint && report.skillsFingerprint !== currentFingerprint)
    reasons.push(
      `Los resultados no corresponden a las skills actuales (huella ${report.skillsFingerprint ?? "ausente"} ≠ ${currentFingerprint}): volvé a correr los evals.`,
    );
  return { ok: reasons.length === 0, score: run.score, threshold, reasons };
}

export function readReport(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}
