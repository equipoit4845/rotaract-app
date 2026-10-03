/**
 * Secrets only in the server's environment: never hardcoded, never in
 * client code (React "use client", public/, Flutter, HTML), never behind
 * NEXT_PUBLIC_, and .env.local never committable.
 */
import { imports } from "../ast.js";
import { codeFiles, gitIgnores, stripComments } from "../files.js";
import { at, fail, pass } from "./result.js";

const SECRET_NAMES = /MIROTARACT_CLIENT_SECRET|MIROTARACT_WEBHOOK_SECRET|SESSION_SECRET|clientSecret|client_secret|webhookSecret/;
const LITERAL_SECRET = /\b(mrs_[A-Za-z0-9_-]{16,}|whsec_[A-Za-z0-9_-]{16,})\b/g;
const isPlaceholder = (s) => /^(mrs|whsec)_(x+|\.\.\.|<.*>|tu_|your_|example|changeme)/i.test(s) || /^(mrs|whsec)_x{6,}/i.test(s);

export default {
  id: "no-client-secrets",
  title: "Secretos solo en el servidor",
  critical: true,
  grade({ solution }) {
    const problems = [];
    for (const file of codeFiles(solution)) {
      const code = stripComments(file);
      for (const m of code.matchAll(LITERAL_SECRET)) if (!isPlaceholder(m[1])) problems.push(`${at(file, m.index)}: secreto escrito en el código (${m[1].slice(0, 8)}…)`);
      for (const m of code.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|KEY)[A-Z0-9_]*/g)) problems.push(`${at(file, m.index)}: ${m[0]} se publica en el navegador`);
      if (file.client) {
        const m = code.match(SECRET_NAMES);
        if (m) problems.push(`${at(file, m.index)}: código de cliente (${file.lang === "dart" ? "app móvil" : "navegador"}) usa ${m[0]}`);
        if (file.lang === "ts" || file.lang === "js")
          for (const imp of imports(file))
            if (/^@mirotaract\/sdk$/.test(imp.from) && imp.names.includes("MiRotaract")) problems.push(`${file.path}: un componente de cliente importa el cliente de servicio MiRotaract (necesita el secreto)`);
      }
    }
    for (const file of solution.files.filter((f) => f.lang === "json" && !/(^|\/)package-lock\.json$/.test(f.path)))
      for (const m of file.content.matchAll(LITERAL_SECRET)) if (!isPlaceholder(m[1])) problems.push(`${at(file, m.index)}: secreto escrito en ${file.path} (${m[1].slice(0, 8)}…)`);
    for (const env of solution.env) {
      const name = env.path.split("/").pop();
      if (name === ".gitignore" || name.endsWith(".example") || name.endsWith(".sample")) continue;
      const hasSecret = /(SECRET|PASSWORD)\s*=\s*\S+/.test(env.content);
      const gitignore = solution.env.find((e) => e.path === ".gitignore")?.content ?? "";
      if (hasSecret && !gitIgnores(gitignore, name)) problems.push(`${env.path} tiene secretos y no está en .gitignore`);
      for (const m of env.content.matchAll(/^NEXT_PUBLIC_[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|KEY)[A-Z0-9_]*\s*=/gm)) problems.push(`${env.path}: ${m[0].replace(/=$/, "")} se publica en el navegador`);
    }
    return problems.length ? fail("Secretos expuestos:", problems) : pass("Los secretos se leen solo de variables de entorno del servidor.");
  },
};
