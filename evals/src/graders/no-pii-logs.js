/**
 * No personal data (nor tokens/secrets) in logs: console.* / logger.* /
 * print / logging.* calls may log ids, types and counts, not people, whole
 * events, tokens or headers.
 */
import { calls } from "../ast.js";
import { codeFiles, stripComments } from "../files.js";
import { at, fail, lineOf, pass } from "./result.js";

const LOGGERS =
  /^(console\.(log|info|warn|error|debug)|logger\.\w+|log\.(info|warn|error|debug)|this\.logger\.\w+)$/;
const SAFE_KEYS =
  "id|type|organizationId|membershipId|personId|length|size|status|code|count|traceId|trace_id|decisionId|message";
// Whole access chains ending in a safe key: event.id, event.data.membership.personId, event["type"], error.status…
const SAFE_MEMBER = new RegExp(
  `[\\w$]+(?:\\??\\.[\\w$]+|\\[[^\\]]+\\])*(?:\\??\\.(?:${SAFE_KEYS})\\b|\\[\\s*["'](?:${SAFE_KEYS})["']\\s*\\])(?!\\s*\\()`,
  "g",
);
const PII =
  /\b(email|phone|birthDate|birth_date|telefono|teléfono|displayName|display_name|firstName|lastName|first_name|last_name|person|member|members|socio|socios|user|claims|tokens?|access_?token|id_?token|refresh_?token|secret|password|authorization|headers|body|payload|rawBody|event|data)\b/i;

function risky(argText) {
  if (/^["'`][^${}]*["'`]$/.test(argText.trim())) return false; // plain literal message
  const cleaned = argText
    .replace(SAFE_MEMBER, "")
    .replace(/["'`][^"'`$]*["'`]/g, "");
  return PII.test(cleaned);
}

export default {
  id: "no-pii-logs",
  title: "Sin datos personales en los logs",
  critical: true,
  grade({ solution }) {
    const problems = [];
    for (const file of codeFiles(solution)) {
      if (file.lang === "ts" || file.lang === "js") {
        for (const c of calls(file))
          if (c.name && LOGGERS.test(c.name) && c.args.some(risky))
            problems.push(
              `${lineOf(file, c.node, c.sf)}: ${c.name}(${c.args.join(", ").slice(0, 100)})`,
            );
      } else if (file.lang === "py") {
        const code = stripComments(file);
        for (const m of code.matchAll(
          /\b(print|logging\.\w+|log\.\w+|logger\.\w+)\s*\(([^\n]*)\)/g,
        )) {
          // f-strings: only the interpolated expressions matter.
          const args = m[2].replace(
            /f(["'])(.*?)\1/g,
            (_, q, inner) =>
              ` ${[...inner.matchAll(/\{([^}]*)\}/g)].map((x) => x[1]).join(" , ")} `,
          );
          if (risky(args))
            problems.push(`${at(file, m.index)}: ${m[0].slice(0, 110)}`);
        }
      }
    }
    return problems.length
      ? fail("Logs con datos personales, tokens o eventos completos:", problems)
      : pass("Los logs no incluyen datos personales.");
  },
};
