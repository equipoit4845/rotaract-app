/** Webhooks deduplicated by event id (MiRotaract-Webhook-Id), since retries repeat it. */
import { codeFiles, stripComments } from "../files.js";
import { fail, pass } from "./result.js";

export default {
  id: "webhook-idempotency",
  title: "Idempotencia por id de evento",
  critical: false,
  grade({ solution }) {
    for (const file of codeFiles(solution).filter(
      (f) => !f.client && /webhook/i.test(f.path + f.content),
    )) {
      const code = stripComments(file);
      const usesId =
        /event\??\.id\b|event\[\s*["']id["']\s*\]|evt\.id\b|mirotaract-webhook-id/i.test(
          code,
        );
      const dedupe =
        /\.has\(|\.add\(|alreadyProcessed|yaProcesado|ya_procesado|processed|procesado|seen|unique|exists|upsert|on\s+conflict|INSERT\s+OR\s+IGNORE|in\s+\w*seen|not\s+in\s+/i.test(
          code,
        );
      if (usesId && dedupe)
        return pass(`Deduplica por el id del evento en ${file.path}.`);
    }
    return fail(
      "No encontré deduplicación por event.id / MiRotaract-Webhook-Id (los reintentos repiten el evento).",
    );
  },
};
