/**
 * Reads a solution directory into { path, content, lang, client } records and
 * offers language-aware helpers (comment stripping, string literals) that the
 * graders share.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";

const SKIP_DIRS = new Set(["node_modules", ".next", ".venv", "venv", "dist", "build", ".git", "__pycache__", ".dart_tool", ".turbo", "coverage"]);
const LANGS = { ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".py": "py", ".dart": "dart", ".html": "html", ".json": "json" };

function walk(dir, root = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, root, out);
    else if (stat.size < 512 * 1024) out.push(relative(root, path).split("\\").join("/"));
  }
  return out;
}

/** True for code that ends up in a browser or a phone. */
export function isClientFile(path, content) {
  if (/\.dart$/.test(path) || /\.html?$/.test(path)) return true;
  if (/^(public|static)\//.test(path)) return true;
  if (/\.(t|j)sx?$/.test(path) && /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use client["']/.test(content)) return true;
  return false;
}

export function readSolution(dir) {
  if (!existsSync(dir)) throw new Error(`No existe la carpeta de la solución: ${dir}`);
  const files = [];
  const env = [];
  for (const path of walk(dir)) {
    const name = path.split("/").pop();
    const content = readFileSync(join(dir, path), "utf8");
    if (/^\.env(\..+)?$/.test(name) || name === ".gitignore") {
      env.push({ path, content });
      continue;
    }
    const lang = LANGS[extname(path)];
    if (!lang) continue;
    files.push({ path, content, lang, client: isClientFile(path, content) });
  }
  return { dir, files, env };
}

export const codeFiles = (solution) => solution.files.filter((f) => ["ts", "js", "py", "dart", "html"].includes(f.lang));
export const tsFiles = (solution) => solution.files.filter((f) => f.lang === "ts" || f.lang === "js");
export const pyFiles = (solution) => solution.files.filter((f) => f.lang === "py");

/** Source without comments (strings kept), per language. */
export function stripComments(file) {
  if (file.lang === "ts" || file.lang === "js" || file.lang === "dart") {
    if (file.lang === "dart") return file.content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, file.path.endsWith("x") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, file.content);
    let out = "";
    let kind;
    while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
      if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) out += " ";
      else out += scanner.getTokenText();
    }
    return out;
  }
  if (file.lang === "py") return pythonStrip(file.content).code;
  if (file.lang === "html") return file.content.replace(/<!--[\s\S]*?-->/g, " ");
  return file.content;
}

/** Python: code without comments, plus every string literal. */
export function pythonStrip(source) {
  const strings = [];
  let code = "";
  const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|[rbfuRBFU]{0,2}"(?:\\.|[^"\\\n])*"|[rbfuRBFU]{0,2}'(?:\\.|[^'\\\n])*'|#[^\n]*)/g;
  let last = 0;
  for (const match of source.matchAll(re)) {
    code += source.slice(last, match.index);
    const token = match[0];
    if (token.startsWith("#")) code += " ";
    else {
      code += token;
      strings.push(token.replace(/^[rbfuRBFU]{0,2}("""|'''|"|')/, "").replace(/("""|'''|"|')$/, ""));
    }
    last = match.index + token.length;
  }
  code += source.slice(last);
  return { code, strings };
}

/** Every string literal (TS/JS via the compiler, Python/Dart via regex). */
export function stringLiterals(file) {
  if (file.lang === "ts" || file.lang === "js") {
    const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const out = [];
    const visit = (node) => {
      if (ts.isStringLiteralLike(node)) out.push(node.text);
      else if (ts.isTemplateExpression(node)) out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
  }
  if (file.lang === "py") return pythonStrip(file.content).strings;
  return [...stripComments(file).matchAll(/"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'/g)].map((m) => m[1] ?? m[2]);
}

/** Is `name` ignored by this .gitignore text? (simple patterns) */
export function gitIgnores(gitignore, name) {
  return gitignore
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .some((p) => {
      const pattern = p.replace(/^\//, "");
      if (pattern === name) return true;
      if (pattern.includes("*")) return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(name);
      return false;
    });
}
