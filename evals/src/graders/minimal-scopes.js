/**
 * Minimal scopes: the scopes the solution requests (login and service token)
 * must be a subset of what the task needs, include the required ones, and
 * never the contact scope unless the task needs it.
 */
import { parse, ts, walk } from "../ast.js";
import { codeFiles, stringLiterals, stripComments } from "../files.js";
import { fail, pass } from "./result.js";

export const OIDC = ["openid", "profile", "email", "memberships", "positions"];
const SDK_LOGIN_DEFAULT = ["openid", "profile", "email"];

export function extractScopes(solution) {
  const oidc = new Set();
  const service = new Set();
  let sdkLogin = false;
  let serviceClient = false;
  for (const file of codeFiles(solution)) {
    const code = stripComments(file);
    if (/MiRotaractAuth|createMiRotaractNext|AsyncMiRotaractAuth|authorizeAndExchangeCode|AuthorizationTokenRequest/.test(code)) sdkLogin = true;
    if (/new\s+MiRotaract\s*\(|\bAsyncMiRotaract\s*\(|\bMiRotaract\s*\(|client_credentials/.test(code)) serviceClient = true;
    for (const literal of stringLiterals(file)) {
      for (const token of literal.split(/[\s,]+/)) if (/^kernel\.service\.[a-z.]+[a-z]$/.test(token)) service.add(token);
      const words = literal.split(/\s+/);
      if (words.includes("openid")) for (const w of words) if (OIDC.includes(w)) oidc.add(w);
    }
    // Lists where one element is "openid": ['openid', 'profile'] (TS/JS AST; Python/Dart regex)
    if (file.lang === "ts" || file.lang === "js") {
      const sf = parse(file);
      walk(sf, (node) => {
        if (ts.isArrayLiteralExpression(node)) {
          const items = node.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
          if (items.includes("openid")) for (const i of items) if (OIDC.includes(i)) oidc.add(i);
        }
      });
    } else
      for (const m of code.matchAll(/\[([^\]]*["']openid["'][^\]]*)\]/g))
        for (const s of m[1].matchAll(/["']([a-z]+)["']/g)) if (OIDC.includes(s[1])) oidc.add(s[1]);
  }
  const loginDefaulted = sdkLogin && oidc.size === 0;
  if (loginDefaulted) for (const s of SDK_LOGIN_DEFAULT) oidc.add(s);
  return { oidc: [...oidc].sort(), service: [...service].sort(), sdkLogin, serviceClient, loginDefaulted };
}

export default {
  id: "minimal-scopes",
  title: "Scopes mínimos",
  critical: true,
  grade({ solution, options = {} }) {
    const { required = [], allowed = [], requireExplicitServiceScope = false } = options;
    const found = extractScopes(solution);
    const requested = [...found.oidc, ...found.service];
    const problems = [];
    const extra = requested.filter((s) => !allowed.includes(s));
    if (extra.length) problems.push(`Pide scopes que la tarea no necesita: ${extra.join(", ")} (permitidos: ${allowed.join(", ")}).`);
    const missing = required.filter((s) => !requested.includes(s));
    if (missing.length) problems.push(`Faltan scopes necesarios: ${missing.join(", ")}.`);
    if (requested.includes("kernel.service.persons.contact.read") && !allowed.includes("kernel.service.persons.contact.read"))
      problems.push("kernel.service.persons.contact.read sin que la tarea lo necesite.");
    if (requireExplicitServiceScope && found.serviceClient && !found.service.length)
      problems.push("El token de servicio se pide sin `scope`: trae todos los scopes de la app. Pedí solo los que usa este proceso.");
    if (!requested.length && (required.length || requireExplicitServiceScope)) problems.push("No encontré qué scopes se piden.");
    const summary = `Pedidos: ${requested.join(", ") || "(ninguno)"}${found.loginDefaulted ? " (login con el scope por defecto del SDK)" : ""}.`;
    return problems.length ? fail(summary, problems) : pass(summary);
  },
};
