/**
 * Tokens never in localStorage/sessionStorage (nor SharedPreferences on
 * mobile): JS/TS via the AST, Python/Dart/HTML (inline scripts, templates)
 * via patterns.
 */
import { calls, ts, walk, parse } from "../ast.js";
import { codeFiles, stripComments } from "../files.js";
import { at, fail, lineOf, pass, TOKENISH } from "./result.js";

const STORAGE =
  /^(window\.|globalThis\.|self\.)?(localStorage|sessionStorage)$/;

export default {
  id: "no-web-storage-tokens",
  title: "Tokens fuera de localStorage/sessionStorage",
  critical: true,
  grade({ solution }) {
    const problems = [];
    for (const file of codeFiles(solution)) {
      if (file.lang === "ts" || file.lang === "js") {
        for (const c of calls(file)) {
          if (!c.name) continue;
          const [obj, method] = [
            c.name.slice(0, c.name.lastIndexOf(".")),
            c.name.slice(c.name.lastIndexOf(".") + 1),
          ];
          if (
            STORAGE.test(obj) &&
            method === "setItem" &&
            TOKENISH.test(c.args.join(" "))
          )
            problems.push(
              `${lineOf(file, c.node, c.sf)}: ${c.name}(${c.args.join(", ")})`,
            );
        }
        const sf = parse(file);
        walk(sf, (node) => {
          // localStorage.token = …  /  localStorage["id_token"] = …
          if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken
          ) {
            const left = node.left;
            if (
              (ts.isPropertyAccessExpression(left) ||
                ts.isElementAccessExpression(left)) &&
              STORAGE.test(left.expression.getText(sf)) &&
              TOKENISH.test(left.getText(sf) + node.right.getText(sf))
            )
              problems.push(
                `${lineOf(file, node, sf)}: ${node.getText(sf).slice(0, 120)}`,
              );
          }
        });
      } else {
        const code = file.lang === "py" ? file.content : stripComments(file); // Python: storage calls live inside HTML/JS strings
        for (const m of code.matchAll(
          /(localStorage|sessionStorage)\s*(\.\s*setItem\s*\(([^)]*)\)|\[[^\]]*\]\s*=|\.\w+\s*=)/g,
        ))
          if (TOKENISH.test(m[0]))
            problems.push(`${at(file, m.index)}: ${m[0].slice(0, 120)}`);
        if (file.lang === "dart")
          for (const m of code.matchAll(
            /\.set(String|StringList)\s*\(\s*([^,]+),/g,
          ))
            if (/SharedPreferences|prefs/i.test(code) && TOKENISH.test(m[2]))
              problems.push(
                `${at(file, m.index)}: SharedPreferences con un token (usá flutter_secure_storage)`,
              );
      }
    }
    return problems.length
      ? fail(
          "Tokens guardados en almacenamiento del navegador/dispositivo legible por scripts:",
          problems,
        )
      : pass("No se guardan tokens en localStorage/sessionStorage.");
  },
};
