/**
 * Tokens verified against the JWKS with issuer, audience and algorithm
 * pinned (ES256), and the nonce checked on login. The official SDKs do all
 * of it; a manual implementation must too. Decoding without verifying fails.
 */
import { calls, imports, objectProps, ts } from "../ast.js";
import { pyFiles, stripComments, tsFiles } from "../files.js";
import { at, fail, lineOf, pass } from "./result.js";

const SDK_AUTH = [
  "MiRotaractAuth",
  "createMiRotaractNext",
  "requireMiRotaractUser",
];

export function analyzeTs(file) {
  const out = {
    sdk: false,
    manualOk: [],
    problems: [],
    usesNonce: /nonce/.test(stripComments(file)),
  };
  const imps = imports(file);
  const sdkImport = imps.find(
    (i) =>
      /^@mirotaract\/sdk(\/(next|express))?$/.test(i.from) &&
      i.names.some((n) => SDK_AUTH.includes(n)),
  );
  if (sdkImport) out.sdk = true;
  const joseNames = new Set(
    imps.filter((i) => i.from === "jose").flatMap((i) => i.names),
  );
  const jwtLib = imps
    .filter((i) => i.from === "jsonwebtoken")
    .flatMap((i) => i.names);
  for (const c of calls(file)) {
    if (!c.name) continue;
    if (
      c.name === "decodeJwt" ||
      c.name.endsWith(".decodeJwt") ||
      (c.name === "jwt.decode" && jwtLib.length) ||
      c.name === "jwtDecode"
    )
      out.problems.push(
        `${lineOf(file, c.node, c.sf)}: ${c.name}() decodifica sin verificar la firma`,
      );
    if (c.name === "jwt.verify" && jwtLib.length) {
      const opts = objectProps(c.node.arguments?.[2], c.sf) ?? {};
      if (
        !opts.algorithms ||
        !/ES256/.test(opts.algorithms) ||
        !opts.issuer ||
        !opts.audience
      )
        out.problems.push(
          `${lineOf(file, c.node, c.sf)}: jwt.verify sin algorithms ES256, issuer y audience`,
        );
      else out.manualOk.push(lineOf(file, c.node, c.sf));
    }
    if (
      c.name === "jwtVerify" ||
      (c.name.endsWith(".jwtVerify") && joseNames.size)
    ) {
      const opts = objectProps(c.node.arguments?.[2], c.sf);
      const missing = [];
      if (!opts) missing.push("opciones");
      else {
        if (!opts.issuer) missing.push("issuer");
        if (!opts.audience) missing.push("audience");
        if (
          !opts.algorithms ||
          !/["'`]ES256["'`]/.test(opts.algorithms) ||
          /HS256|none/i.test(opts.algorithms)
        )
          missing.push('algorithms: ["ES256"]');
      }
      const keyArg = c.node.arguments?.[1]?.getText(c.sf) ?? "";
      const usesJwks =
        /createRemoteJWKSet|jwks/i.test(keyArg) ||
        joseNames.has("createRemoteJWKSet");
      if (!usesJwks) missing.push("clave del JWKS (createRemoteJWKSet)");
      if (missing.length)
        out.problems.push(
          `${lineOf(file, c.node, c.sf)}: jwtVerify sin ${missing.join(", ")}`,
        );
      else out.manualOk.push(lineOf(file, c.node, c.sf));
    }
    if (
      (c.name.endsWith("exchangeCode") || c.name.endsWith("exchange_code")) &&
      out.sdk
    ) {
      const props = objectProps(c.node.arguments?.[0], c.sf);
      if (props && !("nonce" in props))
        out.problems.push(
          `${lineOf(file, c.node, c.sf)}: exchangeCode sin nonce (no se valida el nonce del id_token)`,
        );
    }
  }
  // Manual base64 decoding of a JWT payload (split(".")[1] + atob/Buffer).
  const code = stripComments(file);
  for (const m of code.matchAll(
    /\.split\(\s*["'`]\.["'`]\s*\)\s*\[\s*1\s*\]/g,
  )) {
    const around = code.slice(Math.max(0, m.index - 200), m.index + 200);
    if (/atob|base64|Buffer\.from/.test(around) && /token|jwt/i.test(around))
      out.problems.push(
        `${at(file, m.index)}: decodifica el payload del JWT a mano, sin verificar`,
      );
  }
  return out;
}

export function analyzePy(file) {
  const code = stripComments(file);
  const out = {
    sdk: /from\s+mirotaract(\.fastapi)?\s+import\s+[^\n]*(MiRotaractAuth|AsyncMiRotaractAuth|require_user)/.test(
      code,
    ),
    manualOk: [],
    problems: [],
    usesNonce: /nonce/.test(code),
  };
  for (const m of code.matchAll(/jwt\.decode\s*\(([\s\S]*?)\)\s*(?:\n|$)/g)) {
    const args = m[1];
    if (/verify_signature["']?\s*[:=]\s*False|verify\s*=\s*False/.test(args))
      out.problems.push(
        `${at(file, m.index)}: jwt.decode sin verificar la firma`,
      );
    else if (
      !/algorithms\s*=\s*\[\s*["']ES256["']\s*\]/.test(args) ||
      !/audience\s*=/.test(args) ||
      !/issuer\s*=/.test(args)
    )
      out.problems.push(
        `${at(file, m.index)}: jwt.decode sin algorithms=["ES256"], audience e issuer`,
      );
    else if (!/PyJWKClient|jwks/i.test(code))
      out.problems.push(
        `${at(file, m.index)}: la clave no sale del JWKS (PyJWKClient)`,
      );
    else out.manualOk.push(at(file, m.index));
  }
  for (const m of code.matchAll(/split\(\s*["']\.["']\s*\)\s*\[\s*1\s*\]/g)) {
    const around = code.slice(Math.max(0, m.index - 200), m.index + 200);
    if (/b64decode|base64/.test(around))
      out.problems.push(
        `${at(file, m.index)}: decodifica el payload del JWT a mano, sin verificar`,
      );
  }
  if (
    /exchange_code\(/.test(code) &&
    out.sdk &&
    !/exchange_code\([^)]*nonce\s*=/.test(code)
  )
    out.problems.push(`${file.path}: exchange_code sin nonce=`);
  return out;
}

export default {
  id: "jwks-verification",
  title: "Tokens verificados con el JWKS (iss, aud, alg)",
  critical: true,
  grade({ solution }) {
    const results = [
      ...tsFiles(solution)
        .filter((f) => !f.client)
        .map(analyzeTs),
      ...pyFiles(solution).map(analyzePy),
    ];
    const clientDecode = tsFiles(solution)
      .filter((f) => f.client)
      .flatMap((f) =>
        analyzeTs(f).problems.map((p) => `${p} (en código de cliente)`),
      );
    const problems = [...results.flatMap((r) => r.problems), ...clientDecode];
    const sdk = results.some((r) => r.sdk);
    const manual = results.flatMap((r) => r.manualOk);
    if (problems.length)
      return fail("Verificación de tokens insuficiente:", problems);
    if (sdk)
      return pass(
        "Usa el SDK oficial (verifica firma ES256 contra el JWKS, iss, aud, exp y nonce).",
      );
    if (manual.length) {
      if (!results.some((r) => r.usesNonce))
        return fail("Verifica la firma pero no compara el nonce del id_token.");
      return pass("Verificación manual correcta:", manual);
    }
    return fail(
      "No encontré verificación del id_token: ni el SDK (MiRotaractAuth / createMiRotaractNext) ni jwtVerify/jwt.decode con JWKS, issuer, audience y ES256.",
    );
  },
};

export { ts };
