/**
 * Webhook signature verified: with the SDK (verifyWebhook,
 * createWebhookHandler, miRotaractWebhook, verify_webhook) over the raw body,
 * or a correct manual HMAC-SHA256 over "<timestamp>.<raw body>" with a
 * timestamp tolerance and a constant-time comparison.
 */
import { imports } from "../ast.js";
import { codeFiles, stripComments } from "../files.js";
import { at, fail, pass } from "./result.js";

const SDK_TS = ["verifyWebhook", "createWebhookHandler", "miRotaractWebhook"];

function manualTs(code) {
  return {
    hmac:
      /createHmac\(\s*["'`]sha256["'`]/.test(code) ||
      (/crypto\.subtle\.(importKey|sign)/.test(code) && /HMAC/.test(code)),
    timestampPayload:
      /`\$\{\s*\w*(timestamp|ts|time)\w*\s*\}\.\$\{/i.test(code) ||
      /(timestamp|ts)\w*\s*\+\s*["'`]\.["'`]\s*\+/i.test(code),
    tolerance:
      /\b(300|5\s*\*\s*60|300_000|300000|5\s*\*\s*60\s*\*\s*1000)\b/.test(
        code,
      ) && /Math\.abs|>\s*\w*(toleran|max)/i.test(code),
    constantTime: /timingSafeEqual/.test(code),
  };
}

function manualPy(code) {
  return {
    hmac:
      /hmac\.new\([\s\S]{0,200}sha256/.test(code) ||
      /hmac\.digest\([\s\S]{0,200}sha256/.test(code),
    timestampPayload:
      /f["']\{\s*\w*(timestamp|ts)\w*\s*\}\./i.test(code) ||
      /(timestamp|ts)\w*[\s\S]{0,40}\+\s*b?["']\.["']/i.test(code) ||
      /b["']\.["']\.join/.test(code),
    tolerance: /\b(300|5\s*\*\s*60)\b/.test(code) && /abs\(/.test(code),
    constantTime: /compare_digest/.test(code),
  };
}

export default {
  id: "webhook-signature",
  title: "Firma de webhooks verificada",
  critical: true,
  grade({ solution }) {
    const problems = [];
    let sdk = false;
    let manual = null;
    const handlers = [];
    for (const file of codeFiles(solution).filter((f) => !f.client)) {
      const code = stripComments(file);
      const isHandler =
        /webhook/i.test(file.path) ||
        /MiRotaract-Signature|mirotaract-signature|verify_?webhook|createWebhookHandler|miRotaractWebhook/i.test(
          code,
        );
      if (!isHandler) continue;
      handlers.push(file.path);
      if (file.lang === "ts" || file.lang === "js") {
        const fileSdk = imports(file).some(
          (i) =>
            /^@mirotaract\/sdk(\/(next|express))?$/.test(i.from) &&
            i.names.some((n) => SDK_TS.includes(n)),
        );
        if (fileSdk) sdk = true;
        const m = manualTs(code);
        if (m.hmac) manual = { file, ...m };
        // Re-serialized body: the signature is over the raw bytes.
        const reser = code.match(
          /JSON\.stringify\(\s*(await\s+)?(req|request)\.(body|json\(\))/,
        );
        if (reser)
          problems.push(
            `${at(file, reser.index)}: firma sobre un JSON re-serializado, no sobre el cuerpo crudo`,
          );
        const parsedFirst = code.match(/await\s+(req|request)\.json\(\)/);
        if (parsedFirst && !fileSdk)
          problems.push(
            `${at(file, parsedFirst.index)}: lee request.json() (el cuerpo crudo se pierde)`,
          );
        const plainCompare = code.match(
          /(signature|expected|digest)\w*\s*(===|!==|==)\s*\w*(signature|expected|digest|header)/i,
        );
        if (plainCompare && !m.constantTime)
          problems.push(
            `${at(file, plainCompare.index)}: compara la firma con ${plainCompare[2]} (no es de tiempo constante)`,
          );
        if (
          /app\.use\(\s*express\.json\(\)/.test(code) &&
          !/express\.raw\(/.test(code)
        )
          problems.push(
            `${file.path}: express.json() global sin express.raw() en la ruta del webhook`,
          );
      } else if (file.lang === "py") {
        if (
          /from\s+mirotaract\s+import\s+[^\n]*verify_webhook/.test(code) &&
          /verify_webhook\(/.test(code)
        )
          sdk = true;
        const m = manualPy(code);
        if (m.hmac) manual = { file, ...m };
        const parsed = code.match(/await\s+request\.json\(\)/);
        if (parsed)
          problems.push(
            `${at(file, parsed.index)}: usa request.json() (verificá sobre await request.body())`,
          );
        const reser = code.match(/json\.dumps\(\s*(payload|body|data|event)/);
        if (reser && m.hmac)
          problems.push(
            `${at(file, reser.index)}: firma sobre un JSON re-serializado`,
          );
      }
    }
    if (!handlers.length) return fail("No encontré el endpoint de webhooks.");
    if (problems.length)
      return fail("Verificación de firma incorrecta:", problems);
    if (sdk)
      return pass(
        "Verifica la firma con el SDK oficial (cuerpo crudo, tolerancia de 5 minutos, tiempo constante).",
      );
    if (manual) {
      const missing = [];
      if (!manual.timestampPayload)
        missing.push('el mensaje firmado no es "<timestamp>.<cuerpo crudo>"');
      if (!manual.tolerance)
        missing.push("no controla la tolerancia de la marca de tiempo (300 s)");
      if (!manual.constantTime)
        missing.push(
          "no compara en tiempo constante (timingSafeEqual / hmac.compare_digest)",
        );
      return missing.length
        ? fail(`HMAC manual incompleto en ${manual.file.path}:`, missing)
        : pass(`HMAC manual correcto en ${manual.file.path}.`);
    }
    return fail(
      `El endpoint (${handlers.join(", ")}) no verifica la firma MiRotaract-Signature.`,
    );
  },
};
